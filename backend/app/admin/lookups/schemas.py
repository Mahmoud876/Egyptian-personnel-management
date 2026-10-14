"""Lookup schemas. Codes use [0-9] (not \\d) so Arabic-Indic digits are rejected, matching the SQL CHECKs."""

from typing import Annotated, Self

from pydantic import BaseModel, Field, StringConstraints, model_validator

_DAYS_IN_MONTH = {1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}


def _text(max_length: int, pattern: str | None = None) -> object:
    return StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length, pattern=pattern)


GovernorateCode = Annotated[str, _text(2, r"^[0-9]{2}$")]
PoliceStationCode = Annotated[str, _text(4, r"^[0-9]{4}$")]
QualificationCode = Annotated[str, _text(2, r"^[0-9]{1,2}$")]
FreeCode = Annotated[str, _text(20)]
Name100 = Annotated[str, _text(100)]
Name200 = Annotated[str, _text(200)]


class GovernorateIn(BaseModel):
    code: GovernorateCode
    name_ar: Name100
    is_active: bool = True


class GovernorateOut(GovernorateIn):
    id: int


class PoliceStationIn(BaseModel):
    code: PoliceStationCode
    name_ar: Name100
    governorate_id: int
    is_active: bool = True


class PoliceStationOut(PoliceStationIn):
    id: int


class QualificationIn(BaseModel):
    code: QualificationCode
    name_ar: Name100
    service_months: int = Field(ge=1, le=120)
    is_active: bool = True


class QualificationOut(QualificationIn):
    id: int


class BatchScheduleUpdate(BaseModel):
    start_month: int = Field(ge=1, le=12)
    start_day: int = Field(ge=1, le=31)

    @model_validator(mode="after")
    def day_exists_in_month(self) -> Self:
        if self.start_day > _DAYS_IN_MONTH[self.start_month]:
            raise ValueError("start_day does not exist in start_month")
        return self


class BatchScheduleOut(BatchScheduleUpdate):
    batch_no: int


class WorkEntityIn(BaseModel):
    code: FreeCode
    name_ar: Name200
    is_active: bool = True


class WorkEntityOut(WorkEntityIn):
    id: int


class ActionTypeIn(BaseModel):
    code: FreeCode
    name_ar: Name200
    is_active: bool = True


class ActionTypeOut(ActionTypeIn):
    id: int
