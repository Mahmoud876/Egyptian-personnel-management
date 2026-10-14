"""Archive documents and their links. Mirrors backend/sql/006_employees.sql."""

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.mssql import BIGINT, INTEGER, NVARCHAR, VARBINARY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import AuditColumnsMixin, Base


class Document(AuditColumnsMixin, Base):
    __tablename__ = "document"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    title: Mapped[str | None] = mapped_column(NVARCHAR(300))
    file_name: Mapped[str] = mapped_column(NVARCHAR(260))
    content_type: Mapped[str] = mapped_column(NVARCHAR(100))
    size_bytes: Mapped[int] = mapped_column(BIGINT)
    sha256: Mapped[str] = mapped_column(NVARCHAR(64))
    # Deferred: only loaded when accessed, so listing documents doesn't pull file contents.
    content: Mapped[bytes] = mapped_column(VARBINARY(None), deferred=True)
    archive_ref: Mapped[str | None] = mapped_column(NVARCHAR(100))
    source_system: Mapped[str | None] = mapped_column(NVARCHAR(20))
    source_key: Mapped[str | None] = mapped_column(NVARCHAR(100))
    migration_batch_id: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("migration_batch.id"))


class DocumentLink(AuditColumnsMixin, Base):
    """Links a document to an employee and/or a job action (at least one)."""

    __tablename__ = "document_link"

    id: Mapped[int] = mapped_column(INTEGER, primary_key=True)
    document_id: Mapped[int] = mapped_column(INTEGER, ForeignKey("document.id"))
    employee_id: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("employee.id"))
    job_action_id: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("job_action.id"))
    migration_batch_id: Mapped[int | None] = mapped_column(INTEGER, ForeignKey("migration_batch.id"))
