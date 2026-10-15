"""SQL Server/Redis integration contracts for prompt delivery and export isolation."""
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from rq.job import Job

from app.core.config import get_settings, REPO_ROOT
from app.core.db import get_sessionmaker
from app.core.security import utcnow
from app.core.redis_client import get_redis
from app.recruits import jobs
from app.recruits.models import ImportJob, ImportRecord, ExportJob
from sqlalchemy import select
from tests.test_poc_workflows import actors, row, upload


def delivered(model, identity):
    with get_sessionmaker()() as db:
        item = db.get(model, UUID(identity))
        assert item.dispatched_at is not None
        rq_job = Job.fetch(item.rq_job_id, connection=get_redis())
        return rq_job


def test_every_creation_path_delivers_without_a_scan(actors):
    admin, _ = actors
    started = time.monotonic()
    parent = upload(admin, [row(nid="invalid")])
    assert delivered(ImportJob, parent).origin == jobs.queue().name
    assert time.monotonic() - started < 2
    jobs.process_import(parent)
    state = admin.get(f"/api/v1/imports/{parent}").json()
    started = time.monotonic()
    response = admin.post(f"/api/v1/imports/{parent}/exports", json={"format": "xlsx"})
    assert response.status_code == 202
    export = response.json()["id"]
    assert delivered(ExportJob, export).origin == jobs.queue("export").name
    assert time.monotonic() - started < 2
    jobs.process_export(export)
    with get_sessionmaker()() as db:
        record = db.scalar(select(ImportRecord).where(ImportRecord.import_job_id == UUID(parent)))
        record_id = record.id
    started = time.monotonic()
    response = admin.patch(f"/api/v1/imports/{parent}/rows/{record_id}", json={
        "version": state["progress_version"], "changes": {"national_id": row()["national_id"]}})
    assert response.status_code == 202
    assert "-r1-" in delivered(ImportJob, parent).id
    assert time.monotonic() - started < 2
    jobs.process_import(parent)
    state = admin.get(f"/api/v1/imports/{parent}").json()
    started = time.monotonic()
    assert admin.post(f"/api/v1/imports/{parent}/revalidate", json={"version": state["progress_version"]}).status_code == 202
    assert "-r2-" in delivered(ImportJob, parent).id
    assert time.monotonic() - started < 2
    jobs.process_import(parent)


def test_concurrent_sql_delivery_has_one_queue_entry(actors):
    admin, _ = actors
    parent = upload(admin, [row()])
    with get_sessionmaker()() as db:
        item = db.get(ImportJob, UUID(parent))
        Job.fetch(item.rq_job_id, connection=get_redis()).delete()
        item.rq_job_id = None
        item.dispatched_at = None
        item.next_dispatch_check_at = utcnow() - timedelta(seconds=1)
        db.commit()
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: jobs.dispatch_one("import", parent, 0), range(2)))
    rq_job = delivered(ImportJob, parent)
    assert jobs.queue().job_ids.count(rq_job.id) == 1
    jobs.process_import(parent)


def test_failed_export_removes_partial_output_and_remains_retryable(actors, monkeypatch):
    admin, _ = actors
    parent = upload(admin, [row(nid="invalid")])
    jobs.process_import(parent)
    export = admin.post(f"/api/v1/imports/{parent}/exports", json={"format": "xlsx"}).json()["id"]
    outputs = []

    def broken(path, headers, rows):
        next(rows)
        path.write_bytes(b"synthetic partial output")
        outputs.append(path)
        raise RuntimeError("synthetic write interruption")

    monkeypatch.setattr(jobs, "write_export", broken)
    with pytest.raises(RuntimeError, match="synthetic write interruption"):
        jobs.process_export(export)
    assert outputs and not outputs[0].exists()
    with get_sessionmaker()() as db:
        item = db.get(ExportJob, UUID(export))
        assert item.status == "QUEUED" and item.retry_count == 1 and item.storage_key is None


def test_export_worker_completes_while_import_worker_is_busy(actors, monkeypatch, tmp_path):
    from rq import Worker
    admin, _ = actors
    settings = get_settings()
    monkeypatch.setattr(settings, "queue_name", "isolated-workers-" + uuid4().hex)
    parent = upload(admin, [row(nid="invalid")])
    jobs.process_import(parent)
    # A real isolated child occupies the import worker; the export worker must remain available.
    blocker = jobs.queue().enqueue(time.sleep, 12, job_timeout=30)
    env = dict(os.environ, DB_NAME=settings.db_name, QUEUE_NAME=settings.queue_name,
               REDIS_PREFIX=settings.redis_prefix, STORAGE_ROOT=str(settings.storage_root),
               IMPORT_WORKERS="1", EXPORT_WORKERS="1", RECOVERY_INTERVAL_SECONDS="1")
    path = tmp_path / "services.log"
    with path.open("w") as log:
        process = subprocess.Popen([sys.executable, "-m", "app.cli.worker_supervisor"],
            cwd=REPO_ROOT / "backend", env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                workers = Worker.all(connection=get_redis())
                if any(w.get_current_job_id() == blocker.id for w in workers):
                    break
                assert process.poll() is None, path.read_text()
                time.sleep(.1)
            else:
                pytest.fail("Import worker did not start blocker: " + path.read_text())
            export = admin.post(f"/api/v1/imports/{parent}/exports", json={"format": "xlsx"}).json()["id"]
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                state = admin.get(f"/api/v1/exports/{export}").json()
                if state["status"] in {"COMPLETED", "FAILED"}:
                    break
                time.sleep(.1)
            assert state["status"] == "COMPLETED", path.read_text()
            assert blocker.get_status(refresh=True) == "started", path.read_text()
            assert admin.get(f"/api/v1/exports/{export}/download").content.startswith(b"PK")
        finally:
            # Let the blocker finish before POSIX shutdown; Windows cleanup is also covered natively.
            deadline = time.monotonic() + 15
            while blocker.get_status(refresh=True) == "started" and time.monotonic() < deadline:
                time.sleep(.1)
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
                pytest.fail("Supervisor did not stop: " + path.read_text())


def test_migration_is_repeatable_and_due_queries_use_filtered_indexes(actors):
    import pyodbc
    from sqlalchemy import insert
    from app.cli.db_init import apply_scripts, admin_connection_string
    from app.core.db import get_engine

    admin, _ = actors
    parent = upload(admin, [row()])
    jobs.process_import(parent)
    with get_sessionmaker()() as db:
        item = db.get(ImportJob, UUID(parent))
        metadata = (item.dispatched_at, item.next_dispatch_check_at)
        user_id = item.uploaded_by_user_id
    apply_scripts(log=lambda _: None)
    with get_sessionmaker()() as db:
        item = db.get(ImportJob, UUID(parent))
        assert (item.dispatched_at, item.next_dispatch_check_at) == metadata
        # Enough terminal history to expose an accidental historical-table scan.
        db.execute(insert(ImportJob), [dict(id=uuid4(), original_filename="history.csv",
            storage_key="imports/synthetic.csv", file_type="csv", file_sha256="0" * 64,
            batch_number=1, enlistment_year=2026, uploaded_by_user_id=user_id, status="CANCELLED")
            for _ in range(5000)])
        db.execute(insert(ExportJob), [dict(id=uuid4(), import_job_id=UUID(parent),
            requested_by_user_id=user_id, export_format="xlsx", status="COMPLETED")
            for _ in range(5000)])
        db.commit()
    settings = get_settings()
    assert settings.db_name.endswith("_test")
    with pyodbc.connect(admin_connection_string(settings), autocommit=True) as connection:
        cursor = connection.cursor()
        cursor.execute("USE [" + settings.db_name.replace("]", "]]") + "]")
        cursor.execute("SET SHOWPLAN_XML ON")
        try:
            for kind, (model, _, statuses) in jobs.JOB_TYPES.items():
                statement = select(model.id, model.next_dispatch_check_at).where(
                    jobs.active_jobs(model, statuses), model.next_dispatch_check_at <= utcnow()).order_by(
                        model.next_dispatch_check_at, model.created_at, model.id).limit(100)
                sql = str(statement.compile(dialect=get_engine().dialect, compile_kwargs={"literal_binds": True}))
                plan = cursor.execute(sql).fetchval()
                assert f"IX_{kind}_dispatch_due" in plan
        finally:
            cursor.execute("SET SHOWPLAN_XML OFF")
