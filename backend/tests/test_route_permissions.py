"""Hard rule (CLAUDE.md): every API route declares a permission, except login and health.

FastAPI (0.14x) keeps included routers as nested `_IncludedRouter` objects, so `app.routes` alone shows no API
routes and a naive check would pass vacuously. The walker below descends into them, and a guard compares the
number of routes found with the operations in the OpenAPI schema so the test fails loudly if FastAPI's
internals change. A black-box test checks the same rule through HTTP.
"""

import re
from dataclasses import dataclass

from fastapi import APIRouter, FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.permissions import PERMISSION_MARKER
from app.main import create_app

PUBLIC_ROUTES = {("POST", "/api/v1/auth/login"), ("GET", "/api/v1/health")}


@dataclass(frozen=True)
class RouteInfo:
    method: str
    path: str
    dependant: Dependant


def _walk(items: list[object], found: list[RouteInfo]) -> None:
    from fastapi import routing  # private types, imported here so a rename shows up as one clear failure

    for item in items:
        if isinstance(item, routing._IncludedRouter):
            _walk(list(item.effective_candidates()), found)
        elif isinstance(item, routing._EffectiveRouteContext):
            if isinstance(item.original_route, APIRoute) and item.dependant is not None:
                found.extend(RouteInfo(m, item.path, item.dependant) for m in item.methods)
        elif isinstance(item, APIRoute):
            found.extend(RouteInfo(m, item.path, item.dependant) for m in item.methods)


def _api_routes(app: FastAPI) -> list[RouteInfo]:
    found: list[RouteInfo] = []
    _walk(list(app.routes), found)
    return found


def _openapi_operations(app: FastAPI) -> set[tuple[str, str]]:
    return {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
        if method != "parameters"
    }


def _permission_markers(dependant: Dependant) -> list[tuple[str, ...]]:
    markers = []
    if dependant.call is not None and hasattr(dependant.call, PERMISSION_MARKER):
        markers.append(getattr(dependant.call, PERMISSION_MARKER))
    for child in dependant.dependencies:
        markers.extend(_permission_markers(child))
    return markers


def test_route_walker_sees_every_operation() -> None:
    app = create_app()
    walked = {(r.method, r.path) for r in _api_routes(app)}
    assert walked == _openapi_operations(app)
    assert PUBLIC_ROUTES <= walked


def test_detector_flags_an_unprotected_route() -> None:
    app = create_app()
    router = APIRouter(prefix="/api/v1/_test")

    @router.get("/open")
    def open_route() -> None: ...

    app.include_router(router)
    [route] = [r for r in _api_routes(app) if r.path == "/api/v1/_test/open"]
    assert _permission_markers(route.dependant) == []


def test_every_route_declares_a_permission() -> None:
    missing = [
        f"{r.method} {r.path}"
        for r in _api_routes(create_app())
        if (r.method, r.path) not in PUBLIC_ROUTES and not _permission_markers(r.dependant)
    ]
    assert missing == [], f"Routes without require_permission: {missing}"


def test_public_routes_have_no_permission() -> None:
    public = [r for r in _api_routes(create_app()) if (r.method, r.path) in PUBLIC_ROUTES]
    assert len(public) == len(PUBLIC_ROUTES)
    assert all(not _permission_markers(r.dependant) for r in public)


def test_every_non_public_operation_rejects_anonymous_requests(client: TestClient) -> None:
    operations = _openapi_operations(client.app)  # type: ignore[arg-type]
    accepted = []
    for method, path in sorted(operations - PUBLIC_ROUTES):
        url = re.sub(r"\{[^}]+\}", "1", path)
        response = client.request(method, url, json={})
        if response.status_code != 401:
            accepted.append(f"{method} {path} -> {response.status_code}")
    assert accepted == []


def test_routes_only_use_known_permission_codes(db: Connection) -> None:
    known = set(db.execute(text("SELECT code FROM dbo.permission")).scalars())
    used = {code for r in _api_routes(create_app()) for codes in _permission_markers(r.dependant) for code in codes}
    assert used <= known, f"Unknown permission codes: {sorted(used - known)}"
