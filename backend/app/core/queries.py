"""Query helpers: pagination, LIKE escaping, constraint names from SQL Server errors."""

import re
from collections.abc import Callable, Sequence
from typing import Any

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.schemas import Page

_CONSTRAINT = re.compile(r"(?:constraint|index) ['\"]([A-Za-z0-9_]+)['\"]", re.IGNORECASE)


class PageParams(BaseModel):
    page: int
    page_size: int


def page_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


def paginate[T](db: Session, statement: Select[Any], params: PageParams, to_item: Callable[[Any], T]) -> Page[T]:
    """statement must have an ORDER BY (SQL Server needs one for OFFSET)."""
    total = db.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
    rows: Sequence[Any] = db.execute(
        statement.offset((params.page - 1) * params.page_size).limit(params.page_size)
    ).all()
    return Page(items=[to_item(row) for row in rows], total=total, page=params.page, page_size=params.page_size)


def like_contains(text: str) -> str:
    """'%text%' with SQL Server LIKE wildcards in the user's text escaped."""
    escaped = text.replace("[", "[[]").replace("%", "[%]").replace("_", "[_]")
    return f"%{escaped}%"


def violated_constraint(exc: IntegrityError) -> str | None:
    """Name of the constraint or unique index in a SQL Server integrity error (e.g. 'UQ_app_user_username')."""
    match = _CONSTRAINT.search(str(exc.orig))
    return match.group(1) if match else None
