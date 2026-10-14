"""RQ execution with durable SQL checkpoints and a SQL-backed dispatch/recovery loop."""
import hashlib
import json
import logging
from collections import Counter
from contextlib import contextmanager
from datetime import date, timedelta
from uuid import UUID, uuid4

from redis.exceptions import RedisError
from rq import Queue
from rq.job import Job
from rq.exceptions import NoSuchJobError
from rq.serializers import JSONSerializer
from sqlalchemy import select, text, insert

import app.models  # Register shared FK targets before worker queries.
from app.admin.models import Qualification
from app.core import audit
from app.core.config import get_settings
from app.core.db import get_engine, get_sessionmaker
from app.core.redis_client import get_redis, key
from app.core.security import utcnow
from .files import path_for, read_records, write_export, new_key
from .models import ImportJob, ImportRecord, ImportRecordError, Recruit, ExportJob
from .validation import validate_row

logger = logging.getLogger(__name__)
IMPORT_TERMINAL = {"READY_FOR_REVIEW", "APPROVED", "CANCELLED", "FAILED"}


def queue():
    return Queue(get_settings().queue_name, connection=get_redis(), serializer=JSONSerializer)


def snapshot(job: ImportJob):
    return {"id": str(job.id), "status": job.status, "total_rows": job.total_rows,
            "processed_rows": job.processed_rows, "valid_rows": job.valid_rows,
            "invalid_rows": job.invalid_rows, "version": job.progress_version,
            "retry_count": job.retry_count, "last_error": job.last_error}


def publish(job: ImportJob):
    # Events are hints. SQL is authoritative, including after a Redis outage.
    try:
        get_redis().publish(key(f"import:{job.id}:progress"), json.dumps(snapshot(job)))
    except RedisError:
        logger.warning("Progress notification unavailable; committed SQL snapshot remains readable")


def locked(statement, db):
    if db.bind.dialect.name == "mssql":
        model = statement.column_descriptions[0]["entity"]
        return statement.with_hint(model, "WITH (UPDLOCK, HOLDLOCK)", dialect_name="mssql")
    return statement.with_for_update()


@contextmanager
def worker_lock(resource: str, wait_ms: int = 0):
    # Session-owned SQL lock survives transaction commits and is released on process/connection death.
    # This prevents simultaneous attempts even if queue delivery is duplicated.
    with get_engine().connect() as connection:
        if connection.dialect.name != "mssql":
            yield True
            return
        result = connection.execute(text("""DECLARE @r int;
EXEC @r = sys.sp_getapplock @Resource=:resource, @LockMode='Exclusive', @LockOwner='Session', @LockTimeout=:wait;
SELECT @r;"""), {"resource": resource, "wait": wait_ms}).scalar()
        connection.commit()
        try:
            yield result >= 0
        finally:
            if result >= 0:
                connection.execute(text("EXEC sys.sp_releaseapplock @Resource=:resource, @LockOwner='Session'"), {"resource": resource})
                connection.commit()


def _failure(model, job_id, exc):
    logger.exception("Background operation failed: %s", job_id)
    with get_sessionmaker()() as db:
        job = db.get(model, job_id)
        if job is None:
            return
        # Keep diagnostics in server logs; don't expose SQL paths, credentials or personal data.
        job.last_error = "تعذر معالجة الملف. راجع بنيته ومتطلبات قارئ الملفات وسجل الخادم."
        if isinstance(exc, (ValueError, UnicodeError)):
            job.last_error = "الملف غير صالح أو تجاوز حدود المعالجة. راجع الأعمدة ونوع الملف."
        job.status = "FAILED" if job.retry_count >= get_settings().job_max_attempts or isinstance(exc, (ValueError, UnicodeError)) else "QUEUED"
        job.heartbeat_at = utcnow()
        if model is ImportJob:
            job.progress_version += 1
        audit.write(db, action="job_failed" if job.status == "FAILED" else "job_retry",
                    entity=model.__tablename__, entity_id=str(job.id), new_values={"status": job.status, "attempt": job.retry_count})
        db.commit()
        if model is ImportJob:
            publish(job)


def process_import(job_id: str):
    job_id = UUID(job_id)
    with worker_lock(f"poc-import-{job_id}", wait_ms=5000) as acquired:
        if not acquired:
            return
        try:
            with get_sessionmaker()() as db:
                job = db.scalar(locked(select(ImportJob).where(ImportJob.id == job_id), db))
                if job is None or job.status in IMPORT_TERMINAL:
                    return
                job.retry_count += 1
                job.status = "PARSING"
                job.started_at = job.started_at or utcnow()
                job.heartbeat_at = utcnow()
                job.last_error = None
                job.progress_version += 1
                db.commit()
                publish(job)
                path = path_for(job.storage_key)
                with path.open("rb") as uploaded:
                    digest = hashlib.file_digest(uploaded, "sha256").hexdigest()
                if digest != job.file_sha256:
                    raise ValueError("UPLOADED_FILE_CHANGED")
                rows = read_records(path)
                counts = Counter(str(row.get("national_id") or "").strip() for row in rows)
                first = {}
                for index, row in enumerate(rows, 1):
                    first.setdefault(str(row.get("national_id") or "").strip(), index)
                qualifications = set(db.scalars(select(Qualification.id).where(Qualification.is_active == True)))
                job.total_rows = len(rows)
                job.status = "VALIDATING"
                job.progress_version += 1
                job.heartbeat_at = utcnow()
                db.commit()
                publish(job)
                for offset in range(job.checkpoint_row, len(rows), 250):
                    chunk = rows[offset:offset + 250]
                    nids = [str(r.get("national_id") or "").strip() for r in chunk]
                    existing = set(db.scalars(select(Recruit.national_id).where(Recruit.national_id.in_(nids))))
                    batch_valid = batch_invalid = 0
                    staged = []
                    row_errors = []
                    for number, raw in enumerate(chunk, offset + 1):
                        nid = str(raw.get("national_id") or "").strip()
                        duplicate = counts[nid] > 1 and (job.duplicate_policy == "reject_all" or first[nid] != number)
                        parsed, errors = validate_row(raw, existing, duplicate, qualifications)
                        record_id = uuid4()
                        record = dict(id=record_id, import_job_id=job.id, row_number=number,
                            source_record_id=str(raw.get("id") or "")[:100], raw_data_json=json.dumps(raw, ensure_ascii=False),
                            national_id_raw=str(raw.get("national_id") or ""),
                            normalized_national_id=nid if len(nid) == 14 else None,
                            parsed_data_json=json.dumps(parsed, ensure_ascii=False), parsed_type_id=parsed["type_id"],
                            validation_status="INVALID" if errors else "VALID")
                        staged.append(record)
                        row_errors.extend(dict(id=uuid4(), import_row_id=record_id, **error) for error in errors)
                        batch_invalid += bool(errors)
                        batch_valid += not bool(errors)
                    db.execute(insert(ImportRecord), staged)
                    if row_errors:
                        db.execute(insert(ImportRecordError), row_errors)
                    job.invalid_rows += batch_invalid
                    job.valid_rows += batch_valid
                    job.processed_rows = offset + len(chunk)
                    job.checkpoint_row = job.processed_rows
                    job.heartbeat_at = utcnow()
                    job.progress_version += 1
                    # Staged rows, errors, counters and checkpoint commit together.
                    db.commit()
                    publish(job)
                job.status = "READY_FOR_REVIEW"
                job.completed_at = utcnow()
                job.progress_version += 1
                audit.write(db, action="validation_complete", entity="import_job", entity_id=str(job.id),
                            user_id=job.uploaded_by_user_id, new_values=snapshot(job))
                db.commit()
                publish(job)
        except Exception as exc:
            _failure(ImportJob, job_id, exc)
            raise


def process_export(job_id: str):
    job_id = UUID(job_id)
    with worker_lock(f"poc-export-{job_id}", wait_ms=5000) as acquired:
        if not acquired:
            return
        output = None
        try:
            with get_sessionmaker()() as db:
                job = db.scalar(locked(select(ExportJob).where(ExportJob.id == job_id), db))
                if job is None or job.status in {"COMPLETED", "FAILED"}:
                    return
                job.retry_count += 1
                job.status = "PROCESSING"
                job.heartbeat_at = utcnow()
                db.commit()
                rows = []
                records = db.scalars(select(ImportRecord).where(ImportRecord.import_job_id == job.import_job_id,
                            ImportRecord.validation_status == "INVALID").order_by(ImportRecord.row_number)).all()
                error_rows = db.execute(select(ImportRecordError.import_row_id, ImportRecordError.error_message)
                    .join(ImportRecord, ImportRecord.id == ImportRecordError.import_row_id)
                    .where(ImportRecord.import_job_id == job.import_job_id)).all()
                errors = {}
                for record_id, message in error_rows:
                    errors.setdefault(record_id, []).append(message)
                source_headers = {h for record in records for h in json.loads(record.raw_data_json)}
                original_reasons = "source_rejection_reasons"
                while original_reasons in source_headers:
                    original_reasons = "source_" + original_reasons
                for record in records:
                    raw = json.loads(record.raw_data_json)
                    # Preserve even a source column called rejection_reasons.
                    if "rejection_reasons" in raw:
                        raw[original_reasons] = raw.pop("rejection_reasons")
                    raw["rejection_reasons"] = " | ".join(errors.get(record.id, []))
                    rows.append(raw)
                storage_key = new_key("exports", "." + job.export_format)
                output = path_for(storage_key)
                output.parent.mkdir(parents=True, exist_ok=True)
                write_export(output, rows)
                job.storage_key = storage_key
                job.status = "COMPLETED"
                job.completed_at = utcnow()
                job.last_error = None
                audit.write(db, action="export_complete", user_id=job.requested_by_user_id,
                            entity="export_job", entity_id=str(job.id), new_values={"format": job.export_format, "rows": len(rows)})
                db.commit()
        except Exception as exc:
            if output:
                output.unlink(missing_ok=True)
            _failure(ExportJob, job_id, exc)
            raise


def dispatch_pending():
    """SQL jobs are the durable outbox; retry after enqueue failure or abandoned RQ executions.

    Call repeatedly from the worker supervisor. A committed upload never depends on a single
    successful enqueue. RQ state and SQL application locks prevent overlapping attempts.
    """
    for model, function, terminal in ((ImportJob, process_import, IMPORT_TERMINAL),
                                      (ExportJob, process_export, {"COMPLETED", "FAILED"})):
        with get_sessionmaker()() as db:
            ids = list(db.scalars(select(model.id).where(model.status.not_in(terminal))))
        for job_id in ids:
            kind = "import" if model is ImportJob else "export"
            with worker_lock(f"poc-{kind}-{job_id}") as acquired:
                if not acquired:
                    continue
                with get_sessionmaker()() as db:
                    item = db.get(model, job_id)
                    if item.status in terminal:
                        continue
                    if item.rq_job_id:
                        try:
                            rq_job = Job.fetch(item.rq_job_id, connection=get_redis(), serializer=JSONSerializer)
                            state = rq_job.get_status(refresh=True)
                            if state in {"queued", "deferred", "scheduled"}:
                                continue
                            if state == "started":
                                last_seen = item.heartbeat_at or item.created_at
                                if utcnow() - last_seen < timedelta(seconds=get_settings().job_timeout_seconds + 60):
                                    continue
                                # We hold the SQL worker lock: a stale RQ owner cannot still be writing.
                            attempt = int(item.rq_job_id.rsplit("-", 1)[-1])
                            if attempt > item.retry_count:
                                # Also bound failures that happen before the job function starts.
                                item.retry_count = attempt
                        except NoSuchJobError:
                            pass
                    if item.retry_count >= get_settings().job_max_attempts:
                        item.status = "FAILED"
                        item.last_error = "تجاوزت العملية عدد محاولات المعالجة المسموح"
                        if model is ImportJob:
                            item.progress_version += 1
                        db.commit()
                        if model is ImportJob:
                            publish(item)
                        continue
                    identity = f"{model.__tablename__}-{item.id}-{item.retry_count + 1}"
                    item.rq_job_id = identity
                    db.commit()  # Enqueue may fail; the next dispatcher tick retries this same identity.
                    q = queue()
                    if not q.fetch_job(identity):
                        q.enqueue(function, str(item.id), job_id=identity,
                                  job_timeout=get_settings().job_timeout_seconds,
                                  result_ttl=86400, failure_ttl=86400)
