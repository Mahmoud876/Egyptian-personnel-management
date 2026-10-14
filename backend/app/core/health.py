"""GET /api/v1/health: public liveness check that also reports whether the database is reachable."""

import logging
from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.core.db import get_engine

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


class DatabaseHealth(BaseModel):
    reachable: bool


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: DatabaseHealth


def check_database() -> DatabaseHealth:
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Database health check failed")
        return DatabaseHealth(reachable=False)
    return DatabaseHealth(reachable=True)


# Public by design: one of the two routes exempt from require_permission (see CLAUDE.md).
@router.get(
    "/health",
    response_model=HealthResponse,
    responses={503: {"model": HealthResponse, "description": "Database unreachable"}},
)
def health(response: Response) -> HealthResponse:
    database = check_database()
    if not database.reachable:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(status="ok" if database.reachable else "degraded", database=database)
