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
    db_name: str = "master"
    db_user: str
    db_password: SecretStr
    db_driver: str = "ODBC Driver 18 for SQL Server"
    db_trust_server_certificate: bool = False
    db_login_timeout_seconds: int = 5

    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # required fields come from .env
