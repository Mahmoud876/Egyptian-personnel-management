"""Linux Access reader contracts; runnable without a database or pytest."""
import csv
import os
import shutil
import subprocess
import unittest
from collections import Counter
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.recruits import files
from app.recruits.validation import FIELDS, validate_row


class AccessReaderTests(unittest.TestCase):
    def test_missing_tool_explains_installation(self):
        with patch.object(files.shutil, "which", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "apt-get install -y mdbtools"):
                list(files._access_records_mdbtools(Path("input.mdb"), "person_data"))

    def test_preserves_text_nulls_and_checks_conversion(self):
        row = dict.fromkeys(FIELDS, "")
        row.update(id="1", name='أحمد,"محمد"\nحسن', national_id="00300010101001", ps_id=None)

        def convert(command, **kwargs):
            self.assertEqual(command[-1], "person_data")
            self.assertEqual(kwargs["env"]["MDBICONV"], "UTF-8")
            writer = csv.writer(kwargs["stdout"], quoting=csv.QUOTE_NOTNULL)
            writer.writerow(FIELDS)
            writer.writerow([row[field] for field in FIELDS])
            return SimpleNamespace(returncode=0)

        with patch.object(files.shutil, "which", return_value="/usr/bin/mdb-export"), \
                patch.object(files.subprocess, "run", side_effect=convert):
            self.assertEqual(list(files._access_records_mdbtools(Path("input.mdb"), "person_data")), [row])

    def test_conversion_failure_and_timeout_do_not_accept_rows(self):
        with patch.object(files.shutil, "which", return_value="/usr/bin/mdb-export"):
            with patch.object(files.subprocess, "run", return_value=SimpleNamespace(returncode=1)):
                with self.assertRaisesRegex(ValueError, "ACCESS_READ_FAILED"):
                    list(files._access_records_mdbtools(Path("bad.mdb"), "person_data"))
            with patch.object(files.subprocess, "run", side_effect=subprocess.TimeoutExpired("mdb-export", 1)):
                with self.assertRaisesRegex(ValueError, "ACCESS_READ_TIMEOUT"):
                    list(files._access_records_mdbtools(Path("bad.mdb"), "person_data"))

    @unittest.skipUnless(os.name != "nt" and shutil.which("mdb-export"), "requires MDB Tools on Unix")
    def test_synthetic_access_files_match_all_expected_outcomes(self):
        root = Path(__file__).resolve().parents[2] / "test-data"
        for size in (1000, 10000):
            with self.subTest(size=size):
                rows = list(files.iter_records(root / f"conscripts_test_{size}.mdb"))
                with (root / f"conscripts_test_{size}_expected.csv").open(encoding="utf-8-sig", newline="") as stream:
                    expected = {row["id"]: row for row in csv.DictReader(stream)}
                self.assertEqual(len(rows), size)
                counts = Counter(str(row.get("national_id") or "").strip() for row in rows)
                for row in rows:
                    nid = str(row.get("national_id") or "").strip()
                    _, errors = validate_row(row, set(), counts[nid] > 1, {1, 2, 3, 4})
                    answer = expected[str(row["id"])]
                    self.assertEqual(row["national_id"] or "", answer["national_id"])
                    self.assertEqual(sorted({error["error_code"] for error in errors}),
                                     sorted(filter(None, answer["expected_errors"].split(";"))))
