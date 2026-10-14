"""Conscript import staging and records. Mirrors backend/sql/005_conscripts.sql."""

from datetime import date, datetime

from sqlalchemy import Computed, ForeignKey
from sqlalchemy.dialects.mssql import BIGINT, DATE, DATETIME2, INTEGER, NVARCHAR, SMALLINT, TINYINT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import AuditColumnsMixin, Base, server_default


class ImportBatch(AuditColumnsMixin, Base):
    __tablename__ = "import_batch"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    batch_no: Mapped[int] = mapped_column(TINYINT, ForeignKey("batch_schedule.batch_no"))
    conscription_year: Mapped[int] = mapped_column(SMALLINT)
    file_name: Mapped[str] = mapped_column(NVARCHAR(260))
    file_sha256: Mapped[str] = mapped_column(NVARCHAR(64))
    status: Mapped[str] = mapped_column(NVARCHAR(20), server_default=server_default())
    total_rows: Mapped[int] = mapped_column(INTEGER, server_default=server_default())
    valid_rows: Mapped[int] = mapped_column(INTEGER, server_default=server_default())
    rejected_rows: Mapped[int] = mapped_column(INTEGER, server_default=server_default())
    approved_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    approved_by: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("app_user.id"))
    cancelled_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    cancelled_by: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("app_user.id"))


class Conscript(AuditColumnsMixin, Base):
    """System-versioned (history in conscript_history)."""

    __tablename__ = "conscript"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    national_id: Mapped[str] = mapped_column(NVARCHAR(14))
    full_name: Mapped[str] = mapped_column(NVARCHAR(200))
    name_normalized: Mapped[str] = mapped_column(
        NVARCHAR(200), Computed("dbo.fn_normalize_ar_name(full_name)", persisted=True)
    )
    birth_date: Mapped[date] = mapped_column(DATE)
    governorate_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("governorate.id"))
    police_station_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("police_station.id"))
    qualification_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("qualification.id"))
    import_batch_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("import_batch.id"))
    conscription_year: Mapped[int] = mapped_column(SMALLINT)
    batch_no: Mapped[int] = mapped_column(TINYINT, ForeignKey("batch_schedule.batch_no"))
    status: Mapped[str] = mapped_column(NVARCHAR(20), server_default=server_default())
    police_no: Mapped[str | None] = mapped_column(NVARCHAR(20))
    start_date: Mapped[date | None] = mapped_column(DATE)
    end_date: Mapped[date | None] = mapped_column(DATE)
    barcode: Mapped[str | None] = mapped_column(NVARCHAR(50))
    locked_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    locked_by: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("app_user.id"))


class ImportRow(AuditColumnsMixin, Base):
    """One row of an uploaded file exactly as received (all text), plus its validation outcome."""

    __tablename__ = "import_row"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("import_batch.id"))
    source_row_id: Mapped[str | None] = mapped_column(NVARCHAR(50))
    name: Mapped[str | None] = mapped_column(NVARCHAR(400))
    national_id: Mapped[str | None] = mapped_column(NVARCHAR(50))
    birth_date: Mapped[str | None] = mapped_column(NVARCHAR(50))
    gov_name: Mapped[str | None] = mapped_column(NVARCHAR(200))
    gov_id: Mapped[str | None] = mapped_column(NVARCHAR(50))
    ps_name: Mapped[str | None] = mapped_column(NVARCHAR(200))
    ps_id: Mapped[str | None] = mapped_column(NVARCHAR(50))
    type_id: Mapped[str | None] = mapped_column(NVARCHAR(50))
    type_name: Mapped[str | None] = mapped_column(NVARCHAR(200))
    status: Mapped[str] = mapped_column(NVARCHAR(20), server_default=server_default())
    rejection_reasons: Mapped[str | None] = mapped_column(NVARCHAR(None))
    conscript_id: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("conscript.id"))
