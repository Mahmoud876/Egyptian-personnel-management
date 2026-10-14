"""Lookup tables edited through lookups.manage. Mirrors backend/sql/004_lookups.sql."""

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.mssql import BIT, INTEGER, NVARCHAR, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import AuditColumnsMixin, Base, server_default


class Governorate(AuditColumnsMixin, Base):
    __tablename__ = "governorate"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    code: Mapped[str] = mapped_column(NVARCHAR(2))
    name_ar: Mapped[str] = mapped_column(NVARCHAR(100))
    is_active: Mapped[bool] = mapped_column(BIT, server_default=server_default())


class PoliceStation(AuditColumnsMixin, Base):
    __tablename__ = "police_station"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    code: Mapped[str] = mapped_column(NVARCHAR(4))
    name_ar: Mapped[str] = mapped_column(NVARCHAR(100))
    governorate_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("governorate.id"))
    is_active: Mapped[bool] = mapped_column(BIT, server_default=server_default())


class Qualification(AuditColumnsMixin, Base):
    __tablename__ = "qualification"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    code: Mapped[str] = mapped_column(NVARCHAR(2))
    name_ar: Mapped[str] = mapped_column(NVARCHAR(100))
    service_months: Mapped[int] = mapped_column(TINYINT)
    is_active: Mapped[bool] = mapped_column(BIT, server_default=server_default())


class BatchSchedule(AuditColumnsMixin, Base):
    __tablename__ = "batch_schedule"

    batch_no: Mapped[int] = mapped_column(TINYINT, primary_key=True, autoincrement=False)
    start_month: Mapped[int] = mapped_column(TINYINT)
    start_day: Mapped[int] = mapped_column(TINYINT)


class WorkEntity(AuditColumnsMixin, Base):
    __tablename__ = "work_entity"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    code: Mapped[str] = mapped_column(NVARCHAR(20))
    name_ar: Mapped[str] = mapped_column(NVARCHAR(200))
    is_active: Mapped[bool] = mapped_column(BIT, server_default=server_default())


class ActionType(AuditColumnsMixin, Base):
    __tablename__ = "action_type"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    code: Mapped[str] = mapped_column(NVARCHAR(20))
    name_ar: Mapped[str] = mapped_column(NVARCHAR(200))
    is_active: Mapped[bool] = mapped_column(BIT, server_default=server_default())
