import json
from datetime import date
from uuid import UUID, uuid4

from sqlalchemy import select, or_, func, text
from sqlalchemy.exc import IntegrityError

from app.admin.models import Qualification
from app.core import audit
from app.core.errors import AppError
from app.core.queries import paginate, like_contains
from app.core.security import utcnow
from .jobs import locked, publish
from .models import ImportJob, ImportRecord, ImportRecordError, Recruit, ExportJob
from .schemas import RecruitOut, ImportRecordOut, RecordErrorOut
from .validation import add_months, initial_start, SERVICE_MONTHS, normalize_name


def get(db, model, identity, lock=False):
    statement = select(model).where(model.id == identity)
    item = db.scalar(locked(statement, db) if lock else statement)
    if item is None:
        raise AppError(404, "السجل غير موجود", "not_found")
    return item


def require_review(job):
    if job.status != "READY_FOR_REVIEW":
        raise AppError(409, "الملف ليس في انتظار المراجعة", "import_not_ready")


def report_rows(db, job_id, paging, status=None):
    job = get(db, ImportJob, job_id)
    if job.status not in {"READY_FOR_REVIEW", "APPROVED", "CANCELLED"}:
        raise AppError(409, "تقرير المراجعة غير متاح بعد", "report_unavailable")
    query = select(ImportRecord).where(ImportRecord.import_job_id == job_id).order_by(ImportRecord.row_number)
    if status:
        query = query.where(ImportRecord.validation_status == status)
    page = paginate(db, query, paging, lambda row: row[0])
    ids = [r.id for r in page.items]
    errors = {}
    if ids:
        for error in db.scalars(select(ImportRecordError).where(ImportRecordError.import_row_id.in_(ids)).order_by(ImportRecordError.error_code)):
            errors.setdefault(error.import_row_id, []).append(RecordErrorOut.model_validate(error))
    return {"total": page.total, "page": page.page, "page_size": page.page_size,
            "items": [ImportRecordOut(id=r.id, row_number=r.row_number, validation_status=r.validation_status,
                        raw_data=json.loads(r.raw_data_json), errors=errors.get(r.id, [])) for r in page.items]}


def approve(db, job_id, actor, ip):
    try:
        job = get(db, ImportJob, job_id, lock=True)
        require_review(job)
        records = db.scalars(select(ImportRecord).where(ImportRecord.import_job_id == job_id,
                            ImportRecord.validation_status == "VALID").order_by(ImportRecord.row_number)).all()
        for offset in range(0, len(records), 250):
            chunk = records[offset:offset + 250]
            nids = [r.normalized_national_id for r in chunk]
            conflicts = db.scalars(locked(select(Recruit).where(Recruit.national_id.in_(nids)), db)).first()
            if conflicts:
                raise AppError(409, "أضيفت أرقام قومية بعد الفحص؛ أعد التحقق من الملف", "approval_duplicate")
            for record in chunk:
                parsed = json.loads(record.parsed_data_json)
                parsed["birth_date"] = date.fromisoformat(parsed["birth_date"])
                recruit = Recruit(id=uuid4(), **parsed, import_job_id=job.id, batch_number=job.batch_number,
                                  enlistment_year=job.enlistment_year)
                db.add(recruit)
                audit.write(db, action="create", user_id=actor.id, ip=ip, entity="recruit", entity_id=str(recruit.id),
                            new_values={"national_id": recruit.national_id, "name": recruit.name, "import_job_id": str(job.id)})
            db.flush()  # ORM batches rows; unique constraints still arbitrate concurrent imports.
        job.status = "APPROVED"
        job.approved_at = utcnow()
        job.approved_by_user_id = actor.id
        job.progress_version += 1
        audit.write(db, action="approve", user_id=actor.id, ip=ip, entity="import_job", entity_id=str(job.id),
                    old_values={"status": "READY_FOR_REVIEW"}, new_values={"status": "APPROVED", "inserted_count": len(records)})
        db.commit()
        publish(job)
        return {"id": str(job.id), "status": job.status, "inserted_count": len(records)}
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "تعارض بيانات أثناء الاعتماد؛ أعد التحقق من الملف", "approval_conflict") from exc
    except Exception:
        db.rollback()
        raise


def cancel(db, job_id, actor, ip):
    job = get(db, ImportJob, job_id, lock=True)
    require_review(job)
    job.status = "CANCELLED"
    job.cancelled_at = utcnow()
    job.progress_version += 1
    audit.write(db, action="cancel", user_id=actor.id, ip=ip, entity="import_job", entity_id=str(job.id),
                old_values={"status": "READY_FOR_REVIEW"}, new_values={"status": "CANCELLED"})
    db.commit()
    publish(job)
    return job


def detail(recruit):
    result = RecruitOut.model_validate(recruit)
    start = recruit.enlistment_start_date or initial_start(recruit.enlistment_year, recruit.batch_number)
    result.suggested_start_date = start
    result.suggested_end_date = recruit.enlistment_end_date or add_months(start, SERVICE_MONTHS[recruit.type_id])
    return result


def complete(db, recruit_id, body, actor, ip, edit=False):
    try:
        recruit = get(db, Recruit, recruit_id, lock=True)
        if recruit.is_locked and not edit:
            raise AppError(409, "السجل مغلق؛ التعديل متاح لمدير النظام فقط", "profile_locked")
        if body.revision is not None and recruit.revision != body.revision:
            raise AppError(409, "تم تعديل السجل؛ أعد تحميله", "revision_conflict")
        try:
            expected = add_months(body.enlistment_start_date, SERVICE_MONTHS[recruit.type_id])
        except ValueError as exc:
            raise AppError(422, "تاريخ بداية التجنيد خارج النطاق المسموح", "invalid_enlistment_date") from exc
        if body.enlistment_end_date != expected:
            raise AppError(422, "تاريخ نهاية التجنيد لا يطابق مدة المؤهل", "invalid_enlistment_duration")
        conflict = db.scalar(select(Recruit.id).where(Recruit.police_number == body.police_number,
                    Recruit.enlistment_year == recruit.enlistment_year, Recruit.id != recruit.id))
        if conflict:
            raise AppError(409, "رقم الشرطة مسجل لنفس سنة التجنيد", "duplicate_police_number")
        before = RecruitOut.model_validate(recruit).model_dump(mode="json")
        recruit.police_number = body.police_number
        recruit.enlistment_start_date = body.enlistment_start_date
        recruit.enlistment_end_date = body.enlistment_end_date
        if edit and body.name:
            recruit.name = body.name
            recruit.normalized_name = normalize_name(body.name)
        if not recruit.barcode:
            # Sequence reservation and lock happen in this same SQL transaction.
            sequence = db.scalar(text("SELECT NEXT VALUE FOR dbo.conscript_barcode_seq"))
            from app.modules.conscripts.barcode import format_barcode
            recruit.barcode = format_barcode(recruit.enlistment_year, recruit.batch_number, int(sequence))
        recruit.is_locked = True
        recruit.completed_at = recruit.completed_at or utcnow()
        recruit.completed_by_user_id = recruit.completed_by_user_id or actor.id
        recruit.updated_at = utcnow()
        recruit.revision += 1
        audit.write(db, action="update" if edit else "complete", user_id=actor.id, ip=ip, entity="recruit",
                    entity_id=str(recruit.id), old_values=before,
                    new_values=RecruitOut.model_validate(recruit).model_dump(mode="json"))
        db.commit()
        return detail(recruit)
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "تعارض بيانات السجل أو رقم الشرطة", "profile_conflict") from exc
    except Exception:
        db.rollback()
        raise


def search(db, paging, search=None, national_id=None, barcode=None, name=None, police_number=None, enlistment_year=None):
    if bool(police_number) != (enlistment_year is not None):
        raise AppError(422, "يجب إدخال رقم الشرطة وسنة التجنيد معاً", "police_year_required")
    query = select(Recruit).order_by(Recruit.created_at.desc(), Recruit.id)
    if search:
        pattern = like_contains(normalize_name(search.strip()))
        query = query.where(or_(Recruit.national_id == search.strip(), Recruit.barcode == search.strip(),
                               Recruit.normalized_name.like(pattern)))
    if national_id:
        query = query.where(Recruit.national_id == national_id)
    if barcode:
        query = query.where(Recruit.barcode == barcode)
    if name:
        query = query.where(Recruit.normalized_name.like(like_contains(normalize_name(name.strip()))))
    if police_number:
        query = query.where(Recruit.police_number == police_number, Recruit.enlistment_year == enlistment_year)
    return paginate(db, query, paging, lambda row: detail(row[0]))
