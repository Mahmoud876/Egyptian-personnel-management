"""Templates, audit viewer and lookups."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from tests.helpers import UserInfo, audit_rows, login

def test_roles_are_listed_for_admin(client, make_user):
    login(client, make_user(role="system_administrator"))
    roles = {r["role"]: r["permissions"] for r in client.get("/api/v1/roles").json()}
    assert "file:insert" in roles["system_administrator"]
    assert set(roles["data_entry_operator"]) == {"profile:get", "profile:insert", "barcode:get"}


def test_legacy_templates_are_retired(client, make_user):
    login(client, make_user(role="system_administrator"))
    assert client.post("/api/v1/templates", json={"name_ar": "test", "permissions": []}).status_code == 404


def test_operator_cannot_list_roles(client, make_user):
    login(client, make_user(role="data_entry_operator"))
    assert client.get("/api/v1/roles").status_code == 403


# --- audit viewer --------------------------------------------------------------


def test_audit_log_filters_by_user_and_action(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    someone = make_user("conscripts.view")
    login(client, someone)
    client.get("/api/v1/users")  # denied, audited
    auditor = make_user("audit.view")
    login(client, auditor)

    page = client.get("/api/v1/audit", params={"user_id": someone.id, "action": "denied"}).json()

    assert page["total"] == 1
    entry = page["items"][0]
    assert entry["username"] == someone.username
    assert entry["permission_code"] == "user:get"
    assert entry["new_values"] == {"missing": ["user:get"], "required": ["user:get"]}
    assert entry["at"].endswith("Z") or entry["at"].endswith("+00:00")


def test_audit_log_date_range(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    auditor = make_user("audit.view")
    login(client, auditor)
    now = datetime.now(UTC)

    recent = client.get(
        "/api/v1/audit",
        params={"user_id": auditor.id, "date_from": (now - timedelta(minutes=5)).isoformat()},
    ).json()
    future = client.get(
        "/api/v1/audit",
        params={"user_id": auditor.id, "date_from": (now + timedelta(days=1)).isoformat()},
    ).json()

    assert recent["total"] >= 1
    assert future["total"] == 0


def test_audit_facets(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    auditor = make_user("audit.view")
    login(client, auditor)

    facets = client.get("/api/v1/audit/facets").json()

    assert "login" in facets["actions"]
    assert auditor.username in {u["username"] for u in facets["users"]}


def test_audit_log_needs_audit_view(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    login(client, make_user(role="data_entry_operator"))

    assert client.get("/api/v1/audit").status_code == 403


# --- lookups -------------------------------------------------------------------


def test_any_signed_in_user_can_read_lookups(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    login(client, make_user())

    governorates = client.get("/api/v1/lookups/governorates").json()
    batches = client.get("/api/v1/lookups/batch-schedules").json()

    assert len(governorates) == 12
    assert batches[1] == {"batch_no": 2, "start_month": 4, "start_day": 1}


def test_lookups_manage_creates_and_updates(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    admin = make_user("lookups.manage")
    login(client, admin)
    code = uuid4().hex[:8]

    created = client.post("/api/v1/lookups/work-entities", json={"code": code, "name_ar": f"جهة {code}"})
    updated = client.put(
        f"/api/v1/lookups/work-entities/{created.json()['id']}",
        json={"code": code, "name_ar": f"جهة معدلة {code}", "is_active": False},
    )
    duplicate = client.post("/api/v1/lookups/work-entities", json={"code": code, "name_ar": "أخرى"})

    assert created.status_code == 201
    assert updated.json()["is_active"] is False
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "duplicate"
    assert [r.action for r in audit_rows(admin.id) if r.entity == "work_entity"] == ["create", "update"]


def test_police_station_code_must_start_with_governorate_code(
    client: TestClient, make_user: Callable[..., UserInfo]
) -> None:
    login(client, make_user("lookups.manage"))
    cairo = next(g for g in client.get("/api/v1/lookups/governorates").json() if g["code"] == "01")

    response = client.post(
        "/api/v1/lookups/police-stations", json={"code": "0299", "name_ar": "قسم خطأ", "governorate_id": cairo["id"]}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "police_station_code_mismatch"


def test_lookup_codes_reject_arabic_indic_digits(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    login(client, make_user("lookups.manage"))

    response = client.post("/api/v1/lookups/governorates", json={"code": "٠٩", "name_ar": "اختبار"})

    assert response.status_code == 422


def test_batch_schedule_rejects_impossible_dates(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    login(client, make_user("lookups.manage"))

    response = client.put("/api/v1/lookups/batch-schedules/1", json={"start_month": 2, "start_day": 30})

    assert response.status_code == 422


def test_writing_lookups_needs_lookups_manage(client: TestClient, make_user: Callable[..., UserInfo]) -> None:
    user = make_user(role="data_entry_operator")
    login(client, user)

    response = client.post("/api/v1/lookups/action-types", json={"code": "x", "name_ar": "س"})

    assert response.status_code == 403
    assert audit_rows(user.id, "denied")[0].permission_code == "lookups.manage"
