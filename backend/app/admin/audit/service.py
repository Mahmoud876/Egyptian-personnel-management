import json
from datetime import UTC, datetime
from typing import Any
from pathlib import Path

from sqlalchemy import select, or_, and_, cast, String
from sqlalchemy.orm import Session

from app.core.models import AppUser, AuditLog
from app.core.queries import PageParams, paginate, like_contains
from app.core.schemas import Page
from app.core.errors import AppError
from app.recruits.models import Recruit, ImportRecord, ExportJob
from app.recruits.validation import normalize_name

from .schemas import AuditEntry, AuditFacets, AuditUser

# Search aliases mirror the Arabic display catalog; a regression test checks parity.
LABELS = json.loads(Path(__file__).with_name("labels.json").read_text(encoding="utf-8"))


def _naive_utc(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None) if value.tzinfo else value


def _parse(values: str | None) -> dict[str, Any] | None:
    if values is None:
        return None
    parsed = json.loads(values)
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def search(
    db: Session,
    params: PageParams,
    user_id: int | None = None,
    action: str | None = None,
    entity: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    q: str | None = None,
) -> Page[AuditEntry]:
    if date_from is not None and date_to is not None and _naive_utc(date_from) >= _naive_utc(date_to):
        raise AppError(422, "يجب أن يكون وقت النهاية بعد وقت البداية", "invalid_audit_range")
    statement = (
        select(AuditLog, AppUser.username, AppUser.full_name)
        .outerjoin(AppUser, AppUser.id == AuditLog.user_id)
        .order_by(AuditLog.id.desc())
    )
    if q and q.strip():
        pattern = like_contains(q.strip())
        term = normalize_name(q.strip()).casefold()
        actions = [code for code, label in LABELS["actions"].items() if term in normalize_name(label).casefold()]
        entities = [code for code, label in LABELS["entities"].items() if term in normalize_name(label).casefold()]
        recruits = or_(Recruit.national_id.like(pattern), Recruit.barcode.like(pattern),
            Recruit.police_number.like(pattern), Recruit.normalized_name.like(like_contains(normalize_name(q.strip()))))
        staged = or_(ImportRecord.national_id_raw.like(pattern), ImportRecord.corrected_data_json.like(pattern))
        import_ids = select(Recruit.import_job_id).where(recruits).union(
            select(ImportRecord.import_job_id).where(staged))
        statement = statement.where(or_(AppUser.username.like(pattern), AppUser.full_name.like(pattern),
            cast(AuditLog.user_id, String).like(pattern), AuditLog.action.like(pattern),
            AuditLog.entity.like(pattern), AuditLog.entity_id.like(pattern),
            AuditLog.old_values.like(pattern), AuditLog.new_values.like(pattern), AuditLog.ip.like(pattern),
            AuditLog.permission_code.like(pattern), AuditLog.action.in_(actions), AuditLog.entity.in_(entities),
            and_(AuditLog.entity == "recruit", AuditLog.entity_id.in_(select(cast(Recruit.id, String(36))).where(recruits))),
            and_(AuditLog.entity == "import_record", AuditLog.entity_id.in_(select(cast(ImportRecord.id, String(36))).where(staged))),
            and_(AuditLog.entity == "import_job", AuditLog.entity_id.in_(select(cast(import_ids.subquery().c.import_job_id, String(36))))),
            and_(AuditLog.entity == "export_job", AuditLog.entity_id.in_(select(cast(ExportJob.id, String(36)))
                .where(ExportJob.import_job_id.in_(import_ids))))))
    if user_id is not None:
        statement = statement.where(AuditLog.user_id == user_id)
    if action:
        statement = statement.where(AuditLog.action == action)
    if entity:
        statement = statement.where(AuditLog.entity == entity)
    if date_from is not None:
        statement = statement.where(AuditLog.at >= _naive_utc(date_from))
    if date_to is not None:
        statement = statement.where(AuditLog.at < _naive_utc(date_to))

    def to_item(row: tuple[AuditLog, str | None, str | None]) -> AuditEntry:
        log, username, full_name = row
        return AuditEntry(
            id=log.id,
            at=log.at,
            user_id=log.user_id,
            username=username,
            full_name=full_name,
            ip=log.ip,
            action=log.action,
            entity=log.entity,
            entity_id=log.entity_id,
            permission_code=log.permission_code,
            old_values=_parse(log.old_values),
            new_values=_parse(log.new_values),
            batch_id=log.batch_id,
        )

    return paginate(db, statement, params, to_item)


def facets(db: Session) -> AuditFacets:
    actions = sorted(db.scalars(select(AuditLog.action).distinct()))
    entities = sorted(e for e in db.scalars(select(AuditLog.entity).distinct()) if e)
    users = db.execute(
        select(AppUser.id, AppUser.username, AppUser.full_name)
        .where(AppUser.id.in_(select(AuditLog.user_id).where(AuditLog.user_id.is_not(None)).distinct()))
        .order_by(AppUser.username)
    ).all()
    return AuditFacets(
        actions=actions,
        entities=entities,
        users=[AuditUser(id=u.id, username=u.username, full_name=u.full_name) for u in users],
    )
