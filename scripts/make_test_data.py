r"""Builds a synthetic conscripts import file (same Access schema as the Armed Forces sample) plus an answer key.

All people are invented. 80% of rows follow the backend rules (app/recruits/validation.py); the other 20% break
exactly the rules listed in the answer key. The script then reads the file back through the backend's own reader
and validator, and exits 1 if any row's actual errors differ from the expected ones.

Needs Windows with the 64-bit Access Database Engine (ACE DAO + ODBC) and the backend virtualenv:

    backend\.venv\Scripts\python.exe scripts\make_test_data.py backend OUT.mdb OUT_expected.csv [SCALE] [SEED] [EXCLUDE_KEY.csv ...]

SCALE 1 = 1,000 rows, 10 = 10,000 rows. EXCLUDE_KEY files are answer keys of earlier test files whose national IDs
must not be reused, so the files can be imported one after another. See test-data/README.md for the exact commands.
"""
import csv
import os
import random
import subprocess
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
# Resolve before changing directory, so relative paths mean "relative to where the script was started".
BACKEND, OUT_MDB, OUT_KEY = (Path(arg).resolve() for arg in sys.argv[1:4])
SCALE = int(sys.argv[4]) if len(sys.argv) > 4 else 1  # 1 = 1000 rows, 10 = 10000 rows
SEED = int(sys.argv[5]) if len(sys.argv) > 5 else 20261014
EXCLUDE_KEYS = [Path(p).resolve() for p in sys.argv[6:]]  # answer keys of earlier files: never reuse their IDs
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)  # settings read ../.env relative to the backend
from app.recruits.validation import GOVERNORATES, validate_row  # noqa: E402
from app.recruits.files import iter_records  # noqa: E402

import pyodbc  # noqa: E402

rng = random.Random(SEED)

# --- reference data ------------------------------------------------------------------------------
STATIONS = {
    "01": ["مدينة نصر أول", "مدينة نصر ثان", "مصر الجديدة", "الزيتون", "شبرا", "السيدة زينب", "المعادي", "حلوان", "عين شمس", "المطرية"],
    "02": ["المنتزه أول", "المنتزه ثان", "الرمل أول", "الرمل ثان", "سيدي جابر", "محرم بك", "العطارين", "العامرية أول"],
    "03": ["الشرق", "العرب", "الضواحي", "المناخ", "الزهور"],
    "04": ["السويس", "الأربعين", "عتاقة", "فيصل"],
    "11": ["دمياط أول", "دمياط ثان", "فارسكور", "كفر سعد", "الزرقا"],
    "12": ["المنصورة أول", "المنصورة ثان", "ميت غمر", "طلخا", "السنبلاوين", "أجا"],
    "13": ["الزقازيق أول", "الزقازيق ثان", "بلبيس", "منيا القمح", "أبو حماد", "فاقوس"],
    "14": ["بنها", "شبرا الخيمة أول", "شبرا الخيمة ثان", "قليوب", "القناطر الخيرية", "طوخ"],
    "15": ["كفر الشيخ أول", "دسوق", "فوه", "بيلا", "الحامول"],
    "16": ["طنطا أول", "طنطا ثان", "المحلة الكبرى أول", "كفر الزيات", "زفتى", "السنطة"],
    "17": ["شبين الكوم", "منوف", "السادات", "أشمون", "قويسنا", "تلا"],
    "18": ["دمنهور", "كفر الدوار", "رشيد", "إيتاي البارود", "أبو حمص"],
    "19": ["الإسماعيلية أول", "الإسماعيلية ثان", "القنطرة غرب", "فايد", "التل الكبير"],
    "21": ["الدقي", "العجوزة", "الهرم", "بولاق الدكرور", "إمبابة", "أول أكتوبر", "الوراق"],
    "22": ["بني سويف", "الواسطى", "ناصر", "ببا", "الفشن"],
    "23": ["الفيوم أول", "الفيوم ثان", "سنورس", "إطسا", "طامية"],
    "24": ["المنيا أول", "ملوي", "سمالوط", "مغاغة", "بني مزار"],
    "25": ["أسيوط أول", "أسيوط ثان", "ديروط", "منفلوط", "أبنوب"],
    "26": ["سوهاج أول", "أخميم", "جرجا", "طهطا", "البلينا"],
    "27": ["قنا أول", "نجع حمادي", "قوص", "دشنا", "أبو تشت"],
    "28": ["أسوان أول", "كوم أمبو", "إدفو", "دراو"],
    "29": ["الأقصر", "إسنا", "أرمنت"],
    "31": ["الغردقة", "سفاجا", "القصير"],
    "32": ["الخارجة", "الداخلة"],
    "33": ["مرسى مطروح", "الضبعة", "سيوة"],
    "34": ["العريش", "بئر العبد"],
    "35": ["الطور", "شرم الشيخ"],
    "88": ["مكتب المصريين بالخارج"],
}
# Population-like weights so big governorates dominate.
GOV_WEIGHTS = {"01": 14, "02": 8, "21": 12, "12": 7, "13": 7, "14": 6, "16": 6, "17": 5, "18": 6, "24": 6,
               "25": 5, "26": 5, "27": 4, "15": 4, "23": 4, "22": 4, "11": 2, "03": 2, "04": 2, "19": 2,
               "28": 2, "29": 2, "31": 1, "32": 1, "33": 1, "34": 1, "35": 1}
QUALIFICATIONS = {1: "عالى", 2: "متوسط", 3: "فوق متوسط", 4: "بدون"}  # spelled as in the source file
QUAL_WEIGHTS = {1: 30, 2: 40, 3: 15, 4: 15}

MUSLIM = ["محمد", "أحمد", "محمود", "مصطفى", "عمر", "يوسف", "علي", "حسن", "حسين", "خالد", "إبراهيم", "عبد الله",
          "عبد الرحمن", "كريم", "طارق", "هاني", "سامح", "وليد", "شريف", "أيمن", "عمرو", "ياسر", "إسلام", "سيد",
          "فارس", "زياد", "مازن", "أدهم", "حمزة", "عادل", "ماجد", "نادر", "صلاح", "جمال", "رضا", "سعيد", "ممدوح",
          "ناصر", "هشام", "تامر", "عصام", "أسامة", "باسم", "شادي", "أنس", "معاذ", "عبد العزيز", "عبد الفتاح",
          "عبد الحميد", "عبد المنعم", "إسماعيل", "سليمان", "رمضان", "شعبان", "فتحي", "صبري", "منصور", "سالم"]
CHRISTIAN = ["مينا", "بيتر", "جرجس", "مايكل", "أندرو", "بيشوي", "كيرلس", "مرقص", "يوحنا", "شنودة", "حنا",
             "عادل", "سمير", "نبيل", "فادي", "رامي", "ماجد", "إسحق", "بولس", "عزيز"]
FAMILIES = ["النجار", "الشريف", "السعيد", "الشناوي", "البدري", "منصور", "سالم", "حسنين", "عثمان", "الجمال", "فرج",
            "رزق", "المصري", "الدسوقي", "البنا", "عيسى", "موسى", "زكي", "فهمي", "لطفي", "حجازي", "عبد الله",
            "إبراهيم", "الصاوي", "القاضي", "الفقي", "شحاتة", "عطية", "خليل", "يونس"]


def person_name():
    pool = CHRISTIAN if rng.random() < 0.1 else MUSLIM
    parts = rng.sample(pool, 3) + [rng.choice(FAMILIES)]
    return " ".join(parts)


def birth_date():
    start, end = date(1996, 1, 1), date(2008, 10, 14)  # 18 to 30 years old at the 2026 intake
    return start + timedelta(days=rng.randrange((end - start).days))


USED = set()
for key_file in EXCLUDE_KEYS:
    with key_file.open(encoding="utf-8-sig") as stream:
        USED.update(r["national_id"].strip() for r in csv.DictReader(stream))


def national_id(born, gov, gender_odd=True):
    """C YYMMDD GG SSS G X: century, birth date, governorate, sequence, gender (odd = male), check digit."""
    while True:
        century = "2" if born.year < 2000 else "3"
        seq = f"{rng.randrange(1000):03d}"
        gender = str(rng.choice([1, 3, 5, 7, 9] if gender_odd else [0, 2, 4, 6, 8]))
        nid = f"{century}{born:%y%m%d}{gov}{seq}{gender}{rng.randrange(10)}"
        if nid not in USED:
            USED.add(nid)
            return nid


def station(gov):
    names = STATIONS[gov]
    index = rng.randrange(len(names))
    return names[index], f"{gov}{index + 1:02d}"


def valid_row(gov=None, qual=None, born=None):
    gov = gov or rng.choices(list(GOV_WEIGHTS), weights=GOV_WEIGHTS.values())[0]
    qual = qual or rng.choices(list(QUAL_WEIGHTS), weights=QUAL_WEIGHTS.values())[0]
    born = born or birth_date()
    ps_name, ps_id = station(gov)
    return {
        "name": person_name(), "national_id": national_id(born, gov), "birth_date": born.isoformat(),
        "gov_name": GOVERNORATES[gov], "gov_id": gov, "ps_name": ps_name, "ps_id": ps_id,
        "type_id": str(qual), "type_name": QUALIFICATIONS[qual],
    }


rows = []  # (row dict, expected error codes, case description)


def add(row, codes, case):
    rows.append((row, sorted(set(codes)), case))


# --- 800 valid rows, including edge cases that must still pass -------------------------------------
for _ in range(780 * SCALE):
    add(valid_row(), [], "valid")
for _ in range(6 * SCALE):
    r = valid_row()
    r["national_id"], r["name"] = f"  {r['national_id']} ", f" {r['name']}  "
    add(r, [], "valid: spaces around national ID and name (trimmed)")
for _ in range(4 * SCALE):
    r = valid_row()
    r["name"] = f"مُحَمَّد عبـــد الرَّحمن {rng.choice(MUSLIM)} {rng.choice(FAMILIES)}"
    add(r, [], "valid: Arabic diacritics/tatweel in the name")
for born in (date(2000, 2, 29), date(2004, 2, 29), date(2008, 2, 29), date(1996, 2, 29)) * SCALE:
    add(valid_row(born=born), [], "valid: born on 29 February (leap year)")
for _ in range(2 * SCALE):
    add(valid_row(gov="88"), [], "valid: governorate 88 (born outside Egypt)")
for qual in (1, 2, 3, 4) * SCALE:
    add(valid_row(qual=qual, born=date(1996, 1, 1) + timedelta(days=rng.randrange(30))), [], "valid: oldest age band")

# --- 200 invalid rows ------------------------------------------------------------------------------
def invalid(n, case, mutate, codes):
    for i in range(n * SCALE):
        i %= n  # each variant repeated SCALE times
        r = valid_row()
        mutate(r, i)
        add(r, codes, case)


def short_or_long(r, i):
    r["national_id"] = r["national_id"][:13] if i % 2 == 0 else r["national_id"] + str(rng.randrange(10))
invalid(18, "national ID is 13 or 15 digits", short_or_long, ["ID_LENGTH"])


def not_digits(r, i):
    nid = r["national_id"]
    if i < 4:  # Arabic-Indic digits look right on screen but are not ASCII digits
        r["national_id"] = nid.translate(str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩"))
    elif i < 8:
        pos = rng.randrange(1, 12)
        r["national_id"] = nid[:pos] + "O" + nid[pos + 1:]
    else:
        pos = rng.randrange(1, 12)
        r["national_id"] = nid[:pos] + rng.choice("-/.") + nid[pos + 1:]
invalid(15, "national ID contains letters, symbols or Arabic-Indic digits", not_digits, ["ID_DIGITS"])


def bad_embedded_date(r, i):
    nid = r["national_id"]
    if i < 5:
        r["national_id"] = "1" + nid[1:]  # unsupported century digit
    elif i < 9:
        r["national_id"] = nid[:3] + "13" + nid[5:]  # month 13
    elif i < 12:
        r["national_id"] = nid[:3] + rng.choice(["0230", "0431", "0631"]) + nid[7:]  # day not in month
    else:
        r["national_id"] = "3" + rng.choice(["57", "58", "60"]) + nid[3:]  # born in the future (2057+)
invalid(15, "birth date inside the national ID is impossible or in the future", bad_embedded_date, ["ID_BIRTH_DATE"])


def bad_birth_column(r, i):
    born = date.fromisoformat(r["birth_date"])
    r["birth_date"] = [f"{born:%d/%m/%Y}", f"{born:%Y/%m/%d}", f"{born.year}-02-30", None, "غير معروف", f"{born:%d-%m-%Y}"][i % 6]
invalid(15, "birth_date column empty or not YYYY-MM-DD", bad_birth_column, ["BIRTH_DATE"])


def birth_mismatch(r, i):
    born = date.fromisoformat(r["birth_date"])
    r["birth_date"] = (born + timedelta(days=rng.choice([1, -1, 30, 365, -365]))).isoformat()
invalid(18, "birth_date column differs from the date in the national ID", birth_mismatch, ["BIRTH_MISMATCH"])


def unknown_gov(r, i):
    code = ["05", "06", "10", "20", "30", "36", "40", "77", "99", "00"][i]
    r["national_id"] = r["national_id"][:7] + code + r["national_id"][9:]
    r["gov_id"] = code
    r["gov_name"] = "محافظة غير معروفة"
    r["ps_id"] = code + r["ps_id"][2:]
invalid(10, "governorate code not in the official list", unknown_gov, ["GOV_UNKNOWN", "GOV_MISMATCH"])


def gov_mismatch(r, i):
    other = rng.choice([g for g in GOV_WEIGHTS if g != r["gov_id"]])
    r["gov_id"], r["gov_name"] = other, GOVERNORATES[other]
    r["ps_name"], r["ps_id"] = station(other)
invalid(17, "gov_id differs from the governorate in the national ID", gov_mismatch, ["GOV_MISMATCH"])


def female(r, i):
    nid = r["national_id"]
    r["national_id"] = nid[:12] + rng.choice("02468") + nid[13]
invalid(18, "13th digit is even (female national ID)", female, ["GENDER"])


def missing_field(r, i):
    if i < 5:
        r["name"] = None
    elif i < 7:
        r["name"] = "   "
    elif i < 10:
        r["ps_name"] = None
    elif i < 13:
        r["ps_id"] = None
    elif i < 16:
        r["gov_name"] = None
    else:
        r["type_name"] = None
invalid(19, "required field empty (name, police station, governorate name or qualification name)", missing_field,
        ["FIELD_REQUIRED"])


def too_long(r, i):
    if i < 2:
        r["ps_id"] = r["ps_id"] + "-" + "9" * 17  # longer than 20 characters
    else:
        r["name"] = (r["name"] + " ") * 12 + "الطويل جداً"  # longer than 200 characters
invalid(5, "field longer than allowed (police station code over 20, name over 200 characters)", too_long,
        ["FIELD_TOO_LONG"])


def bad_qualification(r, i):
    r["type_id"], r["type_name"] = [("5", "دراسات عليا"), ("0", "غير محدد"), ("9", "أخرى"), ("عالى", "عالى"),
                                    (None, "متوسط"), ("1.5", "فوق متوسط"), ("-1", "غير محدد")][i % 7]
invalid(18, "qualification ID unknown, empty or not a number", bad_qualification, ["QUALIFICATION"])

# Duplicates inside the file: both copies are rejected under IMPORT_DUPLICATE_POLICY=reject_all.
for pair in range(10 * SCALE):
    i = pair % 10
    first = valid_row()
    second = dict(first) if i < 5 else {**valid_row(), "national_id": first["national_id"]}
    if i == 9:
        second["national_id"] = f" {first['national_id']} "  # still the same ID once trimmed
    # A different person reusing an ID must still agree with that ID's birth date and governorate.
    if i >= 5:
        second.update(birth_date=first["birth_date"], gov_id=first["gov_id"], gov_name=first["gov_name"])
        second["ps_name"], second["ps_id"] = station(first["gov_id"])
    case = "national ID repeated in the file (same record sent twice)" if i < 5 else "national ID repeated in the file (different name)"
    add(first, ["DUPLICATE_FILE"], case)
    add(second, ["DUPLICATE_FILE"], case)


# Several problems at once.
def multi(case, mutate):
    r = valid_row()
    codes = mutate(r)
    add(r, codes, case)

# Only one row may have an empty ID (two empty IDs would also be duplicates of each other); the rest get unique text.
for k in range(SCALE):
    missing = None if k == 0 else f"غير متوفر {k}"
    multi("national ID missing or text, and empty name",
          lambda r, missing=missing: (r.update(national_id=missing, name=None), ["ID_LENGTH", "ID_DIGITS", "FIELD_REQUIRED"])[1])
for _ in range(3 * SCALE):
    multi("letters in national ID, empty name, unknown qualification",
          lambda r: (r.update(national_id=r["national_id"][:5] + "AB" + r["national_id"][7:], name=None, type_id="7"),
                     ["ID_DIGITS", "FIELD_REQUIRED", "QUALIFICATION"])[1])
for _ in range(3 * SCALE):
    def female_wrong_gov_and_date(r):
        other = rng.choice([g for g in GOV_WEIGHTS if g != r["gov_id"]])
        born = date.fromisoformat(r["birth_date"])
        r.update(national_id=r["national_id"][:12] + "4" + r["national_id"][13], gov_id=other, gov_name=GOVERNORATES[other],
                 birth_date=(born + timedelta(days=10)).isoformat())
        return ["GENDER", "GOV_MISMATCH", "BIRTH_MISMATCH"]
    multi("female ID, governorate and birth date both disagree with the ID", female_wrong_gov_and_date)
for _ in range(3 * SCALE):
    multi("12-digit national ID and a DD/MM/YYYY birth date",
          lambda r: (r.update(national_id=r["national_id"][:12],
                              birth_date=f"{date.fromisoformat(r['birth_date']):%d/%m/%Y}"), ["ID_LENGTH", "BIRTH_DATE"])[1])
for _ in range(2 * SCALE):
    multi("unknown governorate, female ID and missing police station",
          lambda r: (r.update(national_id=r["national_id"][:7] + "50" + r["national_id"][9:12] + "8" + r["national_id"][13],
                              gov_id="50", gov_name="غير معروفة", ps_name=None),
                     ["GOV_UNKNOWN", "GOV_MISMATCH", "GENDER", "FIELD_REQUIRED"])[1])

valid_count = sum(1 for _, codes, _ in rows if not codes)
assert len(rows) == 1000 * SCALE, len(rows)
assert valid_count == 800 * SCALE, valid_count

# Spread invalid rows through the file; the duplicate copies end up far apart.
rng.shuffle(rows)

# --- write the Access file (Jet 4 .mdb, same table and column types as the original) -------------
if OUT_MDB.exists():
    OUT_MDB.unlink()
script = ("$ErrorActionPreference='Stop'; $e=New-Object -ComObject DAO.DBEngine.120; "
          "$db=$e.CreateDatabase($env:OUT_MDB, ';LANGID=0x0409;CP=1252;COUNTRY=0', 64); $db.Close()")
subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
               env=dict(os.environ, OUT_MDB=str(OUT_MDB)), check=True, capture_output=True)
FIELDS = ["id", "name", "national_id", "birth_date", "gov_name", "gov_id", "ps_name", "ps_id", "type_id", "type_name"]
conn = pyodbc.connect("DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=" + str(OUT_MDB) + ";ReadOnly=0;", autocommit=False)
conn.execute("CREATE TABLE [person_data] ([id] INTEGER, [name] LONGTEXT, [national_id] LONGTEXT, [birth_date] TEXT(10), "
             "[gov_name] LONGTEXT, [gov_id] LONGTEXT, [ps_name] LONGTEXT, [ps_id] LONGTEXT, [type_id] LONGTEXT, [type_name] LONGTEXT)")
for number, (row, _, _) in enumerate(rows, 1):
    conn.execute("INSERT INTO [person_data] VALUES (?,?,?,?,?,?,?,?,?,?)", [number] + [row.get(f) for f in FIELDS[1:]])
conn.commit()
conn.close()

# --- answer key ------------------------------------------------------------------------------------
with OUT_KEY.open("w", encoding="utf-8-sig", newline="") as stream:
    writer = csv.writer(stream)
    writer.writerow(["id", "national_id", "name", "expected_status", "expected_errors", "case"])
    for number, (row, codes, case) in enumerate(rows, 1):
        writer.writerow([number, row.get("national_id") or "", row.get("name") or "",
                         "INVALID" if codes else "VALID", ";".join(codes), case])

# --- verify through the backend's reader and validator (same steps as the import worker) --------
records = list(iter_records(OUT_MDB))
assert len(records) == 1000 * SCALE, len(records)
counts = Counter(str(r.get("national_id") or "").strip() for r in records)
mismatches = 0
actual_counter = Counter()
for number, raw in enumerate(records, 1):
    nid = str(raw.get("national_id") or "").strip()
    _, errors = validate_row(raw, existing=set(), duplicate=counts[nid] > 1, qualification_ids={1, 2, 3, 4})
    actual = sorted({e["error_code"] for e in errors})
    expected = rows[number - 1][1]
    assert int(raw["id"]) == number
    actual_counter.update(actual or ["VALID"])
    if actual != expected:
        mismatches += 1
        print("MISMATCH row", number, "expected", expected, "actual", actual, rows[number - 1][2])
print("rows:", len(records), "| valid:", sum(1 for r in rows if not r[1]), "| invalid:", sum(1 for r in rows if r[1]))
print("outcome counts:", dict(sorted(actual_counter.items())))
print("mismatches:", mismatches)
sys.exit(1 if mismatches else 0)
