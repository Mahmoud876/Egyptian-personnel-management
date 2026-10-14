from collections.abc import Iterable

from fastapi import status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.admin.models import WorkEntity
from app.core import audit, messages
from app.core.errors import AppError
from app.core.models import AppUser, Permission, UserPermission
from app.core.permissions import CurrentUser
from app.core.queries import PageParams, like_contains, paginate, violated_constraint
from app.core.schemas import Page
from app.core.security import delete_user_sessions, hash_password, utcnow

from .schemas import UserCreate, UserDetail, UserListItem, UserUpdate

_MODULE_ORDER = {"admin": 0, "conscripts": 1, "employees": 2}


def list_permissions(db: Session) -> list[Permission]:
    rows = list(db.scalars(select(Permission)))
    return sorted(rows, key=lambda p: (_MODULE_ORDER.get(p.module, 99), p.sort_order, p.code))


def _get(db: Session, user_id: int) -> AppUser:
    user = db.get(AppUser, user_id)
    if user is None:
        raise AppError(status.HTTP_404_NOT_FOUND, messages.USER_NOT_FOUND, "user_not_found")
    return user


def _codes(db: Session, user_id: int) -> list[str]:
    return sorted(db.scalars(select(UserPermission.permission_code).where(UserPermission.user_id == user_id)))


def validate_permission_codes(db: Session, codes: Iterable[str]) -> list[str]:
    wanted = sorted(set(codes))
    known = set(db.scalars(select(Permission.code).where(Permission.code.in_(wanted)))) if wanted else set()
    if unknown := [c for c in wanted if c not in known]:
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"{messages.UNKNOWN_PERMISSIONS}: {', '.join(unknown)}",
            "unknown_permission",
        )
    return wanted


def _validate_work_entity(db: Session, work_entity_id: int | None) -> None:
    if work_entity_id is not None and db.get(WorkEntity, work_entity_id) is None:
        raise AppError(status.HTTP_422_UNPROCESSABLE_CONTENT, messages.UNKNOWN_WORK_ENTITY, "unknown_work_entity")


def _snapshot(user: AppUser) -> dict[str, object]:
    return {
        "username": user.username,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "work_entity_id": user.work_entity_id,
    }


def get_detail(db: Session, user_id: int) -> UserDetail:
    user = _get(db, user_id)
    entity = db.get(WorkEntity, user.work_entity_id) if user.work_entity_id else None
    return UserDetail(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        is_active=user.is_active,
        must_change_password=user.must_change_password,
        work_entity_id=user.work_entity_id,
        work_entity_name=entity.name_ar if entity else None,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
        permissions=_codes(db, user.id),
    )


def list_users(db: Session, q: str | None, is_active: bool | None, params: PageParams) -> Page[UserListItem]:
    permission_count = (
        select(func.count())
        .select_from(UserPermission)
        .where(UserPermission.user_id == AppUser.id)
        .correlate(AppUser)
        .scalar_subquery()
    )
    statement = (
        select(AppUser, WorkEntity.name_ar, permission_count)
        .outerjoin(WorkEntity, WorkEntity.id == AppUser.work_entity_id)
        .order_by(AppUser.username)
    )
    if q and q.strip():
        pattern = like_contains(q.strip())
        statement = statement.where(
            or_(
                AppUser.username.like(pattern),
                func.dbo.fn_normalize_ar_name(AppUser.full_name).like(func.dbo.fn_normalize_ar_name(pattern)),
            )
        )
    if is_active is not None:
        statement = statement.where(AppUser.is_active == is_active)

    def to_item(row: tuple[AppUser, str | None, int]) -> UserListItem:
        user, entity_name, count = row
        return UserListItem(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            is_active=user.is_active,
            work_entity_id=user.work_entity_id,
            work_entity_name=entity_name,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            permission_count=count,
        )

    return paginate(db, statement, params, to_item)


def create_user(db: Session, actor: CurrentUser, body: UserCreate, ip: str | None) -> UserDetail:
    codes = validate_permission_codes(db, body.permissions)
    _validate_work_entity(db, body.work_entity_id)
    user = AppUser(
        username=body.username,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        is_active=body.is_active,
        work_entity_id=body.work_entity_id,
        must_change_password=True,
        created_by=actor.id,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if violated_constraint(exc) == "UQ_app_user_username":
            raise AppError(status.HTTP_409_CONFLICT, messages.USERNAME_TAKEN, "username_taken") from exc
        raise
    db.add_all(UserPermission(user_id=user.id, permission_code=c, granted_by=actor.id) for c in codes)
    audit.write(
        db, action="create", user_id=actor.id, ip=ip, entity="app_user", entity_id=user.id,
        new_values={**_snapshot(user), "permissions": codes},
    )
    db.commit()
    return get_detail(db, user.id)


def update_user(db: Session, actor: CurrentUser, user_id: int, body: UserUpdate, ip: str | None) -> UserDetail:
    user = _get(db, user_id)
    if user.id == actor.id and not body.is_active:
        raise AppError(status.HTTP_400_BAD_REQUEST, messages.CANNOT_DEACTIVATE_SELF, "cannot_deactivate_self")
    _validate_work_entity(db, body.work_entity_id)

    old = _snapshot(user)
    user.full_name = body.full_name
    user.work_entity_id = body.work_entity_id
    user.is_active = body.is_active
    user.updated_at = utcnow()
    user.updated_by = actor.id
    if not body.is_active:
        delete_user_sessions(db, user.id)
    audit.write(
        db, action="update", user_id=actor.id, ip=ip, entity="app_user", entity_id=user.id,
        old_values=old, new_values=_snapshot(user),
    )
    db.commit()
    return get_detail(db, user.id)


def set_permissions(db: Session, actor: CurrentUser, user_id: int, codes: list[str], ip: str | None) -> UserDetail:
    user = _get(db, user_id)
    wanted = validate_permission_codes(db, codes)
    if user.id == actor.id and "users.manage" not in wanted:
        raise AppError(
            status.HTTP_400_BAD_REQUEST, messages.CANNOT_REMOVE_OWN_USER_MANAGEMENT, "cannot_remove_own_user_management"
        )

    current = _codes(db, user.id)
    removed = sorted(set(current) - set(wanted))
    added = sorted(set(wanted) - set(current))
    if removed:
        db.execute(
            delete(UserPermission).where(UserPermission.user_id == user.id, UserPermission.permission_code.in_(removed))
        )
    db.add_all(UserPermission(user_id=user.id, permission_code=c, granted_by=actor.id) for c in added)
    user.updated_at = utcnow()
    user.updated_by = actor.id
    audit.write(
        db, action="update_permissions", user_id=actor.id, ip=ip, entity="app_user", entity_id=user.id,
        old_values={"permissions": current}, new_values={"permissions": wanted},
    )
    db.commit()
    return get_detail(db, user.id)


def reset_password(db: Session, actor: CurrentUser, user_id: int, new_password: str, ip: str | None) -> None:
    user = _get(db, user_id)
    user.password_hash = hash_password(new_password)
    user.must_change_password = True
    user.updated_at = utcnow()
    user.updated_by = actor.id
    delete_user_sessions(db, user.id)
    audit.write(db, action="reset_password", user_id=actor.id, ip=ip, entity="app_user", entity_id=user.id)
    db.commit()
