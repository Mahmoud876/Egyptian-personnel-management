"""RQ execution with durable SQL checkpoints and a SQL-backed dispatch/recovery loop."""
import hashlib
import json
import logging
from collections import Counter
from contextlib import contextmanager, closing
from itertools import batched, islice
from time import monotonic
from datetime import date, timedelta
from uuid import UUID, uuid4

from redis.exceptions import RedisError
from rq import Queue
from rq.job import Job
from rq.exceptions import NoSuchJobError
from rq.serializers import JSONSerializer
from sqlalchemy import select, text, insert, update, delete, func, literal_column

import app.models  # Register shared FK targets before worker queries.
from app.admin.models import Qualification
from app.core import audit
from app.core.config import get_settings
from app.core.db import get_engine, get_sessionmaker
from app.core.redis_client import get_redis, key
from app.core.security import utcnow
from app.core.models import AuditLog
from .files import path_for, iter_records, write_export, new_key
from .models import ImportJob, ImportRecord, ImportRecordError, Recruit, ExportJob
from .validation import validate_row, readable_error, FIELD_LABELS, FIELDS

logger = logging.getLogger(__name__)
IMPORT_TERMINAL = {"READY_FOR_REVIEW", "APPROVED", "CANCELLED", "FAILED"}


def queue(kind="import"):
    name = get_settings().queue_name
    if kind == "export":
        name += ":exports"
    elif kind != "import":
        raise ValueError("Unknown job kind")
    return Queue(name, connection=get_redis(), serializer=JSONSerializer)


def snapshot(job: ImportJob):
    return {"id": str(job.id), "status": job.status, "total_rows": job.total_rows,
            "parsed_rows": job.parsed_rows, "validation_run": job.validation_run,
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
        job.next_dispatch_check_at = utcnow() + timedelta(seconds=get_settings().recovery_interval_seconds)
        if model is ImportJob:
            job.progress_version += 1
        audit.write(db, action="job_failed" if job.status == "FAILED" else "job_retry",
                    entity=model.__tablename__, entity_id=str(job.id), new_values={"status": job.status, "attempt": job.retry_count})
        db.commit()
        if model is ImportJob:
            publish(job)


def source_records(db, job):
    """Bounded streaming for both immutable uploads and frozen correction snapshots."""
    if job.validation_run:
        last = 0
        while True:
            rows = db.execute(select(ImportRecord.id, ImportRecord.row_number, ImportRecord.raw_data_json,
                ImportRecord.corrected_data_json).where(ImportRecord.import_job_id == job.id,
                    ImportRecord.row_number > last).order_by(ImportRecord.row_number).limit(250)).all()
            if not rows:
                return
            for record in rows:
                last = record.row_number
                yield record.id, json.loads(record.corrected_data_json or record.raw_data_json)
    else:
        with closing(iter_records(path_for(job.storage_key))) as records:
            for raw in records:
                yield None, raw


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
                job.next_dispatch_check_at = utcnow() + timedelta(seconds=get_settings().recovery_interval_seconds)
                job.retry_count += 1
                job.status = "PARSING"
                job.parsed_rows = 0
                job.started_at = job.started_at or utcnow()
                job.heartbeat_at = utcnow()
                job.last_error = None
                job.progress_version += 1
                db.commit()
                publish(job)
                if not job.validation_run:
                    path = path_for(job.storage_key)
                    with path.open("rb") as uploaded:
                        digest = hashlib.file_digest(uploaded, "sha256").hexdigest()
                    if digest != job.file_sha256:
                        raise ValueError("UPLOADED_FILE_CHANGED")
                # Discover/count IDs first so duplicates in later batches invalidate earlier rows too.
                # Only identifiers are retained; raw records are streamed again for evaluation.
                expected = job.total_rows
                counts = Counter()
                first = {}
                found = 0
                last_publish = monotonic()
                with closing(source_records(db, job)) as records:
                    for found, (_, raw) in enumerate(records, 1):
                        if found > get_settings().import_max_rows:
                            raise ValueError("ROW_LIMIT_EXCEEDED")
                        nid = str(raw.get("national_id") or "").strip()
                        counts[nid] += 1
                        first.setdefault(nid, found)
                        if found % 250 == 0 or monotonic() - last_publish >= 1:
                            job.parsed_rows = found
                            job.total_rows = max(job.total_rows, found)
                            job.heartbeat_at = utcnow()
                            job.progress_version += 1
                            db.commit()
                            publish(job)
                            last_publish = monotonic()
                if (job.validation_run and found != expected) or found < job.checkpoint_row:
                    raise ValueError("INCOMPLETE_STAGING")
                job.parsed_rows = found
                job.total_rows = found
                job.progress_version += 1
                job.heartbeat_at = utcnow()
                db.commit()
                publish(job)
                qualifications = set(db.scalars(select(Qualification.id).where(Qualification.is_active == True)))
                job.status = "VALIDATING"
                job.progress_version += 1
                job.heartbeat_at = utcnow()
                db.commit()
                publish(job)
                with closing(source_records(db, job)) as records:
                    for chunk in batched(islice(records, job.checkpoint_row, None), 250):
                        offset = job.checkpoint_row
                        nids = [str(r.get("national_id") or "").strip() for _, r in chunk]
                        existing = set(db.scalars(select(Recruit.national_id).where(Recruit.national_id.in_(nids))))
                        batch_valid = batch_invalid = 0
                        staged = []
                        row_errors = []
                        for number, (source_id, raw) in enumerate(chunk, offset + 1):
                            nid = str(raw.get("national_id") or "").strip()
                            duplicate = counts[nid] > 1 and (job.duplicate_policy == "reject_all" or first[nid] != number)
                            parsed, errors = validate_row(raw, existing, duplicate, qualifications)
                            record_id = source_id if job.validation_run else uuid4()
                            record = dict(id=record_id, import_job_id=job.id, row_number=number,
                                source_record_id=str(raw.get("id") or "")[:100], raw_data_json=json.dumps(raw, ensure_ascii=False),
                                national_id_raw=str(raw.get("national_id") or ""),
                                normalized_national_id=nid if len(nid) == 14 else None,
                                parsed_data_json=json.dumps(parsed, ensure_ascii=False), parsed_type_id=parsed["type_id"],
                                validation_status="INVALID" if errors else "VALID")
                            if job.validation_run:
                                # The source snapshot never changes, even after repeated corrections/retries.
                                del record["raw_data_json"]
                            staged.append(record)
                            row_errors.extend(dict(id=uuid4(), import_row_id=record_id, **error) for error in errors)
                            batch_invalid += bool(errors)
                            batch_valid += not bool(errors)
                        if job.validation_run:
                            db.execute(delete(ImportRecordError).where(ImportRecordError.import_row_id.in_(
                                [record["id"] for record in staged])))
                            db.execute(update(ImportRecord), staged)
                        else:
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
                if job.processed_rows != job.total_rows:
                    raise ValueError("SOURCE_ROW_COUNT_CHANGED")
                job.status = "READY_FOR_REVIEW"
                job.completed_at = utcnow()
                job.progress_version += 1
                initiator = job.uploaded_by_user_id if job.validation_run == 0 else db.scalar(
                    select(AuditLog.user_id).where(AuditLog.action == "revalidation_requested",
                        AuditLog.entity == "import_job", AuditLog.entity_id == str(job.id),
                        func.json_value(AuditLog.new_values, "$.validation_run") == str(job.validation_run))
                    .order_by(AuditLog.id.desc()).limit(1))
                audit.write(db, action="validation_complete", entity="import_job", entity_id=str(job.id),
                            user_id=initiator, new_values={**snapshot(job), "validation_run": job.validation_run})
                db.commit()
                publish(job)
        except Exception as exc:
            _failure(ImportJob, job_id, exc)
            raise


def export_record_batches(db, import_job_id):
    """Keyset pages of scalar values, without retaining ORM objects or full result sets."""
    last = 0
    while True:
        records = db.execute(select(ImportRecord.id, ImportRecord.row_number,
            ImportRecord.raw_data_json, ImportRecord.corrected_data_json).where(
                ImportRecord.import_job_id == import_job_id,
                ImportRecord.validation_status == "INVALID", ImportRecord.row_number > last)
            .order_by(ImportRecord.row_number).limit(get_settings().export_batch_size)).all()
        if not records:
            return
        last = records[-1].row_number
        yield records


def export_layout(db, import_job_id):
    source_headers = set()
    output_headers = set()
    corrected = has_reasons = False
    for records in export_record_batches(db, import_job_id):
        for record in records:
            original = json.loads(record.raw_data_json)
            raw = json.loads(record.corrected_data_json) if record.corrected_data_json else original
            source_headers.update(original)
            output_headers.update(raw)
            corrected |= bool(record.corrected_data_json)
            has_reasons |= "rejection_reasons" in raw
    reserved = source_headers | output_headers
    reasons_column = "source_rejection_reasons"
    while reasons_column in reserved:
        reasons_column = "source_" + reasons_column
    original_column = "original_uploaded_data"
    while original_column in reserved or original_column == reasons_column:
        original_column = "source_" + original_column
    if has_reasons:
        output_headers.add(reasons_column)
    if corrected:
        output_headers.add(original_column)
    headers = list(FIELDS) + sorted(output_headers - set(FIELDS) - {"rejection_reasons"}) + ["rejection_reasons"]
    return headers, reasons_column, original_column


def export_rows(db, import_job_id, reasons_column, original_column):
    for records in export_record_batches(db, import_job_id):
        values = {r.id: json.loads(r.corrected_data_json or r.raw_data_json) for r in records}
        errors = {}
        error_rows = db.execute(select(ImportRecordError.import_row_id, ImportRecordError.error_code,
            ImportRecordError.field_name, ImportRecordError.error_message).where(
                ImportRecordError.import_row_id.in_(list(values)))
            .order_by(ImportRecordError.field_name, ImportRecordError.error_code)).all()
        for record_id, code, field, message in error_rows:
            error = readable_error(code, field, message, values[record_id])
            errors.setdefault(record_id, []).append(
                f"{FIELD_LABELS.get(field, field)} ({field}): {error['error_message']}")
        for record in records:
            raw = values.pop(record.id)
            if record.corrected_data_json:
                raw[original_column] = record.raw_data_json
            if "rejection_reasons" in raw:
                raw[reasons_column] = raw.pop("rejection_reasons")
            raw["rejection_reasons"] = " | ".join(errors.get(record.id, []))
            yield raw


def process_export(job_id: str):
    job_id = UUID(job_id)
    started = monotonic()
    with worker_lock(f"poc-export-{job_id}", wait_ms=5000) as acquired:
        if not acquired:
            return
        output = None
        try:
            with get_sessionmaker()() as db:
                job = db.scalar(locked(select(ExportJob).where(ExportJob.id == job_id), db))
                if job is None or job.status in {"COMPLETED", "FAILED"}:
                    return
                job.next_dispatch_check_at = utcnow() + timedelta(seconds=get_settings().recovery_interval_seconds)
                job.retry_count += 1
                job.status = "PROCESSING"
                job.heartbeat_at = utcnow()
                db.commit()
                headers, reasons_column, original_column = export_layout(db, job.import_job_id)
                storage_key = new_key("exports", "." + job.export_format)
                output = path_for(storage_key)
                output.parent.mkdir(parents=True, exist_ok=True)
                with closing(export_rows(db, job.import_job_id, reasons_column, original_column)) as rows:
                    written = write_export(output, headers, rows)
                job.storage_key = storage_key
                job.status = "COMPLETED"
                job.completed_at = utcnow()
                job.last_error = None
                audit.write(db, action="export_complete", user_id=job.requested_by_user_id,
                            entity="export_job", entity_id=str(job.id), new_values={"format": job.export_format, "rows": written})
                db.commit()
                logger.info("Export completed job=%s format=%s rows=%s duration_seconds=%.3f",
                            job_id, job.export_format, written, monotonic() - started)
        except Exception as exc:
            if output:
                output.unlink(missing_ok=True)
            _failure(ExportJob, job_id, exc)
            raise


JOB_TYPES = {
    "import": (ImportJob, process_import, ("QUEUED", "PARSING", "VALIDATING")),
    "export": (ExportJob, process_export, ("QUEUED", "PROCESSING")),
}


def active_jobs(model, statuses):
    # Fixed SQL literals let SQL Server use the matching filtered index with prepared queries.
    return model.status.in_([literal_column("'" + status + "'") for status in statuses])


def dispatch_one(kind: str, job_id: str, validation_run: int | None = None):
    """Deliver/reconcile one durable job; the same lock protects workers and all delivery paths."""
    model, function, statuses = JOB_TYPES[kind]
    job_id = UUID(str(job_id))
    settings = get_settings()
    with worker_lock(f"poc-{kind}-{job_id}") as acquired:
        if not acquired:
            return
        with get_sessionmaker()() as db:
            item = db.get(model, job_id)
            if item is None or item.status not in statuses:
                return
            if kind == "import" and validation_run is not None and item.validation_run != validation_run:
                return
            item.next_dispatch_check_at = utcnow() + timedelta(seconds=settings.recovery_interval_seconds)
            db.commit()  # A failed Redis call must not leave this candidate at the head of a scan.
            if item.rq_job_id:
                try:
                    rq_job = Job.fetch(item.rq_job_id, connection=get_redis(), serializer=JSONSerializer)
                    state = rq_job.get_status(refresh=True)
                    if state in {"queued", "deferred", "scheduled"}:
                        item.dispatched_at = item.dispatched_at or utcnow()
                        item.next_dispatch_check_at = utcnow() + timedelta(seconds=settings.queued_recheck_seconds)
                        db.commit()
                        return
                    if state == "started":
                        last_seen = item.heartbeat_at or item.created_at
                        if utcnow() - last_seen < timedelta(seconds=settings.job_timeout_seconds + 60):
                            return
                    attempt = int(item.rq_job_id.rsplit("-", 1)[-1])
                    if attempt > item.retry_count:
                        item.retry_count = attempt
                except NoSuchJobError:
                    pass
            if item.retry_count >= settings.job_max_attempts:
                item.status = "FAILED"
                item.last_error = "تجاوزت العملية عدد محاولات المعالجة المسموح"
                if kind == "import":
                    item.progress_version += 1
                db.commit()
                if kind == "import":
                    publish(item)
                return
            generation = f"-r{item.validation_run}" if kind == "import" and item.validation_run else ""
            identity = f"{model.__tablename__}-{item.id}{generation}-{item.retry_count + 1}"
            item.rq_job_id = identity
            item.dispatched_at = None
            db.commit()  # Retry this identity if enqueue succeeds but its acknowledgment is lost.
            q = queue(kind)
            if not q.fetch_job(identity):
                q.enqueue(function, str(item.id), job_id=identity,
                          job_timeout=settings.job_timeout_seconds, result_ttl=86400, failure_ttl=86400)
            item.dispatched_at = utcnow()
            item.next_dispatch_check_at = utcnow() + timedelta(seconds=settings.queued_recheck_seconds)
            db.commit()


def deliver_after_commit(kind: str, job_id: str, validation_run: int | None = None):
    """Best effort response background task; SQL recovery owns delivery after interruption/outage."""
    try:
        dispatch_one(kind, job_id, validation_run)
    except Exception:
        logger.exception("Immediate delivery unavailable kind=%s job=%s; SQL recovery will retry", kind, job_id)


def dispatch_pending(stop=None):
    """Drain bounded, alternating pages of due candidates, without rescanning completed history."""
    settings = get_settings()
    scan_at = utcnow()
    started = monotonic()
    checked = 0
    try:
        while stop is None or not stop.is_set():
            found = False
            for kind, (model, _, statuses) in JOB_TYPES.items():
                with get_sessionmaker()() as db:
                    candidates = db.execute(select(model.id, model.next_dispatch_check_at).where(
                        active_jobs(model, statuses), model.next_dispatch_check_at <= scan_at)
                        .order_by(model.next_dispatch_check_at, model.created_at, model.id)
                        .limit(settings.dispatch_batch_size)).all()
                found |= bool(candidates)
                for job_id, due_at in candidates:
                    if stop is not None and stop.is_set():
                        return
                    # Claim only the scheduling field, then release row locks before the application lock.
                    # Advancing even busy candidates ensures fair pages under concurrent delivery/execution.
                    with get_sessionmaker()() as db:
                        result = db.execute(update(model).where(model.id == job_id,
                            model.next_dispatch_check_at == due_at, active_jobs(model, statuses)).values(
                                next_dispatch_check_at=utcnow() + timedelta(seconds=settings.recovery_interval_seconds)))
                        claimed = result.rowcount == 1
                        db.commit()
                    if not claimed:
                        continue
                    checked += 1
                    try:
                        dispatch_one(kind, str(job_id))
                    except RedisError:
                        logger.warning("Recovery paused: Redis unavailable; remaining jobs stay due")
                        return
                    except Exception:
                        logger.exception("Recovery candidate failed kind=%s job=%s", kind, job_id)
            if not found:
                return
    finally:
        logger.info("Recovery scan candidates=%s duration_seconds=%.3f", checked, monotonic() - started)
