"""Helpers shared by tests (fixtures live in conftest.py)."""

from dataclasses import dataclass

from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.core.models import AuditLog

DEFAULT_PASSWORD = "Test-pass-123"


@dataclass(frozen=True)
class UserInfo:
    id: int
    username: str
    password: str


def login(client: TestClient, user: UserInfo, password: str | None = None) -> Response:
    return client.post("/api/v1/auth/login", json={"username": user.username, "password": password or user.password})


def audit_rows(user_id: int | None = None, action: str | None = None) -> list[AuditLog]:
    with get_sessionmaker()() as session:
        query = select(AuditLog).order_by(AuditLog.id)
        if user_id is not None:
            query = query.where(AuditLog.user_id == user_id)
        if action is not None:
            query = query.where(AuditLog.action == action)
        return list(session.scalars(query))
