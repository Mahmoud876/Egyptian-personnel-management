"""Generic create / update for the lookup tables, with audit and Arabic errors for constraint violations."""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from fastapi import status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.admin.models import Governorate
from app.core import audit, messages
from app.core.errors import AppError
from app.core.models import Base
from app.core.permissions import CurrentUser
from app.core.queries import violated_constraint
from app.core.security import utcnow

Validator = Callable[[Session, BaseModel], None]


@dataclass(frozen=True)
class LookupKind:
    path: str  # URL segment, e.g. "police-stations"
    model: type[Base]
    order_by: str  # column name
    validate: Validator | None = field(default=None)

    @property
    def table(self) -> str:
        return str(self.model.__tablename__)


def _snapshot(row: Base, fields: list[str]) -> dict[str, Any]:
    return {name: getattr(row, name) for name in fields}


def _flush(db: Session) -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        name = violated_constraint(exc) or ""
        if name.startswith("UQ_"):
            raise AppError(status.HTTP_409_CONFLICT, messages.LOOKUP_DUPLICATE, "duplicate") from exc
        if name.startswith("CK_batch_schedule"):
            raise AppError(
                status.HTTP_422_UNPROCESSABLE_CONTENT, messages.INVALID_BATCH_START, "invalid_batch_start"
            ) from exc
        raise AppError(status.HTTP_422_UNPROCESSABLE_CONTENT, messages.LOOKUP_INVALID, "invalid") from exc


def list_rows(db: Session, kind: LookupKind) -> list[Any]:
    return list(db.scalars(select(kind.model).order_by(getattr(kind.model, kind.order_by))))


def create_row(db: Session, actor: CurrentUser, kind: LookupKind, body: BaseModel, ip: str | None) -> Any:
    if kind.validate:
        kind.validate(db, body)
    values = body.model_dump()
    row = kind.model(**values, created_by=actor.id)
    db.add(row)
    _flush(db)
    audit.write(
        db, action="create", user_id=actor.id, ip=ip, entity=kind.table, entity_id=_key(row),
        new_values=_snapshot(row, list(values)),
    )
    db.commit()
    return row


def update_row(db: Session, actor: CurrentUser, kind: LookupKind, key: int, body: BaseModel, ip: str | None) -> Any:
    row = db.get(kind.model, key)
    if row is None:
        raise AppError(status.HTTP_404_NOT_FOUND, messages.LOOKUP_NOT_FOUND, "not_found")
    if kind.validate:
        kind.validate(db, body)
    values = body.model_dump()
    old = _snapshot(row, list(values))
    for name, value in values.items():
        setattr(row, name, value)
    row.updated_at = utcnow()  # type: ignore[attr-defined]
    row.updated_by = actor.id  # type: ignore[attr-defined]
    _flush(db)
    audit.write(
        db, action="update", user_id=actor.id, ip=ip, entity=kind.table, entity_id=key,
        old_values=old, new_values=_snapshot(row, list(values)),
    )
    db.commit()
    return row


def _key(row: Base) -> object:
    return getattr(row, "id", None) or getattr(row, "batch_no", None)


def validate_police_station(db: Session, body: BaseModel) -> None:
    """docs/business-rules.md#input-file: the first 2 digits of a police station code are its governorate code."""
    governorate = db.get(Governorate, body.governorate_id)  # type: ignore[attr-defined]
    if governorate is None:
        raise AppError(status.HTTP_422_UNPROCESSABLE_CONTENT, messages.UNKNOWN_GOVERNORATE, "unknown_governorate")
    if not body.code.startswith(governorate.code):  # type: ignore[attr-defined]
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_CONTENT, messages.POLICE_STATION_CODE_MISMATCH, "police_station_code_mismatch"
        )
