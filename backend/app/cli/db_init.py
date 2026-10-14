"""Applies the numbered T-SQL scripts in backend/sql, in order. They are idempotent, so this is safe to re-run.

Usage (from backend/):  python -m app.cli.db_init

Connects with DB_ADMIN_USER / DB_ADMIN_PASSWORD. The scripts use sqlcmd syntax ($(VAR) variables, GO separators),
so a DBA can also run them by hand:
    sqlcmd -S <server> -U <admin> -I -f 65001 -v DB_NAME=... APP_DB_USER=... APP_DB_PASSWORD=... -i 001_database.sql
"""

import re
import sys
from collections.abc import Callable
from pathlib import Path

import pyodbc

from app.core.config import REPO_ROOT, Settings, get_settings

SQL_DIR = REPO_ROOT / "backend" / "sql"

_GO_LINE = re.compile(r"^[ \t]*GO[ \t]*(?:--[^\n]*)?$", re.IGNORECASE | re.MULTILINE)
_VARIABLE = re.compile(r"\$\((\w+)\)")
_SQL_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")


class ScriptError(Exception):
    def __init__(self, script: str, batch: int, error: Exception) -> None:
        super().__init__(f"{script}, batch {batch}: {error}")


def list_scripts(sql_dir: Path = SQL_DIR) -> list[Path]:
    scripts = sorted(sql_dir.glob("[0-9][0-9][0-9]_*.sql"))
    numbers = [path.name[:3] for path in scripts]
    duplicates = sorted({n for n in numbers if numbers.count(n) > 1})
    if duplicates:
        raise ValueError(f"Duplicate script numbers in {sql_dir}: {', '.join(duplicates)}")
    return scripts


def script_variables(settings: Settings) -> dict[str, str]:
    variables = {
        "DB_NAME": settings.db_name,
        "APP_DB_USER": settings.db_user,
        "APP_DB_PASSWORD": settings.db_password.get_secret_value(),
    }
    # Values are pasted into identifiers ([...]) and string literals (N'...'), so keep them to safe characters.
    for name in ("DB_NAME", "APP_DB_USER"):
        if not _SQL_NAME.match(variables[name]):
            raise ValueError(f"{name} must be letters, digits and underscores, starting with a letter or underscore")
    if any(ch in variables["APP_DB_PASSWORD"] for ch in "'[]"):
        raise ValueError("DB_PASSWORD must not contain ' [ or ]")
    return variables


def substitute(sql: str, variables: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in variables:
            raise KeyError(f"Unknown script variable $({name})")
        return variables[name]

    return _VARIABLE.sub(replace, sql)


def split_batches(sql: str) -> list[str]:
    return [batch.strip() for batch in _GO_LINE.split(sql) if batch.strip()]


def admin_connection_string(settings: Settings) -> str:
    if not settings.db_admin_user or not settings.db_admin_password:
        raise ValueError("DB_ADMIN_USER and DB_ADMIN_PASSWORD must be set in .env to initialise the database")
    password = settings.db_admin_password.get_secret_value().replace("}", "}}")
    parts = [
        f"DRIVER={{{settings.db_driver}}}",
        f"SERVER={settings.db_host},{settings.db_port}",
        "DATABASE=master",
        f"UID={settings.db_admin_user}",
        f"PWD={{{password}}}",
        "Encrypt=yes",
    ]
    if settings.db_trust_server_certificate:
        parts.append("TrustServerCertificate=yes")
    return ";".join(parts)


def _run_batch(cursor: pyodbc.Cursor, batch: str) -> None:
    cursor.execute(batch)
    # Walk every result set: pyodbc only raises errors from later statements in a batch when they are reached.
    while cursor.nextset():
        pass


def apply_scripts(settings: Settings | None = None, log: Callable[[str], None] = print) -> None:
    settings = settings or get_settings()
    variables = script_variables(settings)
    scripts = list_scripts()

    connection = pyodbc.connect(
        admin_connection_string(settings), autocommit=True, timeout=settings.db_login_timeout_seconds
    )
    try:
        cursor = connection.cursor()
        for path in scripts:
            batches = split_batches(substitute(path.read_text(encoding="utf-8-sig"), variables))
            for number, batch in enumerate(batches, start=1):
                try:
                    _run_batch(cursor, batch)
                except pyodbc.Error as exc:
                    raise ScriptError(path.name, number, exc) from exc
            log(f"  {path.name}: ok ({len(batches)} batches)")
    finally:
        connection.close()


def main() -> int:
    settings = get_settings()
    print(f"Applying {SQL_DIR.relative_to(REPO_ROOT)} to {settings.db_host},{settings.db_port}/{settings.db_name}")
    try:
        apply_scripts(settings)
    except (ScriptError, ValueError, KeyError, pyodbc.Error) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    print("Database is up to date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
