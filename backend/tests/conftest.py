"""Test setup. Tests run against their own database (personnel_test), rebuilt from backend/sql at every run,
so they can commit freely (audit rows can't be deleted by the app login) without touching the dev database.
"""

import os

# Before any app import: settings are read once and cached.
os.environ["DB_NAME"] = os.environ.get("TEST_DB_NAME", "personnel_test")
os.environ["SESSION_COOKIE_SECURE"] = "false"
os.environ["REDIS_PREFIX"] = os.environ.get("TEST_REDIS_PREFIX", "personnel-test")
os.environ["QUEUE_NAME"] = os.environ.get("TEST_QUEUE_NAME", "personnel-test")
os.environ["STORAGE_ROOT"] = os.environ.get("TEST_STORAGE_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "../../tmp/test-storage")))
os.environ["FRONTEND_DIST"] = os.path.join(os.path.dirname(__file__), "no-frontend-build")

from collections.abc import Callable, Iterator  # noqa: E402
from uuid import uuid4  # noqa: E402

import pyodbc  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import Connection  # noqa: E402

from app.cli.db_init import admin_connection_string, apply_scripts  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.db import get_engine, get_sessionmaker  # noqa: E402
from app.core.models import AppUser, UserPermission  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import create_app  # noqa: E402
from tests.helpers import DEFAULT_PASSWORD, UserInfo  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def test_database() -> None:
    settings = get_settings()
    name = settings.db_name
    assert name.endswith("_test"), f"refusing to rebuild non-test database {name!r}"
    connection = pyodbc.connect(admin_connection_string(settings), autocommit=True)
    try:
        connection.execute(
            f"IF DB_ID(N'{name}') IS NOT NULL BEGIN "
            f"ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{name}]; END"
        )
    finally:
        connection.close()
    apply_scripts(settings, log=lambda _: None)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture
def db() -> Iterator[Connection]:
    """Connection as the app login inside a transaction that is always rolled back."""
    with get_engine().connect() as connection:
        transaction = connection.begin()
        try:
            yield connection
        finally:
            transaction.rollback()


@pytest.fixture
def make_user() -> Callable[..., UserInfo]:
    """Creates a role-based user; legacy grants are retained only for compatibility tests."""

    def make(
        *permissions: str,
        password: str = DEFAULT_PASSWORD,
        is_active: bool = True,
        must_change_password: bool = False,
        work_entity_id: int | None = None,
        role: str | None = None,
    ) -> UserInfo:
        username = f"t_{uuid4().hex[:12]}"
        with get_sessionmaker()() as session:
            user = AppUser(
                role=role or ("system_administrator" if any(p.startswith(("users.", "audit.", "templates.", "lookups.")) for p in permissions) else "data_entry_operator"),
                username=username,
                full_name="مستخدم اختبار",
                password_hash=hash_password(password),
                is_active=is_active,
                must_change_password=must_change_password,
                work_entity_id=work_entity_id,
            )
            session.add(user)
            session.flush()
            session.add_all(UserPermission(user_id=user.id, permission_code=code) for code in permissions)
            session.commit()
            return UserInfo(user.id, username, password)

    return make
