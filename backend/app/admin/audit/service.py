import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, or_, cast, String
from sqlalchemy.orm import Session

from app.core.models import AppUser, AuditLog
from app.core.queries import PageParams, paginate, like_contains
from app.core.schemas import Page

from .schemas import AuditEntry, AuditFacets, AuditUser


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
    statement = (
        select(AuditLog, AppUser.username, AppUser.full_name)
        .outerjoin(AppUser, AppUser.id == AuditLog.user_id)
        .order_by(AuditLog.id.desc())
    )
    if q:
        pattern = like_contains(q.strip())
        statement = statement.where(or_(AppUser.username.like(pattern), AppUser.full_name.like(pattern),
            cast(AuditLog.user_id, String).like(pattern), AuditLog.action.like(pattern),
            AuditLog.entity.like(pattern), AuditLog.entity_id.like(pattern),
            AuditLog.old_values.like(pattern), AuditLog.new_values.like(pattern)))
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
