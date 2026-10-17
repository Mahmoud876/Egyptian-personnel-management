"""Private persistent files. Workers and API must share STORAGE_ROOT."""
import csv
import hashlib
import os
import shutil
import subprocess
import json
from tempfile import TemporaryFile
from collections.abc import Iterable
from contextlib import suppress
from datetime import date, datetime
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

import pyodbc
from fastapi import UploadFile

from app.core.config import get_settings
from app.core.errors import AppError
from .validation import FIELDS

IMPORT_EXTENSIONS = {".xlsx", ".xls", ".csv", ".accdb", ".mdb"}


def path_for(storage_key: str) -> Path:
    root = get_settings().storage_root.resolve()
    result = (root / storage_key).resolve()
    if not result.is_relative_to(root):
        raise ValueError("Storage path outside configured root")
    return result


def new_key(folder: str, extension: str) -> str:
    return f"{folder}/{uuid4().hex}{extension}"


async def save_upload(file: UploadFile, folder: str, allowed: set[str]):
    name = (file.filename or "upload").replace("\\", "/").split("/")[-1]
    if len(name) > 260 or Path(name).suffix.lower() not in allowed:
        raise AppError(422, "نوع الملف غير مدعوم", "file_type")
    storage_key = new_key(folder, Path(name).suffix.lower())
    path = path_for(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    digest = hashlib.sha256()
    try:
        with path.open("xb") as target:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > get_settings().upload_max_bytes:
                    raise AppError(413, "حجم الملف يتجاوز الحد المسموح", "file_too_large")
                digest.update(chunk)
                target.write(chunk)
        if size == 0:
            raise AppError(422, "الملف فارغ", "empty_file")
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    return name, storage_key, size, digest.hexdigest()


def _cell(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    # Raw Excel numbers remain numbers; leading zeroes are not invented.
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def _records(headers, rows):
    headers = [str(v or "").strip().lower() for v in headers]
    if len(headers) != len(set(headers)) or not set(FIELDS) <= set(headers):
        raise ValueError("INVALID_COLUMNS: required columns: " + ", ".join(FIELDS))
    for row in rows:
        if all(v is None or str(v).strip() == "" for v in row):
            continue
        if len(row) > len(headers):
            raise ValueError("ROW_COLUMN_COUNT: row has more cells than headers")
        yield dict(zip(headers, [_cell(v) for v in row]))


def access_connection(path: Path, readonly=True):
    location = str(path.resolve())
    if ";" in location:
        raise ValueError("Access storage path cannot contain semicolons")
    # ACE treats braces around DBQ as literal filename characters (unlike SQL Server).
    return pyodbc.connect("DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=" + location +
                          ";ReadOnly=" + ("1" if readonly else "0") + ";", autocommit=False)


def _access_records_mdbtools(path: Path, table: str):
    executable = shutil.which("mdb-export")
    if executable is None:
        raise RuntimeError("ACCESS_READER_REQUIRED: install MDB Tools on the worker: sudo apt-get install -y mdbtools")
    # Spool to disk to bound memory and check the exit status before accepting rows.
    # Physical row order is repeatable because uploads are immutable.
    with TemporaryFile(mode="w+", encoding="utf-8", newline="") as output, TemporaryFile() as errors:
        try:
            result = subprocess.run(
                [executable, "-D", "%Y-%m-%d", "-T", "%Y-%m-%dT%H:%M:%S", str(path.resolve()), table],
                stdout=output, stderr=errors, env=dict(os.environ, MDBICONV="UTF-8"),
                timeout=get_settings().job_timeout_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError("ACCESS_READ_TIMEOUT: MDB Tools could not read the file in time") from exc
        if result.returncode:
            raise ValueError("ACCESS_READ_FAILED: MDB Tools could not read the configured table")
        output.seek(0)
        csv.field_size_limit(1024 * 1024)
        # MDB Tools quotes text, including empty text; unquoted empty cells are NULL.
        reader = csv.reader(output, quoting=csv.QUOTE_NOTNULL)
        yield from _records(next(reader, []), reader)


def iter_records(path: Path):
    suffix = path.suffix.lower()
    if suffix == ".csv":
        csv.field_size_limit(1024 * 1024)
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.reader(stream)
            yield from _records(next(reader, []), reader)
    elif suffix == ".xlsx":
        from openpyxl import load_workbook
        with ZipFile(path) as archive:
            if sum(info.file_size for info in archive.infolist()) > 250 * 1024 * 1024:
                raise ValueError("WORKBOOK_TOO_LARGE")
        workbook = load_workbook(path, read_only=True, data_only=False, keep_links=False)
        try:
            rows = workbook.active.iter_rows(values_only=True)
            yield from _records(next(rows, []), rows)
        finally:
            workbook.close()
    elif suffix == ".xls":
        import xlrd
        book = xlrd.open_workbook(path, on_demand=True)
        try:
            sheet = book.sheet_by_index(0)
            def rows():
                for i in range(1, sheet.nrows):
                    yield [xlrd.xldate_as_datetime(c.value, book.datemode) if c.ctype == xlrd.XL_CELL_DATE else c.value for c in sheet.row(i)]
            yield from _records(sheet.row_values(0) if sheet.nrows else [], rows())
        finally:
            book.release_resources()
    elif suffix in {".accdb", ".mdb"}:
        table = get_settings().access_table
        if not table.replace("_", "").isalnum():
            raise ValueError("Invalid configured Access table")
        if os.name != "nt":
            yield from _access_records_mdbtools(path, table)
            return
        with access_connection(path) as conn:
            # Stable ordering matters for restart checkpoints. Materialization below is reused for a run.
            cursor = conn.execute(f"SELECT * FROM [{table}] ORDER BY [id]")
            yield from _records([c[0] for c in cursor.description], cursor)
    else:
        raise ValueError("Unsupported file format")


def read_records(path: Path):
    rows = []
    for row in iter_records(path):
        rows.append(row)
        if len(rows) > get_settings().import_max_rows:
            raise ValueError("ROW_LIMIT_EXCEEDED")
    return rows


def create_access(path: Path):
    """ACE DAO creates a real ACCDB; no renamed CSV or placeholder download."""
    import shutil
    template = get_settings().access_template
    if template:
        shutil.copyfile(template, path)
        return
    if os.name != "nt":
        raise RuntimeError("ACCESS_ENGINE_REQUIRED: use a Windows worker with ACE DAO or configure ACCESS_TEMPLATE")
    env = dict(os.environ, POC_ACCESS_OUTPUT=str(path.resolve()))
    script = "$ErrorActionPreference='Stop'; $engine=New-Object -ComObject DAO.DBEngine.120; $db=$engine.CreateDatabase($env:POC_ACCESS_OUTPUT,';LANGID=0x0409;CP=1252;COUNTRY=0',128); $db.Close()"
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                            env=env, capture_output=True, timeout=60, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError("ACCESS_ENGINE_REQUIRED: install 64-bit ACE DAO or configure ACCESS_TEMPLATE")


def write_export(path: Path, headers: list[str], rows: Iterable[dict]):
    written = 0
    if path.suffix == ".xlsx":
        from openpyxl import Workbook
        from openpyxl.cell import WriteOnlyCell
        book = Workbook(write_only=True)
        sheet = book.create_sheet("Rejected records")
        try:
            sheet.append(headers)
            for row in rows:
                cells = []
                for h in headers:
                    value = row.get(h)
                    if value is not None and len(str(value)) > 32767:
                        raise ValueError("EXCEL_CELL_TOO_LONG: use ACCDB export to preserve the complete raw value")
                    cell = WriteOnlyCell(sheet, value=value)
                    if isinstance(value, str):
                        cell.data_type = "s"  # Formula-like uploaded text must remain literal text.
                    cells.append(cell)
                sheet.append(cells)
                written += 1
            book.save(path)
        except BaseException:
            # Write-only workbooks have no public abort API. Close the XML generator and
            # remove this worksheet's temporary file using the pinned openpyxl writer.
            with suppress(Exception):
                sheet.close()
            with suppress(Exception):
                if sheet._writer is not None and Path(sheet._writer.out).exists():
                    sheet._writer.cleanup()
            raise
        finally:
            book.close()

    else:
        if len(headers) > 255 or any(len(h) > 64 or any(c in h for c in ".!`[]") for h in headers):
            raise ValueError("ACCESS_COLUMN_LIMIT: export as XLSX")
        create_access(path)
        with access_connection(path, readonly=False) as conn:
            columns = ", ".join(f"[{h}] LONGTEXT" for h in headers)
            conn.execute(f"CREATE TABLE [rejected_records] ({columns})")
            placeholders = ",".join("?" for _ in headers)
            for row in rows:
                conn.execute(f"INSERT INTO [rejected_records] VALUES ({placeholders})",
                             [None if row.get(h) is None else str(row[h]) for h in headers])
                written += 1
            conn.commit()
    return written
