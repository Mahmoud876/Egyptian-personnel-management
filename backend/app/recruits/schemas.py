from datetime import date
from typing import Literal, Annotated
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, StringConstraints

from app.core.schemas import UtcDatetime, Page

PoliceNumber = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
ImportStatus = Literal["QUEUED", "PARSING", "VALIDATING", "READY_FOR_REVIEW", "APPROVED", "CANCELLED", "FAILED"]


class OfficialGovernorateOut(BaseModel):
    code: str
    name_ar: str


class ImportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    original_filename: str
    batch_number: int
    enlistment_year: int
    status: str
    total_rows: int
    processed_rows: int
    valid_rows: int
    invalid_rows: int
    checkpoint_row: int
    retry_count: int
    progress_version: int
    last_error: str | None
    created_at: UtcDatetime
    approved_at: UtcDatetime | None
    cancelled_at: UtcDatetime | None


class CompleteProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    police_number: PoliceNumber
    enlistment_start_date: date
    enlistment_end_date: date
    revision: int | None = Field(None, ge=1)


class EditProfile(CompleteProfile):
    revision: int = Field(ge=1)
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None


class RecruitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    import_job_id: UUID
    source_record_id: str | None
    name: str
    national_id: str
    birth_date: date
    gov_id: str
    ps_id: str
    ps_name: str
    type_id: int
    police_number: str | None
    enlistment_year: int
    batch_number: int
    enlistment_start_date: date | None
    enlistment_end_date: date | None
    is_locked: bool
    completed_at: UtcDatetime | None
    barcode: str | None
    revision: int
    suggested_start_date: date | None = None
    suggested_end_date: date | None = None


class ExportRequest(BaseModel):
    format: Literal["xlsx", "accdb"]


class ExportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    import_job_id: UUID
    export_format: str
    status: str
    retry_count: int
    last_error: str | None
    created_at: UtcDatetime
    completed_at: UtcDatetime | None


class RecordErrorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    error_code: str
    field_name: str
    error_message: str


class ImportRecordOut(BaseModel):
    id: UUID
    row_number: int
    validation_status: str
    raw_data: dict
    errors: list[RecordErrorOut]


class ImportReportOut(BaseModel):
    summary: ImportOut
    valid: Page[ImportRecordOut]
    invalid: Page[ImportRecordOut]


class ApprovalOut(BaseModel):
    id: UUID
    status: Literal["APPROVED"]
    inserted_count: int


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    recruit_id: UUID
    original_filename: str
    content_type: str
    file_size_bytes: int
    sha256: str
    created_at: UtcDatetime
