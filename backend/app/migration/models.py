"""Migration / import runs and their rejected records. Mirrors backend/sql/006_employees.sql."""

from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.mssql import BIGINT, DATETIME2, INTEGER, NVARCHAR
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import AuditColumnsMixin, Base, server_default


class MigrationBatch(AuditColumnsMixin, Base):
    __tablename__ = "migration_batch"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    source_system: Mapped[str] = mapped_column(NVARCHAR(20))
    source_name: Mapped[str | None] = mapped_column(NVARCHAR(260))
    status: Mapped[str] = mapped_column(NVARCHAR(20), server_default=server_default())
    started_at: Mapped[datetime] = mapped_column(DATETIME2(3), server_default=server_default())
    finished_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    total_records: Mapped[int] = mapped_column(INTEGER, server_default=server_default())
    accepted_records: Mapped[int] = mapped_column(INTEGER, server_default=server_default())
    rejected_records: Mapped[int] = mapped_column(INTEGER, server_default=server_default())
    reconciliation: Mapped[str | None] = mapped_column(NVARCHAR(None))
    rolled_back_at: Mapped[datetime | None] = mapped_column(DATETIME2(3))
    rolled_back_by: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("app_user.id"))


class MigrationError(Base):
    __tablename__ = "migration_error"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
    migration_batch_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("migration_batch.id"))
    entity: Mapped[str] = mapped_column(NVARCHAR(50))
    source_key: Mapped[str | None] = mapped_column(NVARCHAR(100))
    field: Mapped[str | None] = mapped_column(NVARCHAR(100))
    reason: Mapped[str] = mapped_column(NVARCHAR(500))
    raw_data: Mapped[str | None] = mapped_column(NVARCHAR(None))
    created_at: Mapped[datetime] = mapped_column(DATETIME2(3), server_default=server_default())
