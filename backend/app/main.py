"""Application factory. Run with: uvicorn --factory app.main:create_app"""

from fastapi import APIRouter, FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.types import Scope

import app.models  # noqa: F401  (registers every table before any query)
from app.admin.audit.router import router as audit_router
from app.admin.lookups.router import router as lookups_router
from app.admin.templates.router import router as templates_router
from app.admin.users.router import router as users_router
from app.auth.router import router as auth_router
from app.recruits.router import router as recruits_router
from app.core import health
from app.core.config import get_settings
from app.core.errors import install_error_handlers

API_PREFIX = "/api/v1"


class SpaStaticFiles(StaticFiles):
    """Serves the built frontend. Unknown non-API paths fall back to index.html for client-side routing."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            request_path: str = scope["path"]
            if exc.status_code != 404 or request_path == "/api" or request_path.startswith("/api/"):
                raise
            return await super().get_response("index.html", scope)


def create_app() -> FastAPI:
    settings = get_settings()
    dev = settings.env == "dev"

    app = FastAPI(
        title="Personnel Systems API",
        version="0.1.0",
        docs_url="/docs" if dev else None,
        redoc_url=None,
        openapi_url="/openapi.json" if dev else None,
    )
    install_error_handlers(app)

    api = APIRouter(prefix=API_PREFIX)
    for router in (health.router, auth_router, users_router, audit_router, lookups_router, recruits_router):
        api.include_router(router)
    app.include_router(api)

    # Production: the backend serves the built frontend. Mounted last so API routes win.
    if settings.frontend_dist.is_dir():
        app.mount("/", SpaStaticFiles(directory=settings.frontend_dist, html=True), name="frontend")

    return app
