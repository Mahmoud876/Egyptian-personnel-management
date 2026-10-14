from datetime import datetime, date
from uuid import UUID, uuid4

from sqlalchemy import (String, Unicode, UnicodeText, Integer, BigInteger, DateTime, Date, Boolean,
                        Uuid, ForeignKey, UniqueConstraint, CheckConstraint, Index, text)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.mssql import DATETIME2, NVARCHAR, TIMESTAMP
from sqlalchemy import FetchedValue
from app.core.security import utcnow

from app.core.models import Base


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DATETIME2(3), default=utcnow, server_default=text("SYSUTCDATETIME()"))
    updated_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))


class OfficialGovernorate(Base):
    __tablename__ = "official_governorate"
    code: Mapped[str] = mapped_column(Unicode(2), primary_key=True)
    name: Mapped[str] = mapped_column(Unicode(100))


class ImportJob(Timestamped, Base):
    __tablename__ = "import_job"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    uploaded_by_user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("app_user.id"))
    original_filename: Mapped[str] = mapped_column(Unicode(260))
    storage_key: Mapped[str] = mapped_column(Unicode(500))
    file_type: Mapped[str] = mapped_column(Unicode(10))
    file_sha256: Mapped[str] = mapped_column(Unicode(64))
    batch_number: Mapped[int] = mapped_column(Integer)
    enlistment_year: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Unicode(30), default="QUEUED")
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    processed_rows: Mapped[int] = mapped_column(Integer, default=0)
    valid_rows: Mapped[int] = mapped_column(Integer, default=0)
    invalid_rows: Mapped[int] = mapped_column(Integer, default=0)
    checkpoint_row: Mapped[int] = mapped_column(Integer, default=0)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    progress_version: Mapped[int] = mapped_column(BigInteger, default=0)
    rq_job_id: Mapped[str | None] = mapped_column(Unicode(100))
    last_error: Mapped[str | None] = mapped_column(Unicode(1000))
    started_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    completed_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    approved_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    cancelled_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    duplicate_policy: Mapped[str] = mapped_column(Unicode(20), default="reject_all")
    __table_args__ = (
        CheckConstraint("batch_number BETWEEN 1 AND 4", name="CK_poc_import_batch"),
        CheckConstraint("enlistment_year BETWEEN 2000 AND 2100", name="CK_poc_import_year"),
        CheckConstraint("status IN ('QUEUED','PARSING','VALIDATING','READY_FOR_REVIEW','APPROVED','CANCELLED','FAILED')", name="CK_poc_import_status"),
        CheckConstraint("total_rows >= 0 AND processed_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0 AND processed_rows = valid_rows + invalid_rows AND processed_rows <= total_rows AND checkpoint_row = processed_rows AND retry_count >= 0", name="CK_poc_import_counts"),
        CheckConstraint("duplicate_policy IN ('reject_all','keep_first')", name="CK_poc_duplicate_policy"),
    )


class ImportRecord(Base):
    __tablename__ = "import_record"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    import_job_id: Mapped[UUID] = mapped_column(ForeignKey("import_job.id"))
    row_number: Mapped[int] = mapped_column(Integer)
    source_record_id: Mapped[str | None] = mapped_column(Unicode(100))
    raw_data_json: Mapped[str] = mapped_column(NVARCHAR(None))
    national_id_raw: Mapped[str | None] = mapped_column(NVARCHAR(None))
    normalized_national_id: Mapped[str | None] = mapped_column(Unicode(14))
    parsed_data_json: Mapped[str | None] = mapped_column(NVARCHAR(None))
    parsed_type_id: Mapped[int | None] = mapped_column(ForeignKey("qualification.id"))
    validation_status: Mapped[str] = mapped_column(Unicode(10))
    __table_args__ = (
        UniqueConstraint("import_job_id", "row_number", name="UX_ImportRows_Job_Row"),
        CheckConstraint("row_number > 0 AND validation_status IN ('VALID','INVALID')", name="CK_poc_row"),
    )


class ImportRecordError(Base):
    __tablename__ = "import_record_error"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    import_row_id: Mapped[UUID] = mapped_column(ForeignKey("import_record.id"), index=True)
    error_code: Mapped[str] = mapped_column(Unicode(60))
    field_name: Mapped[str] = mapped_column(Unicode(100))
    error_message: Mapped[str] = mapped_column(Unicode(500))


class Recruit(Timestamped, Base):
    __tablename__ = "recruit"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    import_job_id: Mapped[UUID] = mapped_column(ForeignKey("import_job.id"))
    completed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("app_user.id"))
    source_record_id: Mapped[str | None] = mapped_column(Unicode(100))
    name: Mapped[str] = mapped_column(Unicode(200))
    normalized_name: Mapped[str] = mapped_column(Unicode(200), index=True)
    national_id: Mapped[str] = mapped_column(Unicode(14), unique=True)
    birth_date: Mapped[date] = mapped_column(Date)
    gov_id: Mapped[str] = mapped_column(ForeignKey("official_governorate.code"))
    ps_id: Mapped[str] = mapped_column(Unicode(20))
    ps_name: Mapped[str] = mapped_column(Unicode(200))
    type_id: Mapped[int] = mapped_column(ForeignKey("qualification.id"))
    police_number: Mapped[str | None] = mapped_column(Unicode(20))
    enlistment_year: Mapped[int] = mapped_column(Integer)
    batch_number: Mapped[int] = mapped_column(Integer)
    enlistment_start_date: Mapped[date | None] = mapped_column(Date)
    enlistment_end_date: Mapped[date | None] = mapped_column(Date)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    barcode: Mapped[str | None] = mapped_column(Unicode(12))
    # API optimistic version; SQL Server also supplies native rowversion in migration 009.
    revision: Mapped[int] = mapped_column(Integer, default=1)
    row_version: Mapped[bytes] = mapped_column(TIMESTAMP, server_default=FetchedValue())
    __table_args__ = (
        Index("UX_Recruits_PoliceNumber_Year", "police_number", "enlistment_year", unique=True,
              mssql_where=text("police_number IS NOT NULL"), sqlite_where=text("police_number IS NOT NULL")),
        Index("UX_Recruits_Barcode", "barcode", unique=True,
              mssql_where=text("barcode IS NOT NULL"), sqlite_where=text("barcode IS NOT NULL")),
        CheckConstraint("batch_number BETWEEN 1 AND 4 AND enlistment_year BETWEEN 2000 AND 2100", name="CK_poc_recruit_batch"),
        CheckConstraint("enlistment_end_date > enlistment_start_date", name="CK_poc_recruit_dates"),
        CheckConstraint("is_locked = 0 OR (police_number IS NOT NULL AND enlistment_start_date IS NOT NULL AND enlistment_end_date IS NOT NULL AND completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL AND barcode IS NOT NULL)", name="CK_poc_recruit_complete"),
        {"implicit_returning": False},
    )


class ExportJob(Timestamped, Base):
    __tablename__ = "export_job"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    import_job_id: Mapped[UUID] = mapped_column(ForeignKey("import_job.id"))
    requested_by_user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    export_format: Mapped[str] = mapped_column(Unicode(10))
    status: Mapped[str] = mapped_column(Unicode(20), default="QUEUED")
    storage_key: Mapped[str | None] = mapped_column(Unicode(500))
    rq_job_id: Mapped[str | None] = mapped_column(Unicode(100))
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Unicode(1000))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    completed_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    __table_args__ = (
        CheckConstraint("export_format IN ('xlsx','accdb')", name="CK_poc_export_format"),
        CheckConstraint("status IN ('QUEUED','PROCESSING','COMPLETED','FAILED')", name="CK_poc_export_status"),
    )


class RecruitDocument(Timestamped, Base):
    __tablename__ = "recruit_document"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    recruit_id: Mapped[UUID] = mapped_column(ForeignKey("recruit.id"), index=True)
    uploaded_by_user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    original_filename: Mapped[str] = mapped_column(Unicode(260))
    storage_key: Mapped[str] = mapped_column(Unicode(500))
    content_type: Mapped[str] = mapped_column(Unicode(100))
    file_size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(Unicode(64))
