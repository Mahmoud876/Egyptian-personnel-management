"""Employees and job actions. Mirrors backend/sql/006_employees.sql."""

from datetime import date, datetime

from sqlalchemy import Computed, ForeignKey
from sqlalchemy.dialects.mssql import BIT, DATE, DATETIME2, INTEGER, NVARCHAR
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import AuditColumnsMixin, Base, server_default


class Employee(AuditColumnsMixin, Base):
    """System-versioned (history in employee_history). Soft-deleted via is_deleted."""

    __tablename__ = "employee"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    employee_no: Mapped[str] = mapped_column(NVARCHAR(20))
    national_id: Mapped[str] = mapped_column(NVARCHAR(14))
    full_name: Mapped[str] = mapped_column(NVARCHAR(200))
    name_normalized: Mapped[str] = mapped_column(
        NVARCHAR(200), Computed("dbo.fn_normalize_ar_name(full_name)", persisted=True)
    )
    gender: Mapped[str | None] = mapped_column(NVARCHAR(1))
    birth_date: Mapped[date | None] = mapped_column(DATE)
    hire_date: Mapped[date | None] = mapped_column(DATE)
    work_entity_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("work_entity.id"))
    job_title: Mapped[str | None] = mapped_column(NVARCHAR(200))
    grade: Mapped[str | None] = mapped_column(NVARCHAR(50))
    qualification: Mapped[str | None] = mapped_column(NVARCHAR(200))
    phone: Mapped[str | None] = mapped_column(NVARCHAR(30))
    address: Mapped[str | None] = mapped_column(NVARCHAR(400))
    is_deleted: Mapped[bool] = mapped_column(BIT, server_default=server_default())
    deleted_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    deleted_by: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("app_user.id"))
    source_system: Mapped[str | None] = mapped_column(NVARCHAR(20))
    source_key: Mapped[str | None] = mapped_column(NVARCHAR(100))
    migration_batch_id: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("migration_batch.id"))


class JobAction(AuditColumnsMixin, Base):
    """System-versioned (history in job_action_history)."""

    __tablename__ = "job_action"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    employee_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("employee.id"))
    action_type_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("action_type.id"))
    decision_no: Mapped[str | None] = mapped_column(NVARCHAR(50))
    decision_date: Mapped[date | None] = mapped_column(DATE)
    effective_date: Mapped[date] = mapped_column(DATE)
    end_date: Mapped[date | None] = mapped_column(DATE)
    notes: Mapped[str | None] = mapped_column(NVARCHAR(1000))
    source_system: Mapped[str | None] = mapped_column(NVARCHAR(20))
    source_key: Mapped[str | None] = mapped_column(NVARCHAR(100))
    migration_batch_id: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("migration_batch.id"))
