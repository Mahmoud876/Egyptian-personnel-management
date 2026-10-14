from fastapi import status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import audit, messages
from app.core.errors import AppError
from app.core.models import AppUser, UserPermission
from app.core.permissions import CurrentUser
from app.core.security import (
    create_session,
    delete_user_sessions,
    hash_password,
    utcnow,
    verify_dummy_password,
    verify_password,
)

from .schemas import MeResponse


def me_response(user: CurrentUser) -> MeResponse:
    return MeResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        work_entity_id=user.work_entity_id,
        must_change_password=user.must_change_password,
        permissions=sorted(user.permissions),
    )


def login(db: Session, username: str, password: str, ip: str | None) -> tuple[str, MeResponse]:
    """Returns (session token, me). Failures are audited and raise 401 with one generic message."""
    user = db.scalar(select(AppUser).where(AppUser.username == username))

    if user is None:
        verify_dummy_password(password)
        reason = "unknown_user"
    elif not user.is_active:
        verify_dummy_password(password)
        reason = "inactive"
    else:
        valid, new_hash = verify_password(password, user.password_hash)
        reason = None if valid else "wrong_password"
        if valid and new_hash:
            user.password_hash = new_hash

    if user is None or reason is not None:
        audit.write(
            db,
            action="login_failed",
            user_id=user.id if user else None,
            ip=ip,
            entity="app_user",
            entity_id=user.id if user else None,
            new_values={"username": username, "reason": reason},
        )
        db.commit()
        raise AppError(status.HTTP_401_UNAUTHORIZED, messages.INVALID_CREDENTIALS, "invalid_credentials")

    user.last_login_at = utcnow()
    token = create_session(db, user.id, ip)
    audit.write(db, action="login", user_id=user.id, ip=ip, entity="app_user", entity_id=user.id)
    db.commit()

    codes = db.scalars(select(UserPermission.permission_code).where(UserPermission.user_id == user.id))
    return token, MeResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        work_entity_id=user.work_entity_id,
        must_change_password=user.must_change_password,
        permissions=sorted(codes),
    )


def change_password(db: Session, user: CurrentUser, current_password: str, new_password: str, ip: str | None) -> None:
    db_user = db.get(AppUser, user.id)
    assert db_user is not None
    valid, _ = verify_password(current_password, db_user.password_hash)
    if not valid:
        raise AppError(status.HTTP_400_BAD_REQUEST, messages.INVALID_CURRENT_PASSWORD, "invalid_current_password")
    if current_password == new_password:
        raise AppError(status.HTTP_400_BAD_REQUEST, messages.PASSWORD_UNCHANGED, "password_unchanged")

    db_user.password_hash = hash_password(new_password)
    db_user.must_change_password = False
    db_user.updated_at = utcnow()
    db_user.updated_by = user.id
    # Sign out every other device.
    delete_user_sessions(db, user.id, keep_session_id=user.session_id)
    audit.write(db, action="change_password", user_id=user.id, ip=ip, entity="app_user", entity_id=user.id)
    db.commit()
