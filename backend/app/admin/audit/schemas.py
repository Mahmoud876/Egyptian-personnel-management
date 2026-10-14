from typing import Any

from pydantic import BaseModel

from app.core.schemas import UtcDatetime


class AuditEntry(BaseModel):
    id: int
    at: UtcDatetime
    user_id: int | None
    username: str | None
    full_name: str | None
    ip: str | None
    action: str
    entity: str | None
    entity_id: str | None
    permission_code: str | None
    old_values: dict[str, Any] | None
    new_values: dict[str, Any] | None
    batch_id: int | None


class AuditUser(BaseModel):
    id: int
    username: str
    full_name: str


class AuditFacets(BaseModel):
    actions: list[str]
    entities: list[str]
    users: list[AuditUser]
