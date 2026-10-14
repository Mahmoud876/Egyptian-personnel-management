"""Error responses: always {"detail": "<Arabic message>", "code": "<machine code>"}."""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from redis.exceptions import RedisError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core import messages

logger = logging.getLogger(__name__)


class AppError(StarletteHTTPException):
    """An error with an Arabic message for the user and a stable code for the frontend."""

    def __init__(self, status_code: int, detail: str, code: str) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code


_DEFAULTS: dict[int, tuple[str, str]] = {
    status.HTTP_401_UNAUTHORIZED: (messages.NOT_AUTHENTICATED, "not_authenticated"),
    status.HTTP_403_FORBIDDEN: (messages.FORBIDDEN, "forbidden"),
    status.HTTP_404_NOT_FOUND: (messages.NOT_FOUND, "not_found"),
    status.HTTP_405_METHOD_NOT_ALLOWED: (messages.METHOD_NOT_ALLOWED, "method_not_allowed"),
    status.HTTP_409_CONFLICT: (messages.CONFLICT, "conflict"),
    status.HTTP_501_NOT_IMPLEMENTED: (messages.NOT_IMPLEMENTED, "not_implemented"),
}


def error_body(detail: str, code: str, **extra: object) -> dict[str, object]:
    return {"detail": detail, "code": code, **extra}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RedisError)
    async def redis_error(_: Request, exc: RedisError) -> JSONResponse:
        logger.error("Redis unavailable: %s", type(exc).__name__)
        return JSONResponse(error_body("خدمة الجلسات غير متاحة مؤقتاً", "session_store_unavailable"), status_code=503)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if isinstance(exc, AppError):
            detail, code = str(exc.detail), exc.code
        else:
            detail, code = _DEFAULTS.get(exc.status_code, (str(exc.detail), "error"))
        return JSONResponse(error_body(detail, code), status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
        return JSONResponse(
            error_body(messages.VALIDATION_ERROR, "validation_error", errors=errors),
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
        # Safety net: services should catch known constraint violations and return specific messages.
        logger.warning("Unhandled integrity error: %s", exc.orig)
        return JSONResponse(error_body(messages.CONFLICT, "conflict"), status_code=status.HTTP_409_CONFLICT)
