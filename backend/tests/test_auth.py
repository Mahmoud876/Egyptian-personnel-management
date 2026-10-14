from collections.abc import Callable
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.core.db import get_sessionmaker
from app.core.models import UserSession
from app.core.security import session_id_for, utcnow
from app.main import create_app
from tests.helpers import UserInfo, audit_rows, login


def test_login_sets_session_cookie_and_returns_me(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user("conscripts.view", "conscripts.enter")

    response = login(client, user)

    assert response.status_code == 200
    body = response.json()
    assert body["username"] == user.username
    assert body["permissions"] == ["conscripts.enter", "conscripts.view"]
    assert body["must_change_password"] is False
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert [row.action for row in audit_rows(user.id)] == ["login"]


def test_session_token_is_stored_hashed(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user()
    login(client, user)
    token = client.cookies["session"]

    with get_sessionmaker()() as session:
        ids = list(session.scalars(select(UserSession.id).where(UserSession.user_id == user.id)))
    assert ids == [session_id_for(token)]
    assert token not in ids


def test_me_returns_current_user(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user("audit.view")
    login(client, user)

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json()["permissions"] == ["audit.view"]


def test_me_without_session_is_401(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"


def test_wrong_password_is_rejected_and_audited(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user()

    response = login(client, user, password="wrong-password")

    assert response.status_code == 401
    assert response.json() == {"detail": "اسم المستخدم أو كلمة المرور غير صحيحة", "code": "invalid_credentials"}
    [row] = audit_rows(user.id, "login_failed")
    assert '"reason": "wrong_password"' in (row.new_values or "")


def test_unknown_user_is_rejected_and_audited(client: TestClient) -> None:
    response = client.post("/api/v1/auth/login", json={"username": "no_such_user_x1", "password": "whatever-123"})

    assert response.status_code == 401
    rows = [r for r in audit_rows(action="login_failed") if "no_such_user_x1" in (r.new_values or "")]
    assert len(rows) == 1
    assert rows[0].user_id is None


def test_inactive_user_cannot_log_in(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user(is_active=False)

    response = login(client, user)

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


def test_logout_ends_the_session(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user()
    login(client, user)
    token = client.cookies["session"]

    assert client.post("/api/v1/auth/logout").status_code == 204

    client.cookies.set("session", token)  # replaying the old cookie must not work
    assert client.get("/api/v1/auth/me").status_code == 401
    assert [row.action for row in audit_rows(user.id)] == ["login", "logout"]


def test_idle_session_expires(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user()
    login(client, user)
    with get_sessionmaker()() as session:
        session.execute(
            update(UserSession)
            .where(UserSession.user_id == user.id)
            .values(last_seen_at=utcnow() - timedelta(minutes=31))
        )
        session.commit()

    assert client.get("/api/v1/auth/me").status_code == 401


def test_pending_password_change_blocks_other_routes(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user(must_change_password=True)
    login(client, user)

    # me works, so the frontend can send the user to the change-password screen...
    assert client.get("/api/v1/auth/me").json()["must_change_password"] is True
    # ...but any other signed-in route is refused until the password is changed.
    response = client.post("/api/v1/auth/permission-check", json={"permission": "users.view", "path": "/x"})
    assert response.status_code == 403
    assert response.json()["code"] == "password_change_required"

    response = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": user.password, "new_password": "New-pass-456"},
    )
    assert response.status_code == 204
    assert client.get("/api/v1/auth/me").json()["must_change_password"] is False
    assert login(client, user).status_code == 401
    assert login(client, user, password="New-pass-456").status_code == 200


def test_change_password_rejects_wrong_current_password(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user()
    login(client, user)

    response = client.post(
        "/api/v1/auth/change-password", json={"current_password": "nope-nope", "new_password": "New-pass-456"}
    )

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_current_password"


def test_change_password_rejects_short_password(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user()
    login(client, user)

    response = client.post(
        "/api/v1/auth/change-password", json={"current_password": user.password, "new_password": "short"}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_change_password_signs_out_other_sessions(make_user: Callable[..., UserInfo]) -> None:
    user = make_user()
    with TestClient(create_app()) as first, TestClient(create_app()) as second:
        login(first, user)
        login(second, user)

        response = first.post(
            "/api/v1/auth/change-password",
            json={"current_password": user.password, "new_password": "New-pass-456"},
        )

        assert response.status_code == 204
        assert first.get("/api/v1/auth/me").status_code == 200
        assert second.get("/api/v1/auth/me").status_code == 401
