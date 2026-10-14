> **Historical document:** The owner's newer PoC Markdown now governs the conscripts backend. See [backend-poc.md](backend-poc.md) for implemented workflows, Redis sessions, RBAC, migration and operating instructions. Conflicting skeleton-era rules below are superseded.

# Business rules

Source: `مجندين.docx`, `العاملين المدنيين POC.pdf`, and an analysis of `Person_data_S.mdb`. Every rule is enforced in the API (Pydantic / service) **and** in SQL Server where a constraint can express it.

## Conscripts

### Input file
`Person_data_S.mdb`, table `person_data`, 100 rows:

| Column | Meaning |
| --- | --- |
| `id` | Row number in the source file |
| `name` | Four-part Arabic name |
| `national_id` | 14-digit Egyptian national ID (stored as text) |
| `birth_date` | `YYYY-MM-DD` text |
| `gov_name`, `gov_id` | Governorate name and 2-digit code |
| `ps_name`, `ps_id` | Police station (قسم / مركز) name and 4-digit code; first 2 digits = `gov_id` |
| `type_id`, `type_name` | Qualification: 1 عالى, 2 متوسط, 3 فوق متوسط, 4 بدون |

`ps_id` is a police **station**. It is not the conscript's "police number" (رقم الشرطة), which data entry types in later.

### Upload
1. Admin uploads the file and picks **batch (1–4)** and **conscription year**.
2. Start date from batch: 1 → 1 Jan, 2 → 1 Apr, 3 → 1 Jul, 4 → 1 Oct of the conscription year. Stored in `batch_schedule(batch_no, start_month, start_day)`.
3. Rows go to staging (`import_batch`, `import_row`) exactly as received.
4. Validation runs on every row and keeps **all** failing reasons, not just the first.
5. Admin sees the report: valid count, rejected rows with reasons. Then **approve** (insert valid rows into `conscript` with status `received`) or **cancel** (nothing inserted, batch status `cancelled`).
6. Rejected rows can be exported to Excel or Access with a reason column.

### National ID structure
| Digits | Meaning |
| --- | --- |
| 1 | Century: `2` = 1900s, `3` = 2000s |
| 2–7 | Birth date `YYMMDD` |
| 8–9 | Governorate code |
| 10–13 | Serial; digit 13 odd = male, even = female |
| 14 | Check digit (no public algorithm; do not validate) |

### Validation rules (upload)
| # | Rule | Rejection reason (Arabic, shown to user) |
| --- | --- | --- |
| R1 | Exactly 14 characters | الرقم القومي ليس 14 رقماً |
| R2 | Digits only | الرقم القومي يحتوي على حروف أو رموز |
| R3 | Century digit is 2 or 3 and digits 2–7 form a real date | تاريخ الميلاد داخل الرقم القومي غير صحيح |
| R4 | Birth date in ID equals `birth_date` | تاريخ الميلاد لا يطابق الرقم القومي |
| R5 | Digits 8–9 equal `gov_id` of the same row | كود المحافظة لا يطابق الرقم القومي |
| R6 | Digit 13 is odd (conscripts are male) | النوع في الرقم القومي لا يطابق (أنثى) |
| R7 | ID appears only once in the file | الرقم القومي مكرر داخل الملف |
| R8 | ID not already in `conscript` | الرقم القومي مسجل من قبل |
| R9 | Name, governorate, police station and qualification present and known | بيانات ناقصة أو غير معروفة |

R3–R6 only run when R1 and R2 pass.

**Expected result on the sample:** 16 of 100 rows rejected (ids 1, 2, 9, 27, 30, 36, 40, 59, 67, 68, 79, 83, 87, 88, 93, 97), 84 valid, assuming both copies of the in-file duplicate (87, 88) are rejected. Use this as a test fixture.

Open questions (do not hard-code an answer; make it configurable or leave a TODO):
- R5: the file's governorate codes are its own list (Giza = 03, Sharqia = 12), not the official ID codes. Current assumption: compare to `gov_id` in the same row.
- R7: reject both copies, or keep the first?
- 15 people in the sample were born 2008–2009 (under 18). No age rule in the spec yet.

### Data entry
- Look up a received conscript by national ID.
- Enter **police number** (رقم الشرطة).
- Start date pre-filled from the batch (editable). End date = start date + service length by qualification (editable):

| `type_id` | Qualification | Service length |
| --- | --- | --- |
| 1 | عالى | 1 year 2 months (14 months) |
| 3 | فوق متوسط | 1 year 8 months (20 months) |
| 2 | متوسط | 2 years 2 months (26 months) |
| 4 | بدون | 3 years 2 months (38 months) |

Stored as `qualification.service_months`.
- `UNIQUE (police_no, conscription_year)`. Reason: رقم الشرطة مسجل لنفس سنة التجنيد.
- `CHECK (end_date > start_date)`.
- On save the record is locked (`locked_at`); after that only `conscripts.edit_locked` can change it.

### Search and labels
- Search by national ID, police number + year, barcode, or name. Name search uses a normalised column: أ إ آ → ا, ة → ه, ى → ي, remove tatweel and diacritics.
- Label (spec): barcode, four-part name, police number and conscription year. See [Barcode](#barcode).

### Barcode
The spec says each conscript gets a barcode after data entry ("يلي تلك المرحلة تسجيل بيانات التجنيد لكل شخص، وانشاء الباركود الخاص بكل مجند") and lists what the label shows, but not what the barcode encodes. **Proposed (to confirm with the client):**

| Item | Rule |
| --- | --- |
| Value | 12 digits: conscription year (4) + batch (1) + sequence (7), e.g. `202630001234` |
| Sequence | `dbo.conscript_barcode_seq` (SQL Server `SEQUENCE`): unique under concurrency, never reused (`NO CYCLE`); gaps are harmless |
| When | Assigned when data entry saves the record (status `registered`), in the same transaction: `app/modules/conscripts/barcode.py: assign_barcode()` |
| Stability | Never changes once assigned (trigger `TR_conscript_barcode_immutable`). Correcting the police number, year or name later does not change it; reprints reuse it |
| DB rules | `CK_conscript_barcode_format` (12 digits, year 2xxx, batch 1–4), `UQ_conscript_barcode`, `CK_conscript_registered` requires a barcode |
| Symbology | Code 128, subset C (two digits per symbol, the most compact form) |
| Print size | Narrowest bar 0.25 mm (2 dots on a 203 dpi label printer), 10-module quiet zone each side: ~30 mm wide, fits a 50 × 25 mm label. Digits printed under the bars |
| Scanning | USB scanners act as keyboards (send the digits + Enter). Digits only, so it works with the Windows Arabic keyboard layout too |

Why not the national ID or the police number: the national ID would put personal data on every label, and both can be corrected after printing, which would break printed labels.

Open: the client's label printer model and label size (layout currently targets 50 × 25 mm).

## Civilian employees (outline, details come later)

Required by the PoC spec:
- Migrate representative data from **Oracle 11g** (simulated) to SQL Server, linked to a **simulated electronic archive**; also import Excel and Access files.
- Field and relationship mapping model (source → target) delivered as a document.
- Preserve Arabic text, dates and foreign keys.
- Report of accepted and rejected records with reasons.
- Reconcile counts, values, relationships and attachments against expected results.
- Re-run without creating duplicates (MERGE on `source_key`). Roll back a run (delete by `migration_batch_id`).
- Create, edit, delete employees; create a job action and attach its decision.
- Complex search, then build and export a new report.
- Restricted account trying a forbidden action is refused (and audited). Audit log viewer.
- Backup and restore of the database **and** attachments, plus a failure test.
- Test dataset we must generate (no real personal data): 1,000 employees, 3,000 job actions, 2,000 archive documents, 10 work entities, 10 user accounts, including Arabic data, incomplete and duplicate records, invalid dates and unlinked documents.
- Acceptance: 100% of valid data matches; every other record listed with a clear reason; no document lost and no wrong link left undetected.

## Lookups (seed from the sample file)

### Governorates (`governorate`)
| code | name |
| --- | --- |
| 01 | القاهرة |
| 02 | الإسكندرية |
| 03 | الجيزة |
| 11 | الدقهلية |
| 12 | الشرقية |
| 13 | القليوبية |
| 14 | الغربية |
| 15 | المنوفية |
| 16 | البحيرة |
| 21 | المنيا |
| 22 | أسيوط |
| 23 | سوهاج |

### Police stations (`police_station`)
| code | name | governorate |
| --- | --- | --- |
| 0101 | منشأة ناصر | 01 |
| 0201 | منتزه أول | 02 |
| 0202 | منتزه ثان | 02 |
| 0203 | رمل أول | 02 |
| 0301 | الدقي | 03 |
| 0303 | العجوزة | 03 |
| 1101 | المنصورة | 11 |
| 1201 | زقازيق | 12 |
| 1202 | بلبيس | 12 |
| 1203 | منيا القمح | 12 |
| 1301 | بنها | 13 |
| 1302 | شبرا الخيمة | 13 |
| 1303 | قليوب | 13 |
| 1401 | طنطا | 14 |
| 1402 | محلة الكبرى | 14 |
| 1501 | شبين الكوم | 15 |
| 1502 | منوف | 15 |
| 1503 | أشمون | 15 |
| 1601 | دمنهور | 16 |
| 1602 | كفر الدوار | 16 |
| 1603 | رشيد | 16 |
| 2101 | المنيا | 21 |
| 2201 | أسيوط | 22 |
| 2301 | سوهاج | 23 |

### Qualifications (`qualification`)
| type_id | name | service_months |
| --- | --- | --- |
| 1 | عالى | 14 |
| 2 | متوسط | 26 |
| 3 | فوق متوسط | 20 |
| 4 | بدون | 38 |

### Batch schedule (`batch_schedule`)
| batch_no | start_month | start_day |
| --- | --- | --- |
| 1 | 1 | 1 |
| 2 | 4 | 1 |
| 3 | 7 | 1 |
| 4 | 10 | 1 |
