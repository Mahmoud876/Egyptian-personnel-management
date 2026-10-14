"""Application settings, read from the repo-root .env file and the process environment."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: Literal["dev", "prod"] = "dev"

    db_host: str = "127.0.0.1"
    db_port: int = 1433
    db_name: str = "personnel"
    db_driver: str = "ODBC Driver 18 for SQL Server"
    db_trust_server_certificate: bool = False
    db_login_timeout_seconds: int = 5

    # Least-privilege login the app runs as (created by backend/sql/007_app_login.sql).
    db_user: str
    db_password: SecretStr

    # Admin login, only for db_init. Not needed by the running app.
    db_admin_user: str | None = None
    db_admin_password: SecretStr | None = None

    # Sessions: opaque HTTP-only, SameSite=Strict cookie; hashed session keys in Redis.
    session_cookie_name: str = "session"
    # Keep true in production (HTTPS). Dev runs over plain HTTP, so .env sets it to false there.
    session_cookie_secure: bool = True
    session_idle_minutes: int = 30
    session_max_hours: int = 12

    redis_url: SecretStr = SecretStr("redis://127.0.0.1:6379/0")
    redis_prefix: str = "personnel"
    queue_name: str = "personnel"
    storage_root: Path = REPO_ROOT / "storage"
    upload_max_bytes: int = 50 * 1024 * 1024
    import_max_rows: int = 100_000
    import_duplicate_policy: Literal["reject_all", "keep_first"] = "reject_all"
    job_max_attempts: int = 3
    job_timeout_seconds: int = 3600
    recovery_interval_seconds: int = 30
    access_table: str = "person_data"
    access_template: Path | None = None

    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # required fields come from .env
