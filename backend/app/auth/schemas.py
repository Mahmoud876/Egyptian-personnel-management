from pydantic import BaseModel, Field

from app.core.security import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class MeResponse(BaseModel):
    id: int
    username: str
    full_name: str
    work_entity_id: int | None
    must_change_password: bool
    permissions: list[str]


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)


class PermissionCheckRequest(BaseModel):
    permission: str = Field(min_length=1, max_length=100)
    # The frontend route the user tried to open; recorded in the audit log.
    path: str = Field(min_length=1, max_length=100)
