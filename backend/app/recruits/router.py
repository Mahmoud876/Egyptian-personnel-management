import json
import time
from io import BytesIO
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Form, File, UploadFile, Request
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from redis.exceptions import RedisError

from app.core import audit
from app.core.audit import client_ip
from app.core.config import get_settings
from app.core.db import get_db, get_sessionmaker
from app.core.errors import AppError
from app.core.models import AppUser
from app.core.permissions import CurrentUser, require_permission
from app.core.queries import PageParams, page_params, paginate
from app.core.redis_client import get_redis, key
from app.core.roles import permissions_for_role
from app.core.security import resolve_session
from app.core.schemas import Page
from . import service
from .files import save_upload, path_for, IMPORT_EXTENSIONS
from .jobs import snapshot, IMPORT_TERMINAL, deliver_after_commit
from .models import ImportJob, ExportJob, Recruit, RecruitDocument, OfficialGovernorate
from .schemas import (ImportOut, ExportOut, ExportRequest, RecruitOut, CompleteProfile,
                      EditProfile, DocumentOut, ImportRecordOut, ImportReportOut, ApprovalOut,
                      ImportStatus, OfficialGovernorateOut, CorrectImportRecord, RevalidateImport)

router = APIRouter(tags=["conscript PoC"])
file_permission = require_permission("file:insert")


@router.post("/imports", response_model=ImportOut, status_code=202)
async def upload_import(request: Request, background_tasks: BackgroundTasks, file: UploadFile = File(...),
                        batch_number: int = Form(..., ge=1, le=4),
                        enlistment_year: int = Form(..., ge=2000, le=2100),
                        actor: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    name, storage_key, size, digest = await save_upload(file, "imports", IMPORT_EXTENSIONS)
    job = ImportJob(original_filename=name, storage_key=storage_key, file_type=name.rsplit(".", 1)[-1].lower(),
                    file_sha256=digest, batch_number=batch_number, enlistment_year=enlistment_year,
                    uploaded_by_user_id=actor.id, duplicate_policy=get_settings().import_duplicate_policy)
    try:
        db.add(job)
        db.flush()
        audit.write(db, action="upload", user_id=actor.id, ip=client_ip(request), entity="import_job",
                    entity_id=str(job.id), new_values={"filename": name, "size": size, "sha256": digest})
        db.commit()
    except Exception:
        db.rollback()
        path_for(storage_key).unlink(missing_ok=True)
        raise
    background_tasks.add_task(deliver_after_commit, "import", str(job.id), job.validation_run)
    return job


@router.get("/imports", response_model=Page[ImportOut])
def list_imports(status: list[ImportStatus] | None = Query(None),
                 paging: PageParams = Depends(page_params), _: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    statement = select(ImportJob)
    if status:
        statement = statement.where(ImportJob.status.in_(status))
    return paginate(db, statement.order_by(ImportJob.created_at.desc(), ImportJob.id), paging,
                    lambda row: ImportOut.model_validate(row[0]))


@router.get("/lookups/official-governorates", response_model=list[OfficialGovernorateOut])
def official_governorates(_: CurrentUser = Depends(require_permission("profile:get")), db: Session = Depends(get_db)):
    return [{"code": row.code, "name_ar": row.name}
            for row in db.scalars(select(OfficialGovernorate).order_by(OfficialGovernorate.code))]


@router.get("/imports/{job_id}", response_model=ImportOut)
def get_import(job_id: UUID, _: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    return service.get(db, ImportJob, job_id)


@router.get("/imports/{job_id}/report", response_model=ImportReportOut)
def report(job_id: UUID, paging: PageParams = Depends(page_params), _: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    job = service.get(db, ImportJob, job_id)
    return {"summary": ImportOut.model_validate(job),
            "valid": service.report_rows(db, job_id, paging, "VALID"),
            "invalid": service.report_rows(db, job_id, paging, "INVALID")}


@router.get("/imports/{job_id}/rows", response_model=Page[ImportRecordOut])
def rows(job_id: UUID, status: Literal["VALID", "INVALID"] | None = None,
         paging: PageParams = Depends(page_params), _: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    return service.report_rows(db, job_id, paging, status)


@router.post("/imports/{job_id}/approve", response_model=ApprovalOut)
def approve(job_id: UUID, request: Request, actor: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    return service.approve(db, job_id, actor, client_ip(request))


@router.patch("/imports/{job_id}/rows/{record_id}", response_model=ImportOut, status_code=202)
def correct_row(job_id: UUID, record_id: UUID, body: CorrectImportRecord, request: Request, background_tasks: BackgroundTasks,
                actor: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    job = service.revalidate(db, job_id, body, actor, client_ip(request), record_id)
    background_tasks.add_task(deliver_after_commit, "import", str(job.id), job.validation_run)
    return job


@router.post("/imports/{job_id}/revalidate", response_model=ImportOut, status_code=202)
def revalidate_import(job_id: UUID, body: RevalidateImport, request: Request, background_tasks: BackgroundTasks,
                      actor: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    job = service.revalidate(db, job_id, body, actor, client_ip(request))
    background_tasks.add_task(deliver_after_commit, "import", str(job.id), job.validation_run)
    return job


@router.post("/imports/{job_id}/cancel", response_model=ImportOut)
def cancel(job_id: UUID, request: Request, actor: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    return service.cancel(db, job_id, actor, client_ip(request))


@router.get("/imports/{job_id}/events")
def events(job_id: UUID, request: Request, _: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    service.get(db, ImportJob, job_id)
    db.close()  # Don't hold a request-scoped SQL connection for the lifetime of SSE.
    token = request.cookies.get(get_settings().session_cookie_name)

    def stream():
        pubsub = get_redis().pubsub()
        last_version = -1
        try:
            # Subscribe before taking the SQL snapshot: events between these steps cannot be lost.
            pubsub.subscribe(key(f"import:{job_id}:progress"))
            while True:
                with get_sessionmaker()() as connection:
                    session = resolve_session(connection, token)
                    user = connection.get(AppUser, session.user_id) if session else None
                    if not user or not user.is_active or user.must_change_password or user.session_version != session.version or "file:insert" not in permissions_for_role(user.role):
                        yield 'event: unauthorized\ndata: {}\n\n'
                        return
                    job = service.get(connection, ImportJob, job_id)
                    data = snapshot(job)
                if data["version"] > last_version:
                    last_version = data["version"]
                    yield f'id: {last_version}\nevent: progress\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'
                if data["status"] in IMPORT_TERMINAL:
                    return
                # Periodic SQL snapshots recover dropped Pub/Sub notifications; no event replay assumed.
                pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
                yield ': keepalive\n\n'
        except RedisError:
            yield 'event: reconnect\ndata: {}\n\n'
        finally:
            pubsub.close()
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/imports/{job_id}/exports", response_model=ExportOut, status_code=202)
def create_export(job_id: UUID, body: ExportRequest, request: Request, background_tasks: BackgroundTasks,
                  actor: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    job = service.get(db, ImportJob, job_id, lock=True)
    if job.status not in {"READY_FOR_REVIEW", "APPROVED", "CANCELLED"}:
        raise AppError(409, "نتائج الفحص غير جاهزة", "report_unavailable")
    export = ExportJob(import_job_id=job.id, export_format=body.format, requested_by_user_id=actor.id)
    db.add(export)
    db.flush()
    audit.write(db, action="export_requested", user_id=actor.id, ip=client_ip(request), entity="export_job",
                entity_id=str(export.id), new_values={"import_job_id": str(job_id), "format": body.format})
    db.commit()
    background_tasks.add_task(deliver_after_commit, "export", str(export.id))
    return export


@router.get("/exports/{export_id}", response_model=ExportOut)
def get_export(export_id: UUID, _: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    return service.get(db, ExportJob, export_id)


@router.get("/exports/{export_id}/download")
def download_export(export_id: UUID, _: CurrentUser = Depends(file_permission), db: Session = Depends(get_db)):
    job = service.get(db, ExportJob, export_id)
    if job.status != "COMPLETED" or not job.storage_key:
        raise AppError(409, "ملف التصدير غير جاهز", "export_not_ready")
    path = path_for(job.storage_key)
    if not path.is_file():
        raise AppError(404, "ملف التصدير غير موجود", "file_missing")
    return FileResponse(path, filename=f"rejected-{job.import_job_id}.{job.export_format}",
                        media_type="application/octet-stream", headers={"X-Content-Type-Options": "nosniff"})


@router.get("/recruits", response_model=Page[RecruitOut])
def search_recruits(search: str | None = Query(None, max_length=200),
                    national_id: str | None = Query(None, pattern=r"^[0-9]{1,14}$"),
                    barcode: str | None = Query(None, pattern=r"^[0-9]{1,12}$"),
                    name: str | None = Query(None, max_length=200),
                    police_number: str | None = Query(None, min_length=1, max_length=20),
                    enlistment_year: int | None = Query(None, ge=2000, le=2100),
                    paging: PageParams = Depends(page_params),
                    _: CurrentUser = Depends(require_permission("profile:get")), db: Session = Depends(get_db)):
    return service.search(db, paging, search, national_id, barcode, name, police_number, enlistment_year)


@router.get("/recruits/by-national-id/{national_id}", response_model=RecruitOut)
def by_national_id(national_id: str, _: CurrentUser = Depends(require_permission("profile:get")), db: Session = Depends(get_db)):
    import re
    if not re.fullmatch(r"[0-9]{14}", national_id):
        raise AppError(422, "الرقم القومي غير صحيح", "invalid_national_id")
    recruit = db.scalar(select(Recruit).where(Recruit.national_id == national_id))
    if not recruit:
        raise AppError(404, "السجل غير موجود", "not_found")
    return service.detail(recruit)


@router.get("/recruits/{recruit_id}", response_model=RecruitOut)
def get_recruit(recruit_id: UUID, _: CurrentUser = Depends(require_permission("profile:get")), db: Session = Depends(get_db)):
    return service.detail(service.get(db, Recruit, recruit_id))


@router.post("/recruits/{recruit_id}/complete", response_model=RecruitOut)
def complete(recruit_id: UUID, body: CompleteProfile, request: Request,
             actor: CurrentUser = Depends(require_permission("profile:insert")), db: Session = Depends(get_db)):
    return service.complete(db, recruit_id, body, actor, client_ip(request))


@router.patch("/recruits/{recruit_id}", response_model=RecruitOut)
def edit(recruit_id: UUID, body: EditProfile, request: Request,
         actor: CurrentUser = Depends(require_permission("profile:update")), db: Session = Depends(get_db)):
    return service.complete(db, recruit_id, body, actor, client_ip(request), edit=True)


@router.get("/recruits/{recruit_id}/barcode", response_class=HTMLResponse)
def label(recruit_id: UUID, request: Request, preview: bool = False,
          actor: CurrentUser = Depends(require_permission("barcode:get")), db: Session = Depends(get_db)):
    recruit = service.get(db, Recruit, recruit_id)
    if not recruit.is_locked or not recruit.barcode or not recruit.police_number:
        raise AppError(409, "بيانات التجنيد غير مكتملة", "incomplete_profile")
    from .labels import render_label, LABEL_CSP
    if not preview:
        # This records a print request, not a claim that the physical printer succeeded.
        audit.write(db, action="label", user_id=actor.id, ip=client_ip(request), entity="recruit", entity_id=str(recruit.id),
                    new_values={"barcode": recruit.barcode, "label_size_mm": "50x25", "event": "print_requested"})
        db.commit()
    return HTMLResponse(render_label(recruit.barcode, recruit.name, recruit.police_number, recruit.enlistment_year),
        headers={"Cache-Control": "no-store", "Content-Security-Policy": LABEL_CSP})


@router.post("/recruits/{recruit_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(recruit_id: UUID, request: Request, file: UploadFile = File(...),
                          actor: CurrentUser = Depends(require_permission("profile:update")), db: Session = Depends(get_db)):
    service.get(db, Recruit, recruit_id)
    name, storage_key, size, digest = await save_upload(file, "documents", {".pdf", ".png", ".jpg", ".jpeg"})
    document = RecruitDocument(recruit_id=recruit_id, uploaded_by_user_id=actor.id, original_filename=name,
        storage_key=storage_key, content_type="application/octet-stream", file_size_bytes=size, sha256=digest)
    try:
        db.add(document)
        db.flush()
        audit.write(db, action="document_upload", user_id=actor.id, ip=client_ip(request), entity="recruit",
                    entity_id=str(recruit_id), new_values={"document_id": str(document.id), "sha256": digest})
        db.commit()
    except Exception:
        db.rollback()
        path_for(storage_key).unlink(missing_ok=True)
        raise
    return document


@router.get("/recruits/{recruit_id}/documents", response_model=list[DocumentOut])
def list_documents(recruit_id: UUID, _: CurrentUser = Depends(require_permission("profile:get")), db: Session = Depends(get_db)):
    service.get(db, Recruit, recruit_id)
    return db.scalars(select(RecruitDocument).where(RecruitDocument.recruit_id == recruit_id)).all()


@router.get("/recruits/{recruit_id}/documents/{document_id}/download")
def download_document(recruit_id: UUID, document_id: UUID,
                      _: CurrentUser = Depends(require_permission("profile:get")), db: Session = Depends(get_db)):
    document = service.get(db, RecruitDocument, document_id)
    if document.recruit_id != recruit_id or not path_for(document.storage_key).is_file():
        raise AppError(404, "المستند غير موجود", "not_found")
    return FileResponse(path_for(document.storage_key), filename=document.original_filename,
                        media_type="application/octet-stream", headers={"X-Content-Type-Options": "nosniff"})
