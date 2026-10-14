"""Permission templates. Applying a template copies its codes into the user form; it is never checked at runtime."""

from fastapi import status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.admin.users.service import validate_permission_codes
from app.core import audit, messages
from app.core.errors import AppError
from app.core.models import PermissionTemplate, TemplatePermission
from app.core.permissions import CurrentUser
from app.core.queries import violated_constraint
from app.core.security import utcnow

from .schemas import TemplateIn, TemplateOut


def _codes(db: Session, template_id: int) -> list[str]:
    return sorted(
        db.scalars(select(TemplatePermission.permission_code).where(TemplatePermission.template_id == template_id))
    )


def _out(db: Session, template: PermissionTemplate) -> TemplateOut:
    return TemplateOut(
        id=template.id,
        name_ar=template.name_ar,
        description_ar=template.description_ar,
        permissions=_codes(db, template.id),
    )


def list_templates(db: Session) -> list[TemplateOut]:
    return [_out(db, t) for t in db.scalars(select(PermissionTemplate).order_by(PermissionTemplate.id))]


def _flush_or_conflict(db: Session) -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if violated_constraint(exc) == "UQ_permission_template_name_ar":
            raise AppError(status.HTTP_409_CONFLICT, messages.TEMPLATE_NAME_TAKEN, "template_name_taken") from exc
        raise


def create_template(db: Session, actor: CurrentUser, body: TemplateIn, ip: str | None) -> TemplateOut:
    codes = validate_permission_codes(db, body.permissions)
    template = PermissionTemplate(name_ar=body.name_ar, description_ar=body.description_ar or None, created_by=actor.id)
    db.add(template)
    _flush_or_conflict(db)
    db.add_all(TemplatePermission(template_id=template.id, permission_code=c) for c in codes)
    audit.write(
        db, action="create", user_id=actor.id, ip=ip, entity="permission_template", entity_id=template.id,
        new_values={"name_ar": template.name_ar, "description_ar": template.description_ar, "permissions": codes},
    )
    db.commit()
    return _out(db, template)


def update_template(db: Session, actor: CurrentUser, template_id: int, body: TemplateIn, ip: str | None) -> TemplateOut:
    template = db.get(PermissionTemplate, template_id)
    if template is None:
        raise AppError(status.HTTP_404_NOT_FOUND, messages.TEMPLATE_NOT_FOUND, "template_not_found")
    codes = validate_permission_codes(db, body.permissions)
    old = {"name_ar": template.name_ar, "description_ar": template.description_ar, "permissions": _codes(db, template.id)}

    template.name_ar = body.name_ar
    template.description_ar = body.description_ar or None
    template.updated_at = utcnow()
    template.updated_by = actor.id
    _flush_or_conflict(db)
    db.execute(delete(TemplatePermission).where(TemplatePermission.template_id == template.id))
    db.add_all(TemplatePermission(template_id=template.id, permission_code=c) for c in codes)
    audit.write(
        db, action="update", user_id=actor.id, ip=ip, entity="permission_template", entity_id=template.id,
        old_values=old,
        new_values={"name_ar": template.name_ar, "description_ar": template.description_ar, "permissions": codes},
    )
    db.commit()
    return _out(db, template)
