# Conscript import test data

Synthetic Armed Forces files for testing the upload, validation and review workflow. Every person is invented. The files use the same Access layout as the real sample (`person_data` table, same columns and column types), so they go through exactly the same path as a real file.

| File | Rows | Valid | Rejected |
| --- | --- | --- | --- |
| `conscripts_test_1000.mdb` | 1,000 | 800 | 200 |
| `conscripts_test_10000.mdb` | 10,000 | 8,000 | 2,000 |

Each `.mdb` has an answer key (`*_expected.csv`, UTF-8, opens in Excel) with one line per record: `id`, `national_id`, `name`, `expected_status` (`VALID` / `INVALID`), `expected_errors` (the backend error codes) and `case` (what is wrong).

## What the rejected rows cover

| Error code | Problem | 1k | 10k |
| --- | --- | --- | --- |
| `ID_LENGTH` | National ID is not 14 characters (13, 15, 12, empty, text) | 22 | 220 |
| `ID_DIGITS` | Letters, symbols or Arabic-Indic digits (٣٠١…) in the ID | 19 | 190 |
| `ID_BIRTH_DATE` | Birth date inside the ID is impossible: century 1, month 13, 31 April, year 2057+ | 15 | 150 |
| `BIRTH_DATE` | `birth_date` empty or not `YYYY-MM-DD` (`15/01/2001`, `غير معروف`…) | 18 | 180 |
| `BIRTH_MISMATCH` | `birth_date` differs from the date in the ID | 21 | 210 |
| `GOV_UNKNOWN` | Governorate code not on the official list | 12 | 120 |
| `GOV_MISMATCH` | Governorate code differs from the one in the ID, or is unknown | 32 | 320 |
| `GENDER` | 13th digit even (female ID) | 23 | 230 |
| `FIELD_REQUIRED` | Name, police station, governorate name or qualification name empty | 25 | 250 |
| `FIELD_TOO_LONG` | Police station code over 20 or name over 200 characters | 5 | 50 |
| `QUALIFICATION` | Qualification ID `0`, `5`, `9`, empty, text or `1.5` | 21 | 210 |
| `DUPLICATE_FILE` | Same national ID twice in the file (both copies) | 20 | 200 |

Counts are per error code. Some rows have several errors at once, so the columns add up to more than the number of rejected rows.

The valid rows include edge cases that must still pass: spaces around the ID and name, Arabic diacritics and tatweel in names, 29 February birthdays, governorate 88 (born abroad), and all four qualifications.

## Expected results

- **First import** into a database that doesn't contain these people: the review report matches the answer key exactly (800 / 200, or 8,000 / 2,000).
- **Import again after approving:** every valid row is rejected as already registered (`DUPLICATE_DATABASE`).
- **`IMPORT_DUPLICATE_POLICY=keep_first`** in `.env`: the first copy of each duplicate pair is accepted (810 / 190, or 8,100 / 1,900).

The two files share no national IDs, so they can be imported one after the other.

## Regenerating

The files are generated deterministically by `scripts/make_test_data.py`. It reads each finished file back through the backend's own reader and validator, and fails if any record's result differs from the answer key. Requires Windows with the 64-bit Access Database Engine and the backend virtualenv. Run from the repository root:

```powershell
backend\.venv\Scripts\python.exe scripts\make_test_data.py backend test-data\conscripts_test_1000.mdb test-data\conscripts_test_1000_expected.csv 1 20261014
backend\.venv\Scripts\python.exe scripts\make_test_data.py backend test-data\conscripts_test_10000.mdb test-data\conscripts_test_10000_expected.csv 10 20261015 test-data\conscripts_test_1000_expected.csv
```

The arguments are the backend folder, output file, answer key, scale (1 = 1,000 rows), random seed, and answer keys of earlier files whose IDs must not be reused. If the validation rules change, rerun both commands: the self-check will report any record whose expected result no longer holds.
