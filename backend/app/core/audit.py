"""Audit log helper. Every write goes through write(), in the same transaction as the change it records."""

import json
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.models import AuditLog


def client_ip(request: Request) -> str | None:
    # TODO: honour X-Forwarded-For once the production reverse proxy is known.
    return request.client.host if request.client else None


def _to_json(values: dict[str, Any] | None) -> str | None:
    if values is None:
        return None
    return json.dumps(values, ensure_ascii=False, default=str, sort_keys=True)


def write(
    db: Session,
    *,
    action: str,
    user_id: int | None = None,
    ip: str | None = None,
    entity: str | None = None,
    entity_id: object = None,
    permission_code: str | None = None,
    old_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    batch_id: int | None = None,
) -> None:
    """Adds an audit row to the session. The caller commits, so the row is saved together with the change."""
    db.add(
        AuditLog(
            action=action,
            user_id=user_id,
            ip=ip,
            entity=entity,
            entity_id=None if entity_id is None else str(entity_id),
            permission_code=permission_code,
            old_values=_to_json(old_values),
            new_values=_to_json(new_values),
            batch_id=batch_id,
        )
    )
