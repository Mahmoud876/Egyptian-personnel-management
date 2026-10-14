import pytest
from fastapi.testclient import TestClient

from app.core import health


def test_health_reports_database_reachable(client: TestClient) -> None:
    # Needs the dev database running (scripts/test.ps1 starts it). No session cookie: health is public.
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": {"reachable": True}, "redis": {"reachable": True}}


def test_health_returns_503_when_database_unreachable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class BrokenEngine:
        def connect(self) -> None:
            raise OSError("connection refused")

    monkeypatch.setattr(health, "get_engine", lambda: BrokenEngine())

    response = client.get("/api/v1/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": {"reachable": False}, "redis": {"reachable": True}}
