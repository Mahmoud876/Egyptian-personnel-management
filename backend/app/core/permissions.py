"""Permission checks. Access is decided by permission codes only, never by role or template (docs/permissions.md).

Every API route declares one of:
    Depends(require_permission("code", ...))     user must have all listed codes
    Depends(require_permission())                any signed-in user
    Depends(require_any_permission("a", "b"))    user must have at least one
except POST /api/v1/auth/login and GET /api/v1/health. tests/test_route_permissions.py enforces this.
Denied attempts are written to audit_log (action='denied') before the 403 is raised.
"""

from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import audit, messages
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError
from app.core.models import AppUser, UserPermission
from app.core.security import resolve_session

# Attribute set on every dependency built here; the route coverage test looks for it.
PERMISSION_MARKER = "required_permissions"


@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str
    full_name: str
    work_entity_id: int | None
    must_change_password: bool
    permissions: frozenset[str]
    session_id: str


def has_permission(user: CurrentUser, code: str) -> bool:
    """For checks inside services, e.g. data scoping (employees.scope.all)."""
    return code in user.permissions


def _not_authenticated() -> AppError:
    return AppError(status.HTTP_401_UNAUTHORIZED, messages.NOT_AUTHENTICATED, "not_authenticated")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> CurrentUser:
    """Loads the signed-in user and their codes once per request."""
    cached: CurrentUser | None = getattr(request.state, "current_user", None)
    if cached is not None:
        return cached

    session = resolve_session(db, request.cookies.get(get_settings().session_cookie_name))
    if session is None:
        raise _not_authenticated()
    user = db.get(AppUser, session.user_id)
    if user is None or not user.is_active:
        db.delete(session)
        db.commit()
        raise _not_authenticated()

    codes = db.scalars(select(UserPermission.permission_code).where(UserPermission.user_id == user.id))
    current = CurrentUser(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        work_entity_id=user.work_entity_id,
        must_change_password=user.must_change_password,
        permissions=frozenset(codes),
        session_id=session.id,
    )
    request.state.current_user = current
    return current


def deny(db: Session, request: Request, user: CurrentUser, required: tuple[str, ...], target: str | None = None) -> AppError:
    """Audits a denied attempt (committed immediately) and returns the 403 to raise."""
    missing = [code for code in required if code not in user.permissions]
    audit.write(
        db,
        action="denied",
        user_id=user.id,
        ip=audit.client_ip(request),
        entity="route",
        entity_id=(target or f"{request.method} {request.url.path}")[:100],
        permission_code=missing[0] if missing else (required[0] if required else None),
        new_values={"required": list(required), "missing": missing},
    )
    db.commit()
    return AppError(status.HTTP_403_FORBIDDEN, messages.FORBIDDEN, "forbidden")


def _check_password_change(user: CurrentUser, allow_pending: bool) -> None:
    if user.must_change_password and not allow_pending:
        raise AppError(status.HTTP_403_FORBIDDEN, messages.PASSWORD_CHANGE_REQUIRED, "password_change_required")


def require_permission(*codes: str, allow_password_change_pending: bool = False) -> Callable[..., CurrentUser]:
    """Dependency: the user must hold every code in `codes` (none = any signed-in user)."""

    def dependency(
        request: Request, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)
    ) -> CurrentUser:
        _check_password_change(user, allow_password_change_pending)
        if not all(code in user.permissions for code in codes):
            raise deny(db, request, user, codes)
        return user

    setattr(dependency, PERMISSION_MARKER, codes)
    return dependency


def require_any_permission(*codes: str) -> Callable[..., CurrentUser]:
    """Dependency: the user must hold at least one code in `codes`."""
    if not codes:
        raise ValueError("require_any_permission needs at least one code")

    def dependency(
        request: Request, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)
    ) -> CurrentUser:
        _check_password_change(user, False)
        if not any(code in user.permissions for code in codes):
            raise deny(db, request, user, codes)
        return user

    setattr(dependency, PERMISSION_MARKER, codes)
    return dependency
