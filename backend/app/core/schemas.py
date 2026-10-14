"""Shared API schema pieces."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel


def _as_utc(value: datetime) -> datetime:
    # DB timestamps are naive UTC; mark them so JSON carries the offset and the browser converts to local time.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
