from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import audit, messages
from app.core.audit import client_ip
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError
from app.core.models import Permission
from app.core.permissions import CurrentUser, deny, require_permission
from app.core.security import delete_session

from . import service
from .schemas import ChangePasswordRequest, LoginRequest, MeResponse, PermissionCheckRequest

router = APIRouter(prefix="/auth", tags=["auth"])

# me, logout and change-password must work while a password change is pending.
signed_in = require_permission(allow_password_change_pending=True)


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        httponly=True,
        samesite="strict",
        secure=settings.session_cookie_secure,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        settings.session_cookie_name,
        httponly=True,
        samesite="strict",
        secure=settings.session_cookie_secure,
        path="/",
    )


# Public by design: one of the two routes exempt from require_permission (see CLAUDE.md).
@router.post("/login", response_model=MeResponse)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> MeResponse:
    # Replace any session this browser already had.
    delete_session(db, request.cookies.get(get_settings().session_cookie_name))
    token, me = service.login(db, body.username, body.password, client_ip(request))
    _set_session_cookie(response, token)
    return me


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, user: CurrentUser = Depends(signed_in), db: Session = Depends(get_db)) -> None:
    delete_session(db, request.cookies.get(get_settings().session_cookie_name))
    audit.write(db, action="logout", user_id=user.id, ip=client_ip(request), entity="app_user", entity_id=user.id)
    db.commit()
    _clear_session_cookie(response)


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser = Depends(signed_in)) -> MeResponse:
    return service.me_response(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest, request: Request, user: CurrentUser = Depends(signed_in), db: Session = Depends(get_db)
) -> None:
    service.change_password(db, user, body.current_password, body.new_password, client_ip(request))


@router.post("/permission-check", status_code=status.HTTP_204_NO_CONTENT)
def permission_check(
    body: PermissionCheckRequest,
    request: Request,
    user: CurrentUser = Depends(require_permission()),
    db: Session = Depends(get_db),
) -> None:
    """Called by the frontend route guard when it blocks a screen, so the attempt is audited server-side.

    204 if the user holds the permission; otherwise 403 and an audit_log row with action='denied'.
    """
    if db.scalar(select(Permission.code).where(Permission.code == body.permission)) is None:
        raise AppError(status.HTTP_404_NOT_FOUND, messages.UNKNOWN_PERMISSION, "unknown_permission")
    if body.permission not in user.permissions:
        raise deny(db, request, user, (body.permission,), target=f"screen {body.path}")
