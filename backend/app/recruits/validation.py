"""Pure validation rules; official code list transcribed from the PoC specification."""
import calendar
import re
from datetime import date, datetime

GOVERNORATES = {
    "01": "القاهرة", "02": "الإسكندرية", "03": "بورسعيد", "04": "السويس",
    "11": "دمياط", "12": "الدقهلية", "13": "الشرقية", "14": "القليوبية",
    "15": "كفر الشيخ", "16": "الغربية", "17": "المنوفية", "18": "البحيرة",
    "19": "الإسماعيلية", "21": "الجيزة", "22": "بني سويف", "23": "الفيوم",
    "24": "المنيا", "25": "أسيوط", "26": "سوهاج", "27": "قنا", "28": "أسوان",
    "29": "الأقصر", "31": "البحر الأحمر", "32": "الوادي الجديد", "33": "مطروح",
    "34": "شمال سيناء", "35": "جنوب سيناء", "88": "خارج الجمهورية",
}
SERVICE_MONTHS = {1: 14, 3: 20, 2: 26, 4: 38}
FIELDS = ("id", "name", "national_id", "birth_date", "gov_name", "gov_id", "ps_name", "ps_id", "type_id", "type_name")
FIELD_LABELS = {
    "id": "رقم السجل بالمصدر", "name": "الاسم الرباعي", "national_id": "الرقم القومي",
    "birth_date": "تاريخ الميلاد", "gov_name": "اسم المحافظة", "gov_id": "كود المحافظة",
    "ps_name": "اسم قسم / مركز الشرطة", "ps_id": "كود قسم / مركز الشرطة",
    "type_id": "كود المؤهل", "type_name": "اسم المؤهل",
}
FIELD_LIMITS = {"name": 200, "ps_name": 200, "ps_id": 20, "gov_name": 100, "type_name": 100}


def readable_error(code: str, field: str, message: str, raw: dict) -> dict:
    """Clarify legacy combined errors without rewriting the stored validation history."""
    if code == "FIELD_REQUIRED" and field in FIELD_LIMITS:
        value = str(raw.get(field) or "").strip()
        if not value:
            message = "هذا الحقل مطلوب"
        elif len(value) > FIELD_LIMITS[field]:
            code = "FIELD_TOO_LONG"
            message = f"الحد الأقصى {FIELD_LIMITS[field]} حرفاً؛ القيمة تحتوي على {len(value)} حرفاً"
    if code == "SOURCE_ID_LENGTH":
        message = f"الحد الأقصى 100 حرف؛ القيمة تحتوي على {len(str(raw.get('id') or '').strip())} حرفاً"
    return {"error_code": code, "field_name": field, "error_message": message}


def normalize_name(value: str) -> str:
    return re.sub(r"[\u064b-\u065f\u0670\u0640]", "", value.translate(str.maketrans("أإآةى", "اااهي")))


def add_months(value: date, months: int) -> date:
    month = value.year * 12 + value.month - 1 + months
    year, month = divmod(month, 12)
    return date(year, month + 1, min(value.day, calendar.monthrange(year, month + 1)[1]))


def initial_start(year: int, batch: int) -> date:
    return date(year, (batch - 1) * 3 + 1, 1)


def validate_row(raw: dict, existing: set[str], duplicate: bool, qualification_ids: set[int]):
    errors = []
    def fail(code, field, message):
        errors.append({"error_code": code, "field_name": field, "error_message": message})
    def value(field):
        return str(raw.get(field) or "").strip()
    nid = value("national_id")
    if len(nid) != 14:
        fail("ID_LENGTH", "national_id", "الرقم القومي ليس 14 رقماً")
    if not re.fullmatch(r"[0-9]+", nid):
        fail("ID_DIGITS", "national_id", "الرقم القومي يحتوي على حروف أو رموز")
    born = None
    try:
        birth_value = value("birth_date")
        born = datetime.fromisoformat(birth_value).date() if "T" in birth_value or " " in birth_value else date.fromisoformat(birth_value)
    except ValueError:
        fail("BIRTH_DATE", "birth_date", "تاريخ الميلاد غير صحيح")
    gov = value("gov_id")
    if gov not in GOVERNORATES:
        fail("GOV_UNKNOWN", "gov_id", "كود المحافظة غير موجود بالقائمة الرسمية")
    if len(nid) == 14 and re.fullmatch(r"[0-9]{14}", nid):
        try:
            if nid[0] not in "23":
                raise ValueError()
            encoded = date((1900 if nid[0] == "2" else 2000) + int(nid[1:3]), int(nid[3:5]), int(nid[5:7]))
            if encoded > date.today():
                raise ValueError()
            if born is not None and encoded != born:
                fail("BIRTH_MISMATCH", "birth_date", "تاريخ الميلاد لا يطابق الرقم القومي")
        except ValueError:
            fail("ID_BIRTH_DATE", "national_id", "تاريخ الميلاد داخل الرقم القومي غير صحيح")
        if nid[7:9] not in GOVERNORATES or nid[7:9] != gov:
            fail("GOV_MISMATCH", "gov_id", "كود المحافظة لا يطابق الرقم القومي والقائمة الرسمية")
        if int(nid[12]) % 2 == 0:
            fail("GENDER", "national_id", "النوع في الرقم القومي لا يطابق (أنثى)")
    if duplicate:
        fail("DUPLICATE_FILE", "national_id", "الرقم القومي مكرر داخل الملف")
    if nid in existing:
        fail("DUPLICATE_DATABASE", "national_id", "الرقم القومي مسجل من قبل")
    for field, maximum in FIELD_LIMITS.items():
        if not value(field):
            fail("FIELD_REQUIRED", field, "هذا الحقل مطلوب")
        elif len(value(field)) > maximum:
            fail("FIELD_TOO_LONG", field, f"الحد الأقصى {maximum} حرفاً؛ القيمة تحتوي على {len(value(field))} حرفاً")
    if len(value("id")) > 100:
        fail("SOURCE_ID_LENGTH", "id", f"الحد الأقصى 100 حرف؛ القيمة تحتوي على {len(value('id'))} حرفاً")
    try:
        type_id = int(value("type_id"))
        if type_id not in SERVICE_MONTHS or type_id not in qualification_ids:
            raise ValueError()
    except ValueError:
        type_id = None
        fail("QUALIFICATION", "type_id", "المؤهل غير معروف")
    parsed = {"name": value("name"), "normalized_name": normalize_name(value("name")),
              "national_id": nid, "birth_date": born.isoformat() if born else None,
              "gov_id": gov, "ps_id": value("ps_id"), "ps_name": value("ps_name"),
              "type_id": type_id, "source_record_id": value("id") or None}
    return parsed, errors
