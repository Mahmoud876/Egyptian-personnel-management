from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.core.schemas import UtcDatetime
from app.core.security import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH

Username = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9._-]{3,50}$")]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Password = Annotated[str, Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)]
PermissionCode = Annotated[str, StringConstraints(min_length=1, max_length=100)]


class UserListItem(BaseModel):
    id: int
    username: str
    full_name: str
    is_active: bool
    work_entity_id: int | None
    work_entity_name: str | None
    last_login_at: UtcDatetime | None
    created_at: UtcDatetime
    permission_count: int


class UserDetail(BaseModel):
    id: int
    username: str
    full_name: str
    is_active: bool
    must_change_password: bool
    work_entity_id: int | None
    work_entity_name: str | None
    last_login_at: UtcDatetime | None
    created_at: UtcDatetime
    updated_at: UtcDatetime | None
    permissions: list[str]


class UserCreate(BaseModel):
    username: Username
    full_name: FullName
    password: Password
    work_entity_id: int | None = None
    is_active: bool = True
    permissions: list[PermissionCode] = []


class UserUpdate(BaseModel):
    full_name: FullName
    work_entity_id: int | None
    is_active: bool


class UserPermissionsUpdate(BaseModel):
    permissions: list[PermissionCode]


class PasswordReset(BaseModel):
    new_password: Password


class PermissionOut(BaseModel):
    code: str
    module: str
    name_ar: str
    name_en: str
    description_ar: str | None
    sort_order: int
