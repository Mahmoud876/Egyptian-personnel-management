from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.cli.create_admin import create_admin
from app.core.db import get_sessionmaker
from tests.helpers import UserInfo, login


def test_create_admin_grants_every_permission(client: TestClient) -> None:
    username = f"admin_{uuid4().hex[:8]}"
    with get_sessionmaker()() as db:
        password = create_admin(db, username, "مدير النظام", reset=False)

    response = login(client, UserInfo(0, username, password))

    assert response.status_code == 200
    me = response.json()
    assert me["role"] == "system_administrator"
    assert "user:insert" in me["permissions"]
    assert me["must_change_password"] is True


def test_create_admin_refuses_existing_user_unless_reset(client: TestClient) -> None:
    username = f"admin_{uuid4().hex[:8]}"
    with get_sessionmaker()() as db:
        create_admin(db, username, "مدير النظام", reset=False)
        with pytest.raises(ValueError):
            create_admin(db, username, "مدير النظام", reset=False)
        new_password = create_admin(db, username, "مدير النظام", reset=True)

    assert login(client, UserInfo(0, username, new_password)).status_code == 200
