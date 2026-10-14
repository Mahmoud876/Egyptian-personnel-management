from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.audit import client_ip
from app.core.db import get_db
from app.core.permissions import CurrentUser, require_any_permission, require_permission
from app.core.queries import PageParams, page_params
from app.core.schemas import Page

from . import service
from .schemas import (
    PasswordReset,
    PermissionOut,
    UserCreate,
    UserDetail,
    UserListItem,
    UserPermissionsUpdate,
    UserUpdate,
)

router = APIRouter(tags=["users"])


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(
    _: CurrentUser = Depends(require_any_permission("users.view", "templates.manage")),
    db: Session = Depends(get_db),
) -> list[PermissionOut]:
    return [PermissionOut.model_validate(p, from_attributes=True) for p in service.list_permissions(db)]


@router.get("/users", response_model=Page[UserListItem])
def list_users(
    q: str | None = Query(None, max_length=100),
    is_active: bool | None = None,
    paging: PageParams = Depends(page_params),
    _: CurrentUser = Depends(require_permission("users.view")),
    db: Session = Depends(get_db),
) -> Page[UserListItem]:
    return service.list_users(db, q, is_active, paging)


@router.get("/users/{user_id}", response_model=UserDetail)
def get_user(
    user_id: int, _: CurrentUser = Depends(require_permission("users.view")), db: Session = Depends(get_db)
) -> UserDetail:
    return service.get_detail(db, user_id)


@router.post("/users", response_model=UserDetail, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    request: Request,
    actor: CurrentUser = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> UserDetail:
    return service.create_user(db, actor, body, client_ip(request))


@router.put("/users/{user_id}", response_model=UserDetail)
def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    actor: CurrentUser = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> UserDetail:
    return service.update_user(db, actor, user_id, body, client_ip(request))


@router.put("/users/{user_id}/permissions", response_model=UserDetail)
def set_user_permissions(
    user_id: int,
    body: UserPermissionsUpdate,
    request: Request,
    actor: CurrentUser = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> UserDetail:
    return service.set_permissions(db, actor, user_id, body.permissions, client_ip(request))


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: int,
    body: PasswordReset,
    request: Request,
    actor: CurrentUser = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> None:
    service.reset_password(db, actor, user_id, body.new_password, client_ip(request))
