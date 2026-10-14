"""Phase 1: tables, constraints and seeds created by backend/sql exist and behave as documented.

Runs as the least-privilege app login, inside a transaction that is rolled back.
"""

import re
from pathlib import Path

import pytest
from sqlalchemy import Connection, inspect, text
from sqlalchemy.exc import DBAPIError

from app.core.config import REPO_ROOT
from app.core.db import get_engine
from app.models import Base

PERMISSIONS_DOC = REPO_ROOT / "docs" / "permissions.md"
PERIOD_COLUMNS = {"valid_from", "valid_to"}


def _doc_section(path: Path, heading: str) -> str:
    text_ = path.read_text(encoding="utf-8")
    start = text_.index(heading)
    end = text_.find("\n## ", start + len(heading))
    return text_[start : end if end != -1 else None]


def _doc_permissions() -> dict[str, str]:
    """code -> Arabic name, from the tables under '## Permission codes'."""
    section = _doc_section(PERMISSIONS_DOC, "## Permission codes")
    return dict(re.findall(r"^\| `([a-z0-9._]+)` \| ([^|]+?) \|", section, re.MULTILINE))


def _doc_templates(all_codes: set[str]) -> dict[str, set[str]]:
    """template name -> codes, from '## Seed templates', with `prefix.*` expanded."""
    section = _doc_section(PERMISSIONS_DOC, "## Seed templates")
    templates: dict[str, set[str]] = {}
    for name, codes_cell in re.findall(r"^\| ([^|`]+?) \| (.+?) \|$", section, re.MULTILINE):
        if name.strip() == "Template" or set(name.strip()) <= {"-", " "}:
            continue
        codes: set[str] = set()
        for token in re.findall(r"`([a-z0-9._*]+)`", codes_cell):
            if token.endswith(".*"):
                codes |= {c for c in all_codes if c.startswith(token[:-1])}
            else:
                codes.add(token)
        templates[name.strip()] = codes
    return templates


def _expect_db_error(db: Connection, sql: str, params: dict[str, object], fragment: str) -> None:
    """Runs sql inside a savepoint and asserts it fails with an error mentioning fragment."""
    with pytest.raises(DBAPIError) as excinfo:
        with db.begin_nested():
            db.execute(text(sql), params)
    assert fragment in str(excinfo.value)


def _new_import_batch(db: Connection) -> int:
    return db.execute(
        text(
            "INSERT INTO dbo.import_batch (batch_no, conscription_year, file_name, file_sha256) "
            "OUTPUT inserted.id VALUES (1, 2026, N'test.mdb', :sha)"
        ),
        {"sha": "0" * 64},
    ).scalar_one()


_INSERT_CONSCRIPT = text(
    "INSERT INTO dbo.conscript (national_id, full_name, birth_date, governorate_id, police_station_id, "
    "qualification_id, import_batch_id, conscription_year, batch_no, police_no, start_date, end_date) "
    "OUTPUT inserted.id "
    "SELECT :nid, :name, '2000-01-01', g.id, p.id, q.id, :batch, 2026, 1, :police_no, :start, :end "
    "FROM dbo.governorate g JOIN dbo.police_station p ON p.governorate_id = g.id "
    "CROSS JOIN dbo.qualification q WHERE p.code = N'0101' AND q.code = N'1'"
)


def _conscript_params(batch_id: int, **overrides: object) -> dict[str, object]:
    params: dict[str, object] = {
        "nid": "30001010112345",
        "name": "محمد أحمد علي حسن",
        "batch": batch_id,
        "police_no": None,
        "start": None,
        "end": None,
    }
    params.update(overrides)
    return params


# --- structure ----------------------------------------------------------------


def test_models_match_database(db: Connection) -> None:
    inspector = inspect(db)
    db_tables = {t for t in inspector.get_table_names(schema="dbo") if not t.endswith("_history")}
    assert db_tables == set(Base.metadata.tables), "every table needs a model and every model a table"

    for table in Base.metadata.tables.values():
        db_columns = {
            c["name"]: c for c in inspector.get_columns(table.name, schema="dbo") if c["name"] not in PERIOD_COLUMNS
        }
        assert set(table.columns.keys()) == set(db_columns), f"{table.name}: columns differ"
        for column in table.columns:
            db_column = db_columns[column.name]
            if column.computed is None:
                assert column.nullable == db_column["nullable"], f"{table.name}.{column.name}: nullability differs"
            model_length = getattr(column.type, "length", None)
            db_length = getattr(db_column["type"], "length", None)
            assert model_length == db_length, f"{table.name}.{column.name}: length {model_length} != {db_length}"


def test_database_collation_is_arabic(db: Connection) -> None:
    collation = db.execute(text("SELECT CONVERT(NVARCHAR(128), DATABASEPROPERTYEX(DB_NAME(), 'Collation'))"))
    assert collation.scalar_one() == "Arabic_100_CI_AS"


@pytest.mark.parametrize("table", ["conscript", "employee", "job_action"])
def test_table_is_system_versioned(db: Connection, table: str) -> None:
    row = db.execute(
        text(
            "SELECT t.temporal_type, h.name FROM sys.tables t "
            "LEFT JOIN sys.tables h ON h.object_id = t.history_table_id WHERE t.name = :table"
        ),
        {"table": table},
    ).one()
    assert row == (2, f"{table}_history")


# --- seeds --------------------------------------------------------------------


def test_permission_codes_match_docs(db: Connection) -> None:
    seeded = {row.code: row.name_ar for row in db.execute(text("SELECT code, name_ar FROM dbo.permission"))}
    documented = _doc_permissions()
    assert len(documented) == 27
    assert seeded == documented


def test_seed_templates_match_docs(db: Connection) -> None:
    rows = db.execute(
        text(
            "SELECT t.name_ar, tp.permission_code FROM dbo.permission_template t "
            "JOIN dbo.template_permission tp ON tp.template_id = t.id"
        )
    )
    seeded: dict[str, set[str]] = {}
    for name, code in rows:
        seeded.setdefault(name, set()).add(code)
    expected = _doc_templates(set(_doc_permissions()))
    assert len(expected) == 6
    assert seeded == expected


def test_lookup_seeds(db: Connection) -> None:
    def count(table: str) -> int:
        return db.execute(text(f"SELECT COUNT(*) FROM dbo.{table}")).scalar_one()

    assert count("governorate") == 12
    assert count("police_station") == 24
    service_months = {
        row.code: row.service_months for row in db.execute(text("SELECT code, service_months FROM dbo.qualification"))
    }
    assert service_months == {"1": 14, "2": 26, "3": 20, "4": 38}
    batches = db.execute(text("SELECT batch_no, start_month, start_day FROM dbo.batch_schedule ORDER BY 1")).all()
    assert [tuple(b) for b in batches] == [(1, 1, 1), (2, 4, 1), (3, 7, 1), (4, 10, 1)]


def test_police_stations_belong_to_their_governorate(db: Connection) -> None:
    mismatched = db.execute(
        text(
            "SELECT p.code FROM dbo.police_station p JOIN dbo.governorate g ON g.id = p.governorate_id "
            "WHERE LEFT(p.code, 2) <> g.code"
        )
    ).all()
    assert mismatched == []


# --- constraints and functions -----------------------------------------------


def test_normalize_arabic_name(db: Connection) -> None:
    result = db.execute(
        text("SELECT dbo.fn_normalize_ar_name(:name)"), {"name": "أَحْمَد إبراهيم آدم فاطمة مصطفى عـــلي"}
    ).scalar_one()
    assert result == "احمد ابراهيم ادم فاطمه مصطفي علي"


def test_conscript_name_normalized_is_computed(db: Connection) -> None:
    conscript_id = db.execute(_INSERT_CONSCRIPT, _conscript_params(_new_import_batch(db), name="أحمد مصطفى")).scalar_one()
    normalized = db.execute(
        text("SELECT name_normalized FROM dbo.conscript WHERE id = :id"), {"id": conscript_id}
    ).scalar_one()
    assert normalized == "احمد مصطفي"


@pytest.mark.parametrize(
    ("national_id", "error"),
    [
        ("3000101011234", "CK_conscript_national_id"),
        ("300010101123456", "would be truncated"),  # longer than the NVARCHAR(14) column
        ("3000101011234X", "CK_conscript_national_id"),
        ("٣0001010112345", "CK_conscript_national_id"),
    ],
    ids=["13 digits", "15 digits", "letter", "arabic-indic digit"],
)
def test_conscript_rejects_invalid_national_id(db: Connection, national_id: str, error: str) -> None:
    params = _conscript_params(_new_import_batch(db), nid=national_id)
    _expect_db_error(db, str(_INSERT_CONSCRIPT), params, error)


def test_conscript_national_id_is_unique(db: Connection) -> None:
    batch_id = _new_import_batch(db)
    db.execute(_INSERT_CONSCRIPT, _conscript_params(batch_id))
    _expect_db_error(db, str(_INSERT_CONSCRIPT), _conscript_params(batch_id), "UQ_conscript_national_id")


def test_conscript_police_no_unique_per_year_but_many_unentered(db: Connection) -> None:
    batch_id = _new_import_batch(db)
    # Several conscripts without a police number yet: allowed.
    db.execute(_INSERT_CONSCRIPT, _conscript_params(batch_id, nid="30001010112345"))
    db.execute(_INSERT_CONSCRIPT, _conscript_params(batch_id, nid="30001010112347"))
    # The same police number twice in one year: rejected.
    db.execute(_INSERT_CONSCRIPT, _conscript_params(batch_id, nid="30001010112349", police_no="555"))
    _expect_db_error(
        db,
        str(_INSERT_CONSCRIPT),
        _conscript_params(batch_id, nid="30001010112351", police_no="555"),
        "UQ_conscript_police_no_year",
    )


def test_conscript_end_date_after_start_date(db: Connection) -> None:
    params = _conscript_params(_new_import_batch(db), start="2026-01-01", end="2026-01-01")
    _expect_db_error(db, str(_INSERT_CONSCRIPT), params, "CK_conscript_dates")


def test_conscript_registered_requires_entered_data(db: Connection) -> None:
    conscript_id = db.execute(_INSERT_CONSCRIPT, _conscript_params(_new_import_batch(db))).scalar_one()
    _expect_db_error(
        db,
        "UPDATE dbo.conscript SET status = N'registered' WHERE id = :id",
        {"id": conscript_id},
        "CK_conscript_registered",
    )


def test_conscript_changes_are_kept_in_history(db: Connection) -> None:
    conscript_id = db.execute(_INSERT_CONSCRIPT, _conscript_params(_new_import_batch(db))).scalar_one()
    db.execute(text("UPDATE dbo.conscript SET barcode = N'B1' WHERE id = :id"), {"id": conscript_id})
    # Read the history table directly: inside one transaction both versions share a timestamp, and
    # FOR SYSTEM_TIME ALL hides such zero-length versions.
    old_versions = db.execute(
        text("SELECT barcode FROM dbo.conscript_history WHERE id = :id"), {"id": conscript_id}
    ).all()
    assert [row.barcode for row in old_versions] == [None]


# --- least-privilege app login ------------------------------------------------


def test_app_login_can_insert_audit_log(db: Connection) -> None:
    db.execute(text("INSERT INTO dbo.audit_log (action, entity) VALUES (N'test', N'test')"))


def test_app_login_cannot_update_audit_log(db: Connection) -> None:
    _expect_db_error(db, "UPDATE dbo.audit_log SET action = N'x'", {}, "permission was denied")


def test_app_login_cannot_delete_audit_log(db: Connection) -> None:
    _expect_db_error(db, "DELETE FROM dbo.audit_log", {}, "permission was denied")


def test_app_login_cannot_change_permission_codes(db: Connection) -> None:
    _expect_db_error(
        db,
        "INSERT INTO dbo.permission (code, module, name_ar, name_en) VALUES (N'x.y', N'admin', N'x', N'x')",
        {},
        "permission was denied",
    )
    _expect_db_error(db, "UPDATE dbo.permission SET name_ar = N'x'", {}, "permission was denied")


def test_app_login_cannot_alter_schema() -> None:
    # Own connection: this error rolls back the whole transaction, not just a savepoint.
    with get_engine().connect() as connection:
        with pytest.raises(DBAPIError) as excinfo:
            connection.execute(text("CREATE TABLE dbo.should_not_exist (id INT)"))
        connection.rollback()
    assert "permission denied" in str(excinfo.value)
