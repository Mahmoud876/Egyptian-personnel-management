"""Fresh-process export memory probe; invoked by the bounded-memory regression test."""
import gc
import json
import sys
import tracemalloc
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, insert
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.recruits import jobs
from app.recruits.files import write_export
from app.recruits.models import ImportRecord, ImportRecordError
from app.recruits.validation import FIELDS


def main():
    count = int(sys.argv[1])
    root = Path(sys.argv[2])
    engine = create_engine("sqlite:///" + str(root / "records.db"))
    for model in (ImportRecord, ImportRecordError):
        model.__table__.create(engine)
    parent = uuid4()
    raw = json.dumps({field: "synthetic text value" for field in FIELDS})
    with engine.begin() as connection:
        for offset in range(0, count, 500):
            records, errors = [], []
            for number in range(offset, min(offset + 500, count)):
                identity = uuid4()
                records.append(dict(id=identity, import_job_id=parent, row_number=number + 1,
                    raw_data_json=raw, validation_status="INVALID"))
                errors.append(dict(id=uuid4(), import_row_id=identity, error_code="ID_LENGTH",
                    field_name="national_id", error_message="synthetic rejection"))
            connection.execute(insert(ImportRecord), records)
            connection.execute(insert(ImportRecordError), errors)
    del records, errors
    gc.collect()
    settings = Settings(db_user="test", db_password="test", export_batch_size=500)
    jobs.get_settings = lambda: settings
    tracemalloc.start()
    with sessionmaker(engine)() as db:
        headers, reasons, original = jobs.export_layout(db, parent)
        written = write_export(root / "output.xlsx", headers, jobs.export_rows(db, parent, reasons, original))
    _, peak = tracemalloc.get_traced_memory()
    result = {"rows": written, "python_peak_bytes": peak}
    try:
        import resource
        result["peak_rss_kib"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except ImportError:
        pass
    print(json.dumps(result))
    engine.dispose()


if __name__ == "__main__":
    main()
