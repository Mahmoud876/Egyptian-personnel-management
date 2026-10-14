from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.permissions import CurrentUser, require_permission
from app.core.queries import PageParams, page_params
from app.core.schemas import Page

from . import service
from .schemas import AuditEntry, AuditFacets

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=Page[AuditEntry])
def search_audit(
    q: str | None = Query(None, max_length=200),
    user_id: int | None = None,
    action: str | None = Query(None, max_length=50),
    entity: str | None = Query(None, max_length=100),
    date_from: datetime | None = Query(None, description="Inclusive, ISO 8601 with offset"),
    date_to: datetime | None = Query(None, description="Exclusive, ISO 8601 with offset"),
    paging: PageParams = Depends(page_params),
    _: CurrentUser = Depends(require_permission("audit:get")),
    db: Session = Depends(get_db),
) -> Page[AuditEntry]:
    return service.search(db, paging, user_id, action, entity, date_from, date_to, q)


@router.get("/facets", response_model=AuditFacets)
def audit_facets(
    _: CurrentUser = Depends(require_permission("audit:get")), db: Session = Depends(get_db)
) -> AuditFacets:
    return service.facets(db)
