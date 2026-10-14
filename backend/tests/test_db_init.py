import pytest

from app.cli import db_init
from app.core.config import get_settings


def test_split_batches_on_go_lines_only() -> None:
    sql = "SELECT 1;\nGO\nSELECT N'GO here';\n  go  -- comment\n\nGO\n"
    assert db_init.split_batches(sql) == ["SELECT 1;", "SELECT N'GO here';"]


def test_substitute_replaces_known_variables() -> None:
    assert db_init.substitute("USE [$(DB_NAME)];", {"DB_NAME": "personnel"}) == "USE [personnel];"


def test_substitute_rejects_unknown_variables() -> None:
    with pytest.raises(KeyError):
        db_init.substitute("$(NOPE)", {})


def test_script_variables_reject_unsafe_names() -> None:
    settings = get_settings().model_copy(update={"db_name": "x]; DROP DATABASE y; --"})
    with pytest.raises(ValueError):
        db_init.script_variables(settings)


def test_scripts_are_numbered_uniquely() -> None:
    names = [path.name for path in db_init.list_scripts()]
    assert names[0] == "001_database.sql"
    assert len({name[:3] for name in names}) == len(names)


def test_scripts_are_idempotent() -> None:
    settings = get_settings()
    if not settings.db_admin_user or not settings.db_admin_password:
        pytest.skip("DB_ADMIN_USER / DB_ADMIN_PASSWORD not configured")
    # scripts/test.ps1 already ran them once; a second run must succeed without changes.
    db_init.apply_scripts(settings, log=lambda _: None)
