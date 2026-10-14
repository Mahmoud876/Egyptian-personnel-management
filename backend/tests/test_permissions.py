from collections.abc import Callable, Iterator

import pytest
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient

from app.core.permissions import require_any_permission, require_permission
from app.main import create_app
from tests.helpers import UserInfo, audit_rows, login


@pytest.fixture
def guarded() -> Iterator[TestClient]:
    """The real app plus two test-only routes behind permissions."""
    app = create_app()
    router = APIRouter(prefix="/api/v1/_test")

    @router.get("/needs-users-view")
    def needs_users_view(_: object = Depends(require_permission("users.view"))) -> dict[str, bool]:
        return {"ok": True}

    @router.get("/needs-all")
    def needs_all(_: object = Depends(require_permission("users.view", "users.manage"))) -> dict[str, bool]:
        return {"ok": True}

    @router.get("/needs-any")
    def needs_any(_: object = Depends(require_any_permission("users.view", "audit.view"))) -> dict[str, bool]:
        return {"ok": True}

    app.include_router(router)
    with TestClient(app) as client:
        yield client


def test_user_with_the_code_is_allowed(guarded: TestClient, make_user: Callable[..., UserInfo]) -> None:
    login(guarded, make_user("users.view"))

    assert guarded.get("/api/v1/_test/needs-users-view").json() == {"ok": True}


def test_user_without_the_code_gets_403_and_is_audited(guarded: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user("conscripts.view")
    login(guarded, user)

    response = guarded.get("/api/v1/_test/needs-users-view")

    assert response.status_code == 403
    assert response.json() == {"detail": "ليس لديك صلاحية لتنفيذ هذا الإجراء", "code": "forbidden"}
    [row] = audit_rows(user.id, "denied")
    assert row.permission_code == "users.view"
    assert row.entity == "route"
    assert row.entity_id == "GET /api/v1/_test/needs-users-view"


def test_all_listed_codes_are_required(guarded: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user("users.view")
    login(guarded, user)

    assert guarded.get("/api/v1/_test/needs-all").status_code == 403
    [row] = audit_rows(user.id, "denied")
    assert row.permission_code == "users.manage"


def test_any_permission_needs_one_of_the_codes(guarded: TestClient, make_user: Callable[..., UserInfo]) -> None:
    login(guarded, make_user("audit.view"))
    assert guarded.get("/api/v1/_test/needs-any").status_code == 200

    login(guarded, make_user("conscripts.view"))
    assert guarded.get("/api/v1/_test/needs-any").status_code == 403


def test_template_name_grants_nothing(guarded: TestClient, make_user: Callable[..., UserInfo]) -> None:
    # Only codes count: a user with no codes is refused whatever templates exist.
    login(guarded, make_user())
    assert guarded.get("/api/v1/_test/needs-users-view").status_code == 403


def test_unauthenticated_request_is_401_not_audited(guarded: TestClient) -> None:
    before = len(audit_rows(action="denied"))

    response = guarded.get("/api/v1/_test/needs-users-view")

    assert response.status_code == 401
    assert len(audit_rows(action="denied")) == before


def test_permission_check_endpoint(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user("conscripts.view")
    login(client, user)

    allowed = client.post("/api/v1/auth/permission-check", json={"permission": "conscripts.view", "path": "/c"})
    denied = client.post("/api/v1/auth/permission-check", json={"permission": "users.view", "path": "/admin/users"})
    unknown = client.post("/api/v1/auth/permission-check", json={"permission": "no.such", "path": "/x"})

    assert allowed.status_code == 204
    assert denied.status_code == 403
    assert unknown.status_code == 404
    [row] = audit_rows(user.id, "denied")
    assert (row.permission_code, row.entity_id) == ("users.view", "screen /admin/users")


def test_errors_use_detail_and_code(client: TestClient) -> None:
    not_found = client.get("/api/v1/does-not-exist")
    invalid = client.post("/api/v1/auth/login", json={"username": ""})

    assert not_found.status_code == 404
    assert not_found.json() == {"detail": "العنصر المطلوب غير موجود", "code": "not_found"}
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "validation_error"
