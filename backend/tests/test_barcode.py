"""Conscript barcode generation (docs/business-rules.md#barcode)."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError

from app.admin.models import PoliceStation, Qualification
from app.core.db import get_sessionmaker
from app.modules.conscripts.barcode import assign_barcode, format_barcode, is_valid_barcode
from app.modules.conscripts.models import Conscript, ImportBatch


def _national_id() -> str:
    return f"3{uuid4().int % 10**13:013d}"


def _create_conscripts(count: int, year: int = 2026, batch_no: int = 3) -> list[int]:
    """Commits `count` received conscripts and returns their ids."""
    with get_sessionmaker()() as session:
        governorate_id, station_id = session.execute(
            select(PoliceStation.governorate_id, PoliceStation.id).where(PoliceStation.code == "0101")
        ).one()
        qualification_id = session.scalar(select(Qualification.id).where(Qualification.code == "1"))
        batch = ImportBatch(batch_no=batch_no, conscription_year=year, file_name="barcode-test.mdb", file_sha256="0" * 64)
        session.add(batch)
        session.flush()
        conscripts = [
            Conscript(
                national_id=_national_id(),
                full_name="مجند اختبار الباركود",
                birth_date=date(2000, 1, 1),
                governorate_id=governorate_id,
                police_station_id=station_id,
                qualification_id=qualification_id,
                import_batch_id=batch.id,
                conscription_year=year,
                batch_no=batch_no,
            )
            for _ in range(count)
        ]
        session.add_all(conscripts)
        session.commit()
        return [c.id for c in conscripts]


def _assign_and_commit(conscript_id: int) -> str:
    with get_sessionmaker()() as session:
        conscript = session.get(Conscript, conscript_id)
        assert conscript is not None
        barcode = assign_barcode(session, conscript)
        session.commit()
        return barcode


# --- format --------------------------------------------------------------------


def test_format_is_year_batch_and_seven_digit_sequence() -> None:
    assert format_barcode(2026, 3, 1234) == "202630001234"
    assert format_barcode(2027, 1, 9_999_999) == "202719999999"


@pytest.mark.parametrize(("year", "batch", "sequence"), [(1999, 1, 1), (2026, 5, 1), (2026, 0, 1), (2026, 1, 0), (2026, 1, 10**7)])
def test_format_rejects_out_of_range_parts(year: int, batch: int, sequence: int) -> None:
    with pytest.raises(ValueError):
        format_barcode(year, batch, sequence)


@pytest.mark.parametrize(
    ("value", "valid"),
    [("202630001234", True), ("20263000123", False), ("202650001234", False), ("2026300012a4", False), ("٢٠٢٦30001234", False)],
)
def test_is_valid_barcode(value: str, valid: bool) -> None:
    assert is_valid_barcode(value) is valid


# --- assignment --------------------------------------------------------------------


def test_assign_gives_a_valid_barcode_once() -> None:
    [conscript_id] = _create_conscripts(1, year=2026, batch_no=3)

    first = _assign_and_commit(conscript_id)
    second = _assign_and_commit(conscript_id)

    assert is_valid_barcode(first)
    assert first.startswith("20263")
    assert second == first


def test_parallel_saves_never_produce_duplicates() -> None:
    ids = _create_conscripts(40)

    with ThreadPoolExecutor(max_workers=8) as pool:
        barcodes = list(pool.map(_assign_and_commit, ids))

    assert len(set(barcodes)) == 40
    assert all(is_valid_barcode(b) for b in barcodes)


def test_racing_saves_of_one_record_agree_on_one_barcode() -> None:
    [conscript_id] = _create_conscripts(1)

    with ThreadPoolExecutor(max_workers=8) as pool:
        barcodes = list(pool.map(lambda _: _assign_and_commit(conscript_id), range(8)))

    assert len(set(barcodes)) == 1
    with get_sessionmaker()() as session:
        assert session.scalar(select(Conscript.barcode).where(Conscript.id == conscript_id)) == barcodes[0]


# --- database guards -----------------------------------------------------------------


@pytest.mark.parametrize("new_value", ["202639999999", None])
def test_database_refuses_to_change_an_assigned_barcode(new_value: str | None) -> None:
    [conscript_id] = _create_conscripts(1)
    _assign_and_commit(conscript_id)

    with get_sessionmaker()() as session:
        conscript = session.get(Conscript, conscript_id)
        assert conscript is not None
        conscript.barcode = new_value
        with pytest.raises(DBAPIError, match="TR_conscript_barcode_immutable"):
            session.commit()


def test_database_rejects_malformed_barcode() -> None:
    [conscript_id] = _create_conscripts(1)

    with get_sessionmaker()() as session:
        conscript = session.get(Conscript, conscript_id)
        assert conscript is not None
        conscript.barcode = "ABC123"
        with pytest.raises(DBAPIError, match="CK_conscript_barcode_format"):
            session.commit()


def test_registered_record_requires_a_barcode() -> None:
    [conscript_id] = _create_conscripts(1)

    with get_sessionmaker()() as session:
        conscript = session.get(Conscript, conscript_id)
        assert conscript is not None
        conscript.police_no = "55123"
        conscript.start_date = date(2026, 7, 1)
        conscript.end_date = date(2027, 9, 1)
        conscript.locked_at = conscript.created_at
        conscript.status = "registered"
        with pytest.raises(DBAPIError, match="CK_conscript_registered"):
            session.commit()
