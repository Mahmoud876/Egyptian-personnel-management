from collections.abc import Callable
from uuid import uuid4

from fastapi.testclient import TestClient

from tests.helpers import UserInfo, audit_rows, login

from app.core.roles import permissions_for_role
DATA_ENTRY = sorted(permissions_for_role("data_entry_operator"))


def _new_user_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "username": f"n_{uuid4().hex[:10]}",
        "full_name": "أحمد محمد علي",
        "password": "Initial-pass-1",
        "role": "data_entry_operator",
    }
    body.update(overrides)
    return body


def test_admin_creates_user_who_can_log_in(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    admin = make_user("users.view", "users.manage")
    login(client, admin)
    body = _new_user_body()

    created = client.post("/api/v1/users", json=body)

    assert created.status_code == 201
    user = created.json()
    assert user["permissions"] == DATA_ENTRY
    assert user["must_change_password"] is True
    [row] = [r for r in audit_rows(admin.id, "create") if r.entity_id == str(user["id"])]
    assert "Initial-pass-1" not in (row.new_values or "")

    me = login(client, UserInfo(user["id"], str(body["username"]), str(body["password"]))).json()
    assert me["permissions"] == DATA_ENTRY


def test_duplicate_username_is_409(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    login(client, make_user("users.manage"))
    body = _new_user_body()
    client.post("/api/v1/users", json=body)

    response = client.post("/api/v1/users", json=body)

    assert response.status_code == 409
    assert response.json()["code"] == "username_taken"


def test_unknown_permission_code_is_rejected(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    login(client, make_user("users.manage"))

    response = client.post("/api/v1/users", json=_new_user_body(permissions=["conscripts.view", "made.up"]))

    assert response.status_code == 422
    assert response.json()["code"] == "role_permissions_only"


def test_list_and_search_users(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    viewer = make_user("users.view")
    login(client, viewer)

    response = client.get("/api/v1/users", params={"q": viewer.username})

    assert response.status_code == 200
    page = response.json()
    assert page["total"] == 1
    assert page["items"][0]["username"] == viewer.username
    assert page["items"][0]["permission_count"] == len(permissions_for_role("system_administrator"))


def test_search_matches_arabic_name_variants(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    login(client, make_user("users.view", "users.manage"))
    marker = uuid4().hex[:6]
    client.post("/api/v1/users", json=_new_user_body(full_name=f"إبراهيم مصطفى {marker}"))

    # Typed without hamza and with ي instead of ى.
    response = client.get("/api/v1/users", params={"q": f"ابراهيم مصطفي {marker}"})

    assert response.json()["total"] == 1


def test_direct_permission_grants_are_rejected(client, make_user):
    admin = make_user(role="system_administrator")
    target = make_user()
    login(client, admin)
    response = client.put(f"/api/v1/users/{target.id}/permissions", json={"permissions": ["audit:get"]})
    assert response.status_code == 409
    assert response.json()["code"] == "role_permissions_only"


def test_admin_cannot_demote_self(client, make_user):
    admin = make_user(role="system_administrator")
    login(client, admin)
    response = client.put(f"/api/v1/users/{admin.id}", json={"full_name": "Admin", "work_entity_id": None,
                          "is_active": True, "role": "data_entry_operator"})
    assert response.status_code == 400
    assert response.json()["code"] == "cannot_change_own_role"


def test_deactivating_a_user_ends_their_sessions(make_user: Callable[..., UserInfo]) -> None:
    from app.main import create_app

    admin = make_user("users.manage")
    target = make_user()
    with TestClient(create_app()) as admin_client, TestClient(create_app()) as target_client:
        login(admin_client, admin)
        login(target_client, target)

        response = admin_client.put(
            f"/api/v1/users/{target.id}", json={"full_name": "موقوف", "work_entity_id": None, "is_active": False}
        )

        assert response.status_code == 200
        assert target_client.get("/api/v1/auth/me").status_code == 401


def test_admin_cannot_deactivate_self(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    admin = make_user("users.manage")
    login(client, admin)

    response = client.put(f"/api/v1/users/{admin.id}", json={"full_name": "x", "work_entity_id": None, "is_active": False})

    assert response.json()["code"] == "cannot_deactivate_self"


def test_reset_password_forces_change(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    admin = make_user("users.manage")
    target = make_user()
    login(client, admin)

    assert client.post(f"/api/v1/users/{target.id}/reset-password", json={"new_password": "Reset-pass-9"}).status_code == 204

    me = login(client, target, password="Reset-pass-9").json()
    assert me["must_change_password"] is True


def test_users_view_cannot_modify(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    viewer = make_user(role="data_entry_operator")
    login(client, viewer)

    response = client.post("/api/v1/users", json=_new_user_body())

    assert response.status_code == 403
    assert audit_rows(viewer.id, "denied")[0].permission_code == "user:insert"


def test_permission_catalog_is_grouped_by_module(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    login(client, make_user("users.view"))

    codes = client.get("/api/v1/permissions").json()

    assert {"file:insert", "user:update", "profile:insert"} <= {c["code"] for c in codes}
    assert codes[0]["module"] == "admin"
