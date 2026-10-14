from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.audit import client_ip
from app.core.db import get_db
from app.core.permissions import CurrentUser, require_any_permission, require_permission

from . import service
from .schemas import TemplateIn, TemplateOut

router = APIRouter(prefix="/templates", tags=["templates"])


# Also needed by the user permissions editor ("apply template"), hence users.manage.
@router.get("", response_model=list[TemplateOut])
def list_templates(
    _: CurrentUser = Depends(require_any_permission("users.manage", "templates.manage")),
    db: Session = Depends(get_db),
) -> list[TemplateOut]:
    return service.list_templates(db)


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    body: TemplateIn,
    request: Request,
    actor: CurrentUser = Depends(require_permission("templates.manage")),
    db: Session = Depends(get_db),
) -> TemplateOut:
    return service.create_template(db, actor, body, client_ip(request))


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: int,
    body: TemplateIn,
    request: Request,
    actor: CurrentUser = Depends(require_permission("templates.manage")),
    db: Session = Depends(get_db),
) -> TemplateOut:
    return service.update_template(db, actor, template_id, body, client_ip(request))
