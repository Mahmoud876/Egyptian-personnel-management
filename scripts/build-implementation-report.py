"""Build the owner's implementation/change report; runtime facts come from verified setup results."""
from pathlib import Path
import json
from html import escape
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
facts = json.loads((ROOT / 'tmp/setup-results.json').read_text(encoding='utf-8'))
OUT = ROOT / 'output/pdf/backend-implementation-and-changes.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
NAVY = colors.HexColor('#15304A')
TEAL = colors.HexColor('#087E8B')
GRAY = colors.HexColor('#506070')
LIGHT = colors.HexColor('#EDF4F7')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleReport', fontName='Helvetica-Bold', fontSize=29, leading=34, textColor=NAVY, spaceAfter=16))
styles.add(ParagraphStyle(name='SectionReport', fontName='Helvetica-Bold', fontSize=20, leading=25, textColor=NAVY, spaceAfter=14))
styles.add(ParagraphStyle(name='SubReport', fontName='Helvetica-Bold', fontSize=11.5, leading=15, textColor=TEAL, spaceBefore=9, spaceAfter=4))
styles.add(ParagraphStyle(name='BodyReport', fontName='Helvetica', fontSize=10, leading=14, textColor=NAVY, spaceAfter=8))
styles.add(ParagraphStyle(name='SmallReport', fontName='Helvetica', fontSize=8.5, leading=11.5, textColor=GRAY, spaceAfter=6))
styles.add(ParagraphStyle(name='CellReport', fontName='Helvetica', fontSize=9, leading=12, textColor=NAVY))
styles.add(ParagraphStyle(name='HeadReport', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=colors.white))
story = []
def p(text, style='BodyReport'):
    return Paragraph(text, styles[style])
def para(text): story.append(p(text))
def heading(number, title):
    story.append(p(f'{number:02d} / {title}', 'SectionReport'))
def item(title, body):
    story.append(KeepTogether([p(title, 'SubReport'), p(body)]))
def table(headers, rows, widths):
    values = [[p(escape(h), 'HeadReport') for h in headers]]
    values += [[p(str(cell), 'CellReport') for cell in row] for row in rows]
    t = Table(values, colWidths=widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),NAVY), ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),
        ('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('LINEBELOW',(0,-1),(-1,-1),.5,colors.HexColor('#D6E2E9'))]))
    story.append(t)
def nextpage(): story.append(PageBreak())

story.append(p('PERSONNEL SYSTEMS / CONSCRIPTS PoC', 'SubReport'))
story.append(Spacer(1,13))
story.append(p('Backend implementation<br/>and change report', 'TitleReport'))
para('Prepared for the system owner | 14 October 2026')
para('<b>Direct answer:</b> I implemented the conscripts backend using your Markdown specification. I changed the earlier application design where it conflicted with that specification. I also made several explicit implementation choices and schema adaptations. This report identifies those differences and explains the replacement in each case.')
table(['Current result', 'Verified state'], [
    ['Local system', escape(facts['system_status'])],
    ['Application', escape(facts['app_url'])],
    ['API health and documentation', escape(facts['health_url'])+'<br/>'+escape(facts['docs_url'])],
    ['Backend / frontend checks', escape(facts['test_summary'])],
    ['User interface coverage', 'Existing login, administration and audit UI runs. Dedicated conscript import, completion, search and label screens remain placeholders. The new workflow is available through the API.'],
], [133,366])
item('Rules retained from your MD', 'The four batches, official governorate codes, national-ID checks, approval/cancellation workflow, police-number-plus-year uniqueness, qualification durations, locking, Redis sessions, RBAC, SQL Server, RQ and SSE remain the core design.')
item('Your original requirements were preserved', 'The supplied MD and PDF were read, not rewritten. The PDF carries the same requirements; its wide sample table is clipped in the export. The Markdown is treated as the governing version.')
para('<b>How to read this report:</b> pages 2-3 explain delivered behavior and corrections to the old design; pages 4-5 list differences and additions; page 6 names remaining gaps; pages 7-8 document setup, evidence and operation.')

nextpage(); heading(2, 'What the backend now does')
para('The following is API/backend coverage. A working endpoint does not imply that its final user-facing screen has been implemented.')
table(['MD requirement', 'Delivered behavior'], [
    ['FR-1 to FR-4', 'Uploads XLSX, CSV, XLS and ACCDB; captures batch and year; validates national-ID structure, birth date, gender, official governorate and duplicates.'],
    ['FR-5 / FR-6', 'Staged valid and invalid groups with per-row reasons. Administrator approval inserts valid rows atomically; cancellation inserts none. Database uniqueness is checked again at approval.'],
    ['FR-7 to FR-9', 'Asynchronous rejected-row export to genuine XLSX or ACCDB, including source values and rejection reasons; protected download endpoints.'],
    ['FR-10 to FR-14', 'Administrator audit access, timestamps, actor identity, before/after values, text search and date/time filters. Existing audit screen remains available; global text search is API-only.'],
    ['FR-15 to FR-18', 'National-ID lookup, police-number entry, police-number/year uniqueness, suggested dates and explicit date submission. A start-date edit never silently rewrites the end date.'],
    ['FR-19 / FR-20', 'Exact service durations: type 1 = 14 months; type 3 = 20; type 2 = 26; type 4 = 38. Missing or inconsistent dates are rejected.'],
    ['FR-21: locking', 'Successful completion atomically locks the profile. Further changes require administrator permission. Revision checks prevent stale updates.'],
    ['FR-21 to FR-24: retrieval/labels', 'Search by national ID, barcode, normalized name, or police number plus year. Printable Code 128 label includes supplied full name, police number and enlistment year.'],
    ['FR-25 + processing diagrams', 'RQ background execution, Redis Pub/Sub, SSE snapshots, SQL counters, 250-row checkpoints and bounded retry/recovery. Parsing-stage granularity is explained on page 6.'],
    ['FR-26 to FR-30', 'Redis-backed secure-cookie sessions, fixed administrator/operator roles, administrator account lifecycle, logout, expiry and session invalidation.'],
    ['ERD and database constraints', 'New import/staging/error/recruit/export/document structures, foreign keys, unique indexes, SQL rowversion and validation constraints. Schema adaptations are listed on page 4.'],
], [130,369])
story.append(Spacer(1,10))
para('The MD repeats FR-3 and FR-21. References above use their descriptive meaning so neither duplicated item is omitted.')

nextpage(); heading(3, 'Corrections to the earlier system')
para('These changes bring the old code into line with your new MD. They are not departures from your new requirements.')
item('1. SQL session rows replaced by Redis sessions', '<b>Before:</b> cookie sessions were stored in the SQL user_session table. <b>Now:</b> Redis stores session state under hashed cookie-token keys, with idle and absolute expiry. <b>Why:</b> FR-26 explicitly requires Redis. Old SQL session rows no longer authenticate users.')
item('2. Direct permission assignment replaced by fixed roles', '<b>Before:</b> administrators assigned arbitrary per-user permissions and copied editable permission templates. <b>Now:</b> each account has a system_administrator or data_entry_operator role; permission constants determine access. <b>Why:</b> FR-27 to FR-29 require RBAC and administrator-controlled role assignment.')
item('3. Permission-template UI and API retired', 'The user-management screen now selects a role and displays derived permissions. Direct grant changes are rejected; template routes and menu entries were removed. Historical tables remain for compatibility, but they no longer grant access.')
item('4. Skeleton-only module behavior replaced by functioning APIs', 'The old plan deliberately left conscript workflows unimplemented. The new recruits module implements upload, processing, review, approval, export, completion, search and labels. The earlier skeleton-only instructions were marked as superseded after your explicit request to build the backend.')
item('5. Validation and dates follow the supplied rules', 'A separate official governorate reference was added from the MD, keeping old lookup data intact. Qualification IDs use the precise 14/20/26/38-month mapping. Both dates must be explicitly supplied; SQL constraints and a trigger reinforce important rules.')
item('6. Background work and progress became operational', 'The setup now runs Redis and a separate RQ worker alongside the API. SQL-backed recovery and progress checkpoints replace synchronous or placeholder processing. Exports are generated by workers and downloaded through authenticated endpoints.')
item('7. Documentation and generated client types updated', 'README, project instructions, permissions, dependency licences and setup scripts were updated. A backend guide and regenerated OpenAPI TypeScript definitions describe the actual endpoints. Historical documents are clearly identified.')

item('Additional fix discovered during startup', 'A real job exposed POSIX process calls and path quoting problems in RQ 2.12 SpawnWorker on Windows. Added a Windows subprocess worker adapter and internal job_child entry point. RQ, Redis and SQL checkpoints remain unchanged; jobs still run in isolated child processes with timeout supervision. A regression test now exercises real import and export child processes.')

nextpage(); heading(4, 'Intentional differences from the MD')
para('The business workflow follows the MD, but the physical schema and queue delivery are not a literal copy of every diagram.')
table(['MD / diagram', 'What was used instead, and why'], [
    ['UUID user IDs', 'Existing app_user IDs remain integers, including related actor/uploader/completer foreign keys. New business records and jobs use UUIDs. This preserves the established core and its references. A full UUID user migration was not performed.'],
    ['Separate parsed_* staging columns', 'Most parsed values are stored in parsed_data_json; normalized national ID and parsed_type_id remain explicit columns, with the qualification foreign key. This keeps normalized staging data together, but it changes the draft ERD shape.'],
    ['Integer source_record_id', 'Stored as nullable text up to 100 characters. This retains source identifiers with leading zeroes or nonnumeric content; it does not reinterpret them as database identities.'],
    ['New USERS / AUDIT_LOGS structures', 'Existing app_user and audit_log are extended/reused. Audit entity_id remains a string so it can reference integer core objects and UUID business objects. National ID/entity references are searchable in recorded before/after JSON rather than a new dedicated entity_reference column.'],
    ['Plural table names and mixed text types', 'Uses repository-style singular snake_case names and generally NVARCHAR for text. Batch is INT with a 1-4 check rather than TINYINT. New business timestamps use DATETIME2(3). These are storage conventions, not changed batch/date rules.'],
    ['Enqueue acknowledged before HTTP 202', 'The API commits a QUEUED SQL job and returns 202. A dispatcher delivers it to RQ, normally within 30 seconds. This prevents an accepted upload being lost if enqueue fails, but introduces a possible dispatch delay.'],
    ['Native rowversion in the ERD', 'Native SQL rowversion is retained, with an additional integer revision exposed to clients. Administrator updates must supply the current revision; row locks and unique constraints protect concurrent writes.'],
], [134,365])
story.append(Spacer(1,9))
para('Legacy conscript, import, template and session tables were preserved. The new workflow writes to recruit and the new staging tables. No automatic transfer of legacy conscript rows was implemented.')

nextpage(); heading(5, 'Clarifications and added behavior')
table(['Decision / addition', 'Reason and effect'], [
    ['Complete role permissions', 'The short role table omits profile:insert and account-management codes even though FR-16/18/28/29 require them. Both roles can complete profiles; only administrators manage users. Existing administrator lookup maintenance is retained.'],
    ['Within-file duplicate policy', 'The MD mandates database deduplication but does not choose a policy for repeated IDs within one file. Default: reject all occurrences. Optional keep_first mode retains the first. Policy is captured per import.'],
    ['Male-only validation', 'The implementation rejects an even gender digit, consistent with the earlier conscript rules. The new MD defines gender encoding but does not separately state a permitted gender. Its sample has an even digit, so that sample is rejected. This is an interpretation requiring owner confirmation if women should be eligible.'],
    ['Bounds and input conventions', 'Added 50 MiB upload / 100,000-row defaults, enlistment years 2000-2100, field length limits, UTF-8 CSV, required named headers and a selected first worksheet. These constraints make parsing predictable; the MD does not specify these bounds.'],
    ['Barcode format and label dimensions', 'Retained the existing 12-digit year + batch + sequence barcode; prints Code 128 on 50 x 25 mm. The MD requires a scannable label and its contents, but does not specify the encoding or physical dimensions.'],
    ['Additional legacy format', 'MDB input remains accepted as well as the four required formats, because the original sample is MDB. It does not replace ACCDB support.'],
    ['Files and document handling', 'Private randomized storage names, SHA-256 checks and protected download paths were added. Document APIs implement the ERD relationship; current uploads accept PDF/PNG/JPG/JPEG and download as attachments.'],
    ['Recovery and session safeguards', 'Added job heartbeats, a SQL dispatch record, application locks, bounded pre-start failures, and SQL account session versions. These support reliable recovery and immediate account revocation.'],
    ['Safe preservation during export', 'Formula-like Excel source strings stay literal. A source rejection_reasons field is renamed to an unused source-prefixed name before adding the actual rejection column. Overlong Excel cells fail explicitly instead of silently truncating data.'],
], [137,362])
story.append(Spacer(1,8))
para('No minimum recruit age or national-ID checksum algorithm was invented. End-of-month arithmetic uses calendar clamping; changing dates must still satisfy the required qualification duration.')

nextpage(); heading(6, 'Remaining gaps and practical limits')
para('<b>The backend is implemented; the entire MD-defined application is not yet complete at the screen level.</b> These limits are stated explicitly so the report does not overclaim delivery.')
item('Conscript workflow screens are still placeholders', 'Upload/review, live progress, completion, unified search and label navigation do not yet have their final React screens. Their APIs are implemented. The current application provides the existing login and administration shell; API documentation can be used to exercise the backend.')
item('Audit global search is not yet wired into the screen', 'GET /audit supports the q parameter and date/time ranges. The existing audit page exposes its previous filters, but no global q search box. Its dates are day-oriented, while the API accepts timestamps. Some newer action/entity names may appear as code labels until UI translations are added.')
item('Parsing progress is coarser than a literal reading of FR-25', 'The worker publishes PARSING status, reads the bounded file, then knows total_rows. Processed/valid/invalid counters advance during 250-row validation commits. There is no row-by-row parsing progress before the initial read completes. On restart the source is reparsed, then validation resumes from its SQL checkpoint.')
item('Administrator correction has a defined field scope', 'The current PATCH accepts name, police number and both dates with a required revision. It does not expose corrections to imported national ID, birth date, governorate, station, qualification, batch or year. Those broader correction rules were not specified in detail and remain to be designed if required.')
item('Names and source data need business review', 'The label prints the supplied full name; validation does not enforce exactly four whitespace-separated tokens, because compound names make that unreliable. Governorate and qualification codes govern validation; the source display names are not independently reconciled to every reference name. Access source IDs should be unique for stable ordering.')
item('A duplicate conflict at approval requires a new review cycle', 'Approval returns 409 and leaves the staged report intact if a national ID became occupied after validation. There is no separate revalidation endpoint; the administrator must cancel and upload again to generate a fresh report.')
item('Deployment and large-volume behavior are not certified', 'The setup is for this local development PC. Production still needs supervised services, HTTPS, backup/retention policies, access-controlled shared storage and an offline deployment package. Parsing is bounded but in memory. No load test or physical label-printer/scanner acceptance test was performed.')
para('Access processing depends on the Microsoft engine on a Windows worker. XLS uses xlrd; the automated evidence includes CSV/XLSX and native ACCDB, but not a dedicated XLS end-to-end fixture.')

nextpage(); heading(7, 'Setup completed and verification')
table(['Component', 'Action / result'], [
    ['ODBC Driver 18', escape(facts['odbc'])],
    ['Python environment', escape(facts['python'])],
    ['Application dependencies', escape(facts['dependencies'])],
    ['SQL Server and Redis', escape(facts['services'])],
    ['Database migration', escape(facts['migration'])],
    ['API / frontend / worker', escape(facts['processes'])],
    ['Verification', escape(facts['test_summary'])],
], [140,359])
item('What was checked', escape(facts['verification_detail']))
item('Authentication and first sign-in', escape(facts['account']))
item('Local security settings', 'The application uses ODBC 18 with database encryption enabled. The development SQL container uses the existing TrustServerCertificate setting for its local certificate. Local HTTP uses SESSION_COOKIE_SECURE=false; production requires HTTPS and Secure cookies. No legacy-driver adapter is needed for the current setup.')
item('Installer provenance', 'The Python installer was downloaded from python.org and its Python Software Foundation signature verified. The ODBC installer has a valid Microsoft signature. Access engine, Node.js and Docker Desktop were already present. Application package versions are pinned in the repository.')

nextpage(); heading(8, 'Run instructions and audit trail')
item('Open the system', escape(facts['app_url'])+'<br/>API health: '+escape(facts['health_url'])+'<br/>API documentation: '+escape(facts['docs_url']))
item('Start again after closing or restarting Windows', 'Open PowerShell in D:\\Mirando\\new work and run:<br/><font face="Courier" size="9">powershell -ExecutionPolicy Bypass -File scripts\\dev.ps1</font><br/>The script starts containers, applies idempotent database scripts and launches background application processes. Docker Desktop must be running.')
item('Logs and stopping', 'Application logs and process IDs are in storage/logs. The startup script prints exact taskkill commands for the launched process trees. Stop database services with:<br/><font face="Courier" size="9">docker compose -f docker-compose.dev.yml stop</font><br/>Persistent volumes remain. Do not remove volumes when you intend to retain data.')
table(['Location', 'Purpose'], [
    ['backend/app/recruits/', 'Import/export files, RQ jobs, validation, profile workflows, search, labels and attachments.'],
    ['backend/app/core/ + admin/', 'Redis sessions, role-derived authorization, user lifecycle and audit search.'],
    ['backend/sql/009_poc_backend.sql', 'Additive/idempotent PoC migration, references, constraints, indexes and trigger.'],
    ['scripts/ + docker-compose.dev.yml', 'Setup, database initialization, application/worker startup and local services.'],
    ['docs/backend-poc.md', 'API guide, rules, migration choices and operating instructions.'],
    ['backend/tests/ + unit_tests/', 'Regression, rule and workflow checks with synthetic test data.'],
], [186,313])
story.append(Spacer(1,11))
story.append(p('<b>Requirements source:</b> PoC 3f98b04e77e080368063da1908126936.md; accompanying 12-page PoC PDF. MD SHA-256:<br/>591b369a7684400bf1f1cd24815f8fcc8959a5a1f5b6881a5d56ba0b10c34f52', 'SmallReport'))
story.append(p('Official setup references: <link href="https://www.python.org/downloads/release/python-31210/" color="#087E8B">Python 3.12.10 release</link>; <link href="https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server" color="#087E8B">Microsoft ODBC Driver downloads</link>. Implementation findings were checked against the local source code, migrations, tests and running services on the report date.', 'SmallReport'))

def decorate(canvas, doc):
    canvas.saveState()
    w,h=A4
    canvas.setFillColor(TEAL); canvas.rect(0,h-8,w,8,fill=1,stroke=0)
    canvas.setFont('Helvetica',8); canvas.setFillColor(GRAY)
    canvas.drawString(48,h-29,'MIRANDO / CONSCRIPTS BACKEND')
    canvas.drawRightString(w-48,h-29,'IMPLEMENTATION RECORD - 14 OCT 2026')
    canvas.setStrokeColor(colors.HexColor('#D6E2E9')); canvas.line(48,43,w-48,43)
    canvas.drawString(48,29,'Local development delivery | No credentials included')
    canvas.drawRightString(w-48,29,f'{doc.page}')
    canvas.restoreState()

doc=SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=55,bottomMargin=58,
                      title='Conscripts backend - implementation and changes',author='Codex',subject='Delivery, deviations from the owner specification, setup and verification')
doc.build(story,onFirstPage=decorate,onLaterPages=decorate)
print(OUT)
