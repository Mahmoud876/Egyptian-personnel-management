"""Conscript barcodes (docs/business-rules.md#barcode).

Value: 12 digits = conscription year (4) + batch (1) + sequence (7) from dbo.conscript_barcode_seq,
e.g. 202630001234. Digits only, so USB scanners type it correctly on any keyboard layout, and an even
length, so Code 128 encodes it in its compact numeric mode (subset C).

The data-entry save (PUT /conscripts/{id}/enlistment) calls assign_barcode() in the same transaction that
marks the record 'registered'. A barcode never changes once assigned (enforced by
TR_conscript_barcode_immutable); reprinting a label reuses it.
"""

import re

from sqlalchemy import text, update
from sqlalchemy.orm import Session

from app.modules.conscripts.models import Conscript

BARCODE_LENGTH = 12
SEQUENCE_DIGITS = 7
MAX_SEQUENCE = 10**SEQUENCE_DIGITS - 1

_BARCODE = re.compile(r"^2[0-9]{3}[1-4][0-9]{7}$")


def format_barcode(conscription_year: int, batch_no: int, sequence: int) -> str:
    if not 2000 <= conscription_year <= 2999:
        raise ValueError(f"conscription_year out of range: {conscription_year}")
    if not 1 <= batch_no <= 4:
        raise ValueError(f"batch_no out of range: {batch_no}")
    if not 1 <= sequence <= MAX_SEQUENCE:
        raise ValueError(f"sequence out of range: {sequence}")
    return f"{conscription_year:04d}{batch_no}{sequence:0{SEQUENCE_DIGITS}d}"


def is_valid_barcode(value: str) -> bool:
    """Format check for scanned or typed input (search by barcode)."""
    return bool(_BARCODE.match(value))


def assign_barcode(db: Session, conscript: Conscript) -> str:
    """Gives `conscript` a barcode if it has none and returns its barcode. The caller commits.

    Safe under concurrency: the UPDATE only applies while the barcode is still NULL, so if two saves race
    on the same record, one value wins and both callers get it. Different records always get different
    numbers because each takes its own value from the sequence.
    """
    if conscript.barcode:
        return conscript.barcode

    sequence = db.scalar(text("SELECT NEXT VALUE FOR dbo.conscript_barcode_seq"))
    candidate = format_barcode(conscript.conscription_year, conscript.batch_no, int(sequence))
    db.execute(
        update(Conscript)
        .where(Conscript.id == conscript.id, Conscript.barcode.is_(None))
        .values(barcode=candidate)
        .execution_options(synchronize_session=False)
    )
    # Read back what was stored: our candidate, or the value of a save that got there first.
    db.refresh(conscript, ["barcode"])
    if conscript.barcode is None:
        raise RuntimeError(f"barcode not stored for conscript {conscript.id}")
    return conscript.barcode
