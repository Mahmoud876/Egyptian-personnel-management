"""PoC contract tests against SQL Server and Redis, with synthetic data only."""
import csv
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from io import StringIO, BytesIO
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.models import AppUser, AuditLog
from app.core.security import hash_password
from app.core.redis_client import get_redis
from app.main import create_app
from app.recruits.jobs import process_import, process_export, dispatch_pending, queue
from app.recruits.models import ImportJob, Recruit, ImportRecord, ExportJob
from app.recruits.validation import FIELDS

PASSWORD = "Synthetic-test-42!"


@pytest.fixture
def actors():
    clients = []
    for role in ["system_administrator", "data_entry_operator"]:
        username = "poc_" + uuid4().hex[:16]
        with get_sessionmaker()() as db:
            user = AppUser(username=username, full_name="مستخدم تجريبي", role=role,
                           password_hash=hash_password(PASSWORD), is_active=True, must_change_password=False)
            db.add(user)
            db.commit()
        client = TestClient(create_app())
        response = client.post("/api/v1/auth/login", json={"username": username, "password": PASSWORD})
        assert response.status_code == 200, response.text
        assert response.json()["role"] == role
        clients.append(client)
    yield clients
    for client in clients:
        client.close()


def row(nid=None, **changes):
    # 4 serial digits, odd gender digit; random enough for isolated test uploads.
    serial = (uuid4().int % 5000) * 2 + 1
    return {"id": "1", "name": "أحمد محمد حسن علي", "national_id": nid or f"300010101{serial:04d}0",
            "birth_date": "2000-01-01", "gov_id": "01", "gov_name": "القاهرة",
            "ps_id": "0101", "ps_name": "قسم تجريبي", "type_id": "1", "type_name": "عالى", **changes}


def upload(client, rows):
    stream = StringIO()
    writer = csv.DictWriter(stream, fieldnames=list(FIELDS) + sorted({key for item in rows for key in item} - set(FIELDS)))
    writer.writeheader()
    writer.writerows(rows)
    response = client.post("/api/v1/imports", data={"batch_number": "1", "enlistment_year": "2026"},
                           files={"file": ("synthetic.csv", stream.getvalue().encode("utf-8"), "text/csv")})
    assert response.status_code == 202, response.text
    return response.json()["id"]


def approved_recruit(admin):
    job = upload(admin, [row()])
    process_import(job)
    response = admin.post(f"/api/v1/imports/{job}/approve")
    assert response.status_code == 200, response.text
    with get_sessionmaker()() as db:
        return str(db.scalar(select(Recruit.id).where(Recruit.import_job_id == UUID(job))))


def completion(**changes):
    return {"police_number": uuid4().hex[:16], "enlistment_start_date": "2026-01-01",
            "enlistment_end_date": "2027-03-01", **changes}


def test_import_status_counts_and_official_reference(actors):
    admin, operator = actors
    first = upload(admin, [row()])
    second = upload(admin, [row()])
    process_import(first)
    for statuses in [["READY_FOR_REVIEW"], ["QUEUED", "PARSING", "VALIDATING"]]:
        with get_sessionmaker()() as db:
            expected = len(list(db.scalars(select(ImportJob.id).where(ImportJob.status.in_(statuses)))))
        response = admin.get("/api/v1/imports", params=[("page_size", 1)] + [("status", s) for s in statuses])
        assert response.status_code == 200, response.text
        assert response.json()["total"] == expected
        assert all(item["status"] in statuses for item in response.json()["items"])
    assert admin.get("/api/v1/imports?status=UNKNOWN").status_code == 422
    assert operator.get("/api/v1/imports?status=QUEUED").status_code == 403
    references = operator.get("/api/v1/lookups/official-governorates")
    assert references.status_code == 200
    names = {item["code"]: item["name_ar"] for item in references.json()}
    assert len(names) == 28
    assert names["21"] == "الجيزة" and names["11"] == "دمياط"
    # Leave no pending import for a later worker test to pick up.
    assert admin.post(f"/api/v1/imports/{first}/cancel").status_code == 200
    process_import(second)
    assert admin.post(f"/api/v1/imports/{second}/cancel").status_code == 200


def test_import_review_approve_complete_lock_print_search(actors):
    admin, operator = actors
    good = row()
    job = upload(admin, [good, row(nid="bad")])
    process_import(job)
    report = admin.get(f"/api/v1/imports/{job}/report").json()
    assert report["summary"]["status"] == "READY_FOR_REVIEW"
    assert report["summary"]["valid_rows"] == 1
    assert report["invalid"]["total"] == 1
    assert len(report["invalid"]["items"][0]["errors"]) >= 2
    assert admin.post(f"/api/v1/imports/{job}/approve").json()["inserted_count"] == 1
    assert admin.post(f"/api/v1/imports/{job}/approve").status_code == 409
    recruit = operator.get("/api/v1/recruits/by-national-id/" + good["national_id"]).json()
    rid = recruit["id"]
    assert recruit["suggested_end_date"] == "2027-03-01"
    assert operator.get(f"/api/v1/recruits/{rid}/barcode").status_code == 409
    assert operator.post(f"/api/v1/recruits/{rid}/complete", json=completion(enlistment_end_date="2027-02-28")).status_code == 422
    assert operator.post(f"/api/v1/recruits/{rid}/complete", json=completion(enlistment_start_date="9999-12-31", enlistment_end_date="9999-12-31")).status_code == 422
    body = completion()
    done = operator.post(f"/api/v1/recruits/{rid}/complete", json=body)
    assert done.status_code == 200, done.text
    assert done.json()["is_locked"] and len(done.json()["barcode"]) == 12
    assert operator.post(f"/api/v1/recruits/{rid}/complete", json=body).status_code == 409
    assert operator.patch(f"/api/v1/recruits/{rid}", json={**body, "revision": 2}).status_code == 403
    changed = admin.patch(f"/api/v1/recruits/{rid}", json={**body, "revision": 2, "name": "محمد علي حسن أحمد"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["barcode"] == done.json()["barcode"]
    label = operator.get(f"/api/v1/recruits/{rid}/barcode")
    assert label.status_code == 200 and "<svg" in label.text and body["police_number"] in label.text
    assert operator.get("/api/v1/recruits", params={"barcode": done.json()["barcode"]}).json()["total"] == 1
    assert operator.get("/api/v1/recruits", params={"police_number": body["police_number"]}).status_code == 422
    assert admin.get("/api/v1/audit", params={"q": good["national_id"]}).json()["total"] >= 1


def test_operator_denials_and_cancel(actors):
    admin, operator = actors
    for path in ["/imports", "/audit", "/users"]:
        assert operator.get("/api/v1" + path).status_code == 403
    job = upload(admin, [row()])
    assert admin.post(f"/api/v1/imports/{job}/approve").status_code == 409
    process_import(job)
    assert admin.post(f"/api/v1/imports/{job}/cancel").status_code == 200
    assert admin.post(f"/api/v1/imports/{job}/approve").status_code == 409
    with get_sessionmaker()() as db:
        assert not db.scalar(select(Recruit.id).where(Recruit.import_job_id == UUID(job)))


def test_duplicate_file_and_database_recheck_on_approval(actors):
    admin, _ = actors
    same = row()
    duplicate_job = upload(admin, [same, same])
    process_import(duplicate_job)
    assert admin.get(f"/api/v1/imports/{duplicate_job}").json()["invalid_rows"] == 2
    first, second = upload(admin, [same]), upload(admin, [same])
    process_import(first)
    process_import(second)
    assert admin.post(f"/api/v1/imports/{first}/approve").status_code == 200
    assert admin.post(f"/api/v1/imports/{second}/approve").status_code == 409
    assert admin.get(f"/api/v1/imports/{second}").json()["status"] == "READY_FOR_REVIEW"


def test_export_and_terminal_sse(actors):
    admin, _ = actors
    job = upload(admin, [row(nid="bad", rejection_reasons="original note", source_rejection_reasons="keep this too")])
    process_import(job)
    stream = admin.get(f"/api/v1/imports/{job}/events")
    assert stream.status_code == 200 and "READY_FOR_REVIEW" in stream.text
    response = admin.post(f"/api/v1/imports/{job}/exports", json={"format": "xlsx"})
    assert response.status_code == 202
    export = response.json()["id"]
    assert admin.get(f"/api/v1/exports/{export}/download").status_code == 409
    process_export(export)
    result = admin.get(f"/api/v1/exports/{export}/download")
    assert result.status_code == 200 and result.content[:2] == b"PK"
    from openpyxl import load_workbook
    book = load_workbook(BytesIO(result.content), read_only=True)
    values = list(book.active.values)
    exported = dict(zip(values[0], values[1]))
    assert exported["source_source_rejection_reasons"] == "original note"
    assert exported["source_rejection_reasons"] == "keep this too"
    assert "الرقم القومي" in exported["rejection_reasons"]
    book.close()


def test_restart_does_not_duplicate_staging(actors):
    admin, _ = actors
    job = upload(admin, [row() for _ in range(260)])
    process_import(job)
    with get_sessionmaker()() as db:
        item = db.get(ImportJob, UUID(job))
        item.status = "VALIDATING"  # crash after checkpoint commit, before final state commit
        db.commit()
    process_import(job)
    with get_sessionmaker()() as db:
        records = db.scalars(select(ImportRecord).where(ImportRecord.import_job_id == UUID(job))).all()
        assert len(records) == 260
    assert admin.get(f"/api/v1/imports/{job}").json()["processed_rows"] == 260


def test_concurrent_profile_completion_has_one_winner(actors):
    admin, operator = actors
    recruit = approved_recruit(admin)
    def save(_):
        with TestClient(create_app()) as client:
            client.cookies.update(operator.cookies)
            return client.post(f"/api/v1/recruits/{recruit}/complete", json=completion()).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(save, range(2))) == [200, 409]


def test_role_changes_and_deactivation_invalidate_sessions(actors):
    admin, operator = actors
    user = operator.get("/api/v1/auth/me").json()
    response = admin.put(f'/api/v1/users/{user["id"]}', json={"full_name": user["full_name"],
        "work_entity_id": None, "is_active": True, "role": "system_administrator"})
    assert response.status_code == 200, response.text
    assert operator.get("/api/v1/auth/me").status_code == 401
    response = admin.post("/api/v1/users", json={"username": "new_" + uuid4().hex[:12], "full_name": "اختبار",
        "password": PASSWORD, "role": "data_entry_operator", "permissions": ["file:insert"]})
    assert response.status_code == 422


def test_dispatcher_delivers_sql_job_to_real_rq(actors):
    from rq import SimpleWorker
    from rq.serializers import JSONSerializer
    from rq.timeouts import TimerDeathPenalty
    class TestWorker(SimpleWorker):
        death_penalty_class = TimerDeathPenalty
    admin, _ = actors
    job = upload(admin, [row()])
    dispatch_pending()
    TestWorker([queue()], connection=get_redis(), serializer=JSONSerializer).work(burst=True)
    assert admin.get(f"/api/v1/imports/{job}").json()["status"] == "READY_FOR_REVIEW"


def test_worker_crash_after_checkpoint_resumes_without_duplicates(actors, monkeypatch):
    from app.recruits import jobs
    admin, _ = actors
    job = upload(admin, [row() for _ in range(270)])
    original = jobs.publish
    def crash(item):
        if item.processed_rows == 250 and item.status == "VALIDATING":
            raise RuntimeError("simulated process failure after checkpoint")
        original(item)
    monkeypatch.setattr(jobs, "publish", crash)
    with pytest.raises(RuntimeError):
        process_import(job)
    assert admin.get(f"/api/v1/imports/{job}").json()["checkpoint_row"] == 250
    monkeypatch.setattr(jobs, "publish", original)
    process_import(job)
    state = admin.get(f"/api/v1/imports/{job}").json()
    assert state["processed_rows"] == 270 and state["retry_count"] == 2
    with get_sessionmaker()() as db:
        assert len(db.scalars(select(ImportRecord).where(ImportRecord.import_job_id == UUID(job))).all()) == 270


def test_dispatch_recovers_enqueue_outage_and_bounds_prestart_failures(actors, monkeypatch):
    from app.recruits import jobs
    from redis.exceptions import ConnectionError
    from rq.job import Job, JobStatus
    admin, _ = actors
    job = upload(admin, [row()])
    real_queue = jobs.queue
    def unavailable():
        raise ConnectionError("simulated queue outage")
    monkeypatch.setattr(jobs, "queue", unavailable)
    with pytest.raises(ConnectionError):
        dispatch_pending()
    assert admin.get(f"/api/v1/imports/{job}").json()["status"] == "QUEUED"
    monkeypatch.setattr(jobs, "queue", real_queue)
    for attempt in range(1, get_settings().job_max_attempts + 1):
        dispatch_pending()
        with get_sessionmaker()() as db:
            item = db.get(ImportJob, UUID(job))
            assert item.rq_job_id.endswith(f"-{attempt}")
            rq_job = Job.fetch(item.rq_job_id, connection=get_redis())
            queue().remove(rq_job.id)
            rq_job.set_status(JobStatus.FAILED)
    dispatch_pending()
    state = admin.get(f"/api/v1/imports/{job}").json()
    assert state["status"] == "FAILED"
    assert state["retry_count"] == get_settings().job_max_attempts


def test_recruit_documents_link_and_download(actors):
    admin, operator = actors
    recruit = approved_recruit(admin)
    other = approved_recruit(admin)
    response = admin.post(f"/api/v1/recruits/{recruit}/documents", files={"file": ("decision.pdf", b"%PDF-synthetic", "application/pdf")})
    assert response.status_code == 201, response.text
    document = response.json()["id"]
    assert operator.get(f"/api/v1/recruits/{recruit}/documents/{document}/download").content == b"%PDF-synthetic"
    assert operator.get(f"/api/v1/recruits/{other}/documents/{document}/download").status_code == 404


@pytest.mark.skipif(__import__('os').name != 'nt', reason="Microsoft ACE export requires a Windows worker")
def test_accdb_export_preserves_arabic(actors, monkeypatch):
    from app.recruits.files import path_for, access_connection, read_records
    admin, _ = actors
    job = upload(admin, [row(nid="bad")])
    process_import(job)
    response = admin.post(f"/api/v1/imports/{job}/exports", json={"format": "accdb"})
    export = response.json()["id"]
    process_export(export)
    with get_sessionmaker()() as db:
        item = db.get(ExportJob, UUID(export))
        assert item.status == "COMPLETED"
        with access_connection(path_for(item.storage_key)) as conn:
            result = conn.execute("SELECT [name], [rejection_reasons] FROM [rejected_records]").fetchone()
            assert result[0] == "أحمد محمد حسن علي"
            assert "الرقم القومي" in result[1]
        monkeypatch.setattr(get_settings(), "access_table", "rejected_records")
        imported = read_records(path_for(item.storage_key))
        assert len(imported) == 1 and imported[0]["name"] == "أحمد محمد حسن علي"
        assert imported[0]["national_id"] == "bad"


@pytest.mark.skipif(__import__('os').name != 'nt', reason="Native Windows worker regression")
def test_windows_worker_processes_import_and_export_in_child_processes(actors, tmp_path):
    import os
    import subprocess
    import sys
    import time
    from app.core.config import REPO_ROOT
    admin, _ = actors
    job = upload(admin, [row(nid="bad")])
    settings = get_settings()
    env = dict(os.environ, DB_NAME=settings.db_name, QUEUE_NAME='poc-spawn-' + uuid4().hex,
               REDIS_PREFIX=settings.redis_prefix, STORAGE_ROOT=str(settings.storage_root),
               RECOVERY_INTERVAL_SECONDS='1')
    log_path = tmp_path / 'worker.log'
    with log_path.open('w', encoding='utf-8') as log:
        worker = subprocess.Popen([sys.executable, '-m', 'app.cli.worker'], cwd=REPO_ROOT / 'backend',
            env=env, stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            def wait_for(path, expected):
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    state = admin.get(path).json()
                    if state['status'] in {expected, 'FAILED'}:
                        break
                    time.sleep(.25)
                assert state['status'] == expected, log_path.read_text(encoding='utf-8')
                return state
            state = wait_for(f'/api/v1/imports/{job}', 'READY_FOR_REVIEW')
            assert state['invalid_rows'] == 1 and state['retry_count'] == 1
            export = admin.post(f'/api/v1/imports/{job}/exports', json={'format': 'xlsx'}).json()['id']
            wait_for(f'/api/v1/exports/{export}', 'COMPLETED')
            assert admin.get(f'/api/v1/exports/{export}/download').content.startswith(b'PK')
        finally:
            subprocess.run(['taskkill', '/PID', str(worker.pid), '/T', '/F'], capture_output=True)
