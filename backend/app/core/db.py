"""SQLAlchemy engine and sessions. The T-SQL scripts in backend/sql are the schema's source of truth."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import URL, Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings


def build_url(settings: Settings) -> URL:
    query = {"driver": settings.db_driver, "Encrypt": "yes"}
    if settings.db_trust_server_certificate:
        query["TrustServerCertificate"] = "yes"
    return URL.create(
        "mssql+pyodbc",
        username=settings.db_user,
        password=settings.db_password.get_secret_value(),
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        query=query,
    )


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    return create_engine(
        build_url(settings),
        pool_pre_ping=True,
        # pyodbc login timeout, so an unreachable server fails fast.
        connect_args={"timeout": settings.db_login_timeout_seconds},
    )


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    with get_sessionmaker()() as session:
        yield session
