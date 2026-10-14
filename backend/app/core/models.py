"""ORM base and core tables (users, permissions, sessions, audit).

Models mirror backend/sql/*.sql; they never create or alter tables. tests/test_models_match_db.py keeps them in
sync with the database. System-versioning period columns (valid_from / valid_to) are HIDDEN and not mapped.
"""

from datetime import datetime

from sqlalchemy import FetchedValue, ForeignKey
from sqlalchemy.dialects.mssql import BIGINT, BIT, DATETIME2, INTEGER, NVARCHAR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def server_default() -> FetchedValue:
    """Marks a column whose value comes from a DB default constraint."""
    return FetchedValue()


class AuditColumnsMixin:
    """created_at / created_by / updated_at / updated_by, present on every business table."""

    created_at: Mapped[datetime] = mapped_column(DATETIME2(3), server_default=server_default())
    created_by: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("app_user.id"))
    updated_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    updated_by: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("app_user.id"))


class Permission(Base):
    __tablename__ = "permission"

    code: Mapped[str] = mapped_column(NVARCHAR(100), primary_key=True)
    module: Mapped[str] = mapped_column(NVARCHAR(20))
    name_ar: Mapped[str] = mapped_column(NVARCHAR(200))
    name_en: Mapped[str] = mapped_column(NVARCHAR(200))
    description_ar: Mapped[str | None] = mapped_column(NVARCHAR(500))
    sort_order: Mapped[int] = mapped_column(INTEGER, server_default=server_default())


class AppUser(AuditColumnsMixin, Base):
    __tablename__ = "app_user"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    username: Mapped[str] = mapped_column(NVARCHAR(50))
    full_name: Mapped[str] = mapped_column(NVARCHAR(200))
    password_hash: Mapped[str] = mapped_column(NVARCHAR(255))
    is_active: Mapped[bool] = mapped_column(BIT, server_default=server_default())
    work_entity_id: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("work_entity.id"))
    must_change_password: Mapped[bool] = mapped_column(BIT, server_default=server_default())
    last_login_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))


class UserPermission(Base):
    __tablename__ = "user_permission"

    user_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("app_user.id"), primary_key=True)
    permission_code: Mapped[str] = mapped_column(NVARCHAR(100), ForeignKey("permission.code"), primary_key=True)
    granted_at: Mapped[datetime] = mapped_column(DATETIME2(3), server_default=server_default())
    granted_by: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("app_user.id"))


class PermissionTemplate(AuditColumnsMixin, Base):
    __tablename__ = "permission_template"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    name_ar: Mapped[str] = mapped_column(NVARCHAR(200))
    description_ar: Mapped[str | None] = mapped_column(NVARCHAR(500))


class TemplatePermission(Base):
    __tablename__ = "template_permission"

    template_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("permission_template.id"), primary_key=True)
    permission_code: Mapped[str] = mapped_column(NVARCHAR(100), ForeignKey("permission.code"), primary_key=True)


class UserSession(Base):
    __tablename__ = "user_session"

    id: Mapped[str] = mapped_column(NVARCHAR(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("app_user.id"))
    created_at: Mapped[datetime] = mapped_column(DATETIME2(3), server_default=server_default())
    expires_at: Mapped[datetime] = mapped_column(DATETIME2(3))
    last_seen_at: Mapped[datetime] = mapped_column(DATETIME2(3), server_default=server_default())
    ip: Mapped[str | None] = mapped_column(NVARCHAR(45))


class AuditLog(Base):
    """Append-only: the app login is denied UPDATE and DELETE."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    at: Mapped[datetime] = mapped_column(DATETIME2(3), server_default=server_default())
    user_id: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("app_user.id"))
    ip: Mapped[str | None] = mapped_column(NVARCHAR(45))
    action: Mapped[str] = mapped_column(NVARCHAR(50))
    entity: Mapped[str | None] = mapped_column(NVARCHAR(100))
    entity_id: Mapped[str | None] = mapped_column(NVARCHAR(100))
    permission_code: Mapped[str | None] = mapped_column(NVARCHAR(100), ForeignKey("permission.code"))
    old_values: Mapped[str | None] = mapped_column(NVARCHAR(None))
    new_values: Mapped[str | None] = mapped_column(NVARCHAR(None))
    batch_id: Mapped[int | None] = mapped_column(BIGINT)
