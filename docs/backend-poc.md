# Conscripts backend: implemented PoC

The owner's `PoC 3f98b04e77e080368063da1908126936.md` is the current backend specification. The accompanying PDF contains the same requirements. It supersedes the original skeleton-only plan and direct-permission design. Civilian employee workflows remain outside this change.

## Architecture and workflow

FastAPI handles authentication, private uploads, reports, approval and recruit records. SQL Server is authoritative for staging, progress, decisions, recruits and audit. Redis stores sessions, RQ messages and progress notifications. A separate Python RQ worker parses and validates files and produces exports. API and workers must share the same persistent `STORAGE_ROOT`.

1. An administrator uploads `.xlsx`, `.xls`, UTF-8 `.csv` or `.accdb`, choosing batch 1–4 and year. Legacy `.mdb` is also accepted. The API saves the file, its SHA-256 and a `QUEUED` SQL job, returning HTTP 202.
2. The worker dispatcher delivers committed jobs to RQ. A Redis outage during delivery does not discard the SQL job. Dispatch is retried every `RECOVERY_INTERVAL_SECONDS` (default 30).
3. Parsing checks the file structure. Validation checks every row and records all rejection reasons. Each 250-row transaction commits staged records, errors, counters and checkpoint together. SSE uses Redis Pub/Sub with fresh SQL snapshots; reconnecting clients receive current state.
4. `READY_FOR_REVIEW` exposes separate valid/invalid groups. Approval atomically inserts valid recruits only; cancellation inserts none. Approval rechecks database duplicates, so competing imports cannot insert the same national ID. A conflict returns 409 and leaves the job reviewable.

   Subsequent revalidation keeps `/imports/{id}/rows` and `/report` readable for administrators while queued, parsing, validating or failed (`validation_run > 0`). These staged classifications/errors are provisional, not a completed validation result. Consumers must inspect the job status; correction, approval and export still require `READY_FOR_REVIEW`. The frontend keeps the table visible and marks it read-only during this interval.
5. Invalid rows can be exported asynchronously to real `.xlsx` or `.accdb` files with original values and `rejection_reasons`. A source field of that name is preserved under an unused `source_...rejection_reasons` name. Excel formula-like source strings remain literal text.
6. An operator retrieves an approved recruit, supplies police number and both enlistment dates, then completes the profile. This locks the record and allocates an immutable barcode. Only administrators may subsequently correct the name, police number or dates; they must supply the current revision.
7. Users can search by national ID, barcode, name or police number plus year and retrieve a printable Code 128 label containing name, police number and year.

Imports transition through `QUEUED → PARSING → VALIDATING → READY_FOR_REVIEW → APPROVED | CANCELLED`. Unrecoverable errors or exhausted retries become `FAILED`. Exports use `QUEUED → PROCESSING → COMPLETED | FAILED`. SQL application locks prevent concurrent execution of the same job, including across checkpoint commits. Restart resumes after the last committed checkpoint; the immutable source file is reparsed to restore deterministic row numbering. RQ deliveries and pre-start failures are bounded by `JOB_MAX_ATTEMPTS` (default 3).

## Validation and dates

Required headers: `id,name,national_id,birth_date,gov_name,gov_id,ps_name,ps_id,type_id,type_name`. Header order is flexible; duplicates or missing headers reject the file. Additional columns are retained. Access reads `person_data` ordered by `id` (configure `ACCESS_TABLE` if needed). Source IDs should be unique to ensure stable Access ordering. XLSX/XLS read the first active/first worksheet respectively. Keep national IDs and codes as text in spreadsheets to preserve leading zeroes.

National IDs must contain exactly 14 ASCII digits, a supported century (2 or 3), a valid nonfuture embedded birth date, a governorate from the specification and an odd gender digit. The explicit birth date and governorate must agree with the ID. Existing national IDs and invalid qualification IDs are rejected. Required names/station data and field lengths are validated. No minimum enlistment age or checksum rule was invented.

The default within-file duplicate policy rejects every occurrence; `IMPORT_DUPLICATE_POLICY=keep_first` retains the first occurrence instead. The policy is captured on each import job. This choice is explicit because the specification mandates database deduplication but does not choose a within-file policy.

| Qualification ID | Qualification | Exact duration |
| --- | --- | --- |
| 1 | Higher | 14 months |
| 3 | Above-average | 20 months |
| 2 | Intermediate | 26 months |
| 4 | None | 38 months |

Batch 1/2/3/4 suggests January/April/July/October 1 of the selected year. Read responses include suggested dates; imported recruits remain incomplete until explicitly saved. Changing a start date never silently rewrites the end date. Both submitted dates must satisfy the exact duration, with calendar month-end clamping. SQL constraints and a trigger also enforce the duration and immutable barcode. Police number plus year has a unique filtered index. These qualification IDs are fixed contract identifiers; new lookup entries do not acquire an enlistment duration automatically.

The example national ID in the requirements has an even gender digit and will therefore be rejected by the specified male-only rule. It was not treated as an exception.

## API guide

All paths below have prefix `/api/v1`. Interactive request/response documentation is available at `/docs` in development; generated TypeScript types are in `frontend/src/shared/api/schema.d.ts`.

| Method/path | Purpose |
| --- | --- |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Cookie sessions and current role/permissions |
| `POST /imports` | Multipart `file`, `batch_number`, `enlistment_year`; returns job with 202 |
| `GET /imports`, `GET /imports/{id}` | Paginated history / current progress; repeat `status` to filter history and get exact total counts |
| `GET /lookups/official-governorates` | Official national-ID governorate codes and Arabic names; available to both roles |
| `GET /imports/{id}/events` | Cookie-authenticated SSE: `progress`, `unauthorized`, `reconnect` events |
| `GET /imports/{id}/report` | Summary plus independently paginated valid/invalid groups |
| `GET /imports/{id}/rows?status=INVALID` | Paginated raw rows and structured errors |
| `POST /imports/{id}/approve` or `/cancel` | Final review decision |
| `PATCH /imports/{id}/rows/{row_id}` | Administrator correction of named source fields, with inspected `version`; preserves original values and queues full revalidation |
| `POST /imports/{id}/revalidate` | Recheck all staged rows against current duplicates/rules; `version` required; supports retry of failed revalidation |
| `POST /imports/{id}/exports` | JSON `{"format":"xlsx"}` or `{"format":"accdb"}`; returns 202 |
| `GET /exports/{id}`, `GET /exports/{id}/download` | Export state and protected download |
| `GET /recruits` | `search`, `national_id`, `barcode`, `name`, or `police_number` + `enlistment_year` |
| `GET /recruits/by-national-id/{national_id}` | Operator lookup |
| `GET /recruits/{id}` | Full profile and suggested dates |
| `POST /recruits/{id}/complete` | Required police number, start and end dates; optional revision |
| `PATCH /recruits/{id}` | Administrator correction; same required fields, required revision, optional name |
| `GET /recruits/{id}/barcode` | Printable HTML/SVG label, 50 × 25 mm |
| `POST/GET /recruits/{id}/documents` | Administrator attachment upload / authenticated list |
| `GET /recruits/{id}/documents/{document_id}/download` | Download linked attachment |
| `GET /audit` | Administrator audit search `q` plus existing date/action/entity filters |
| `GET /roles`, `/users` administration endpoints | Fixed roles and account lifecycle |
| `GET /health` | SQL Server and Redis health; 503 if either is unavailable |

Example completion body: `{"police_number":"12345","enlistment_start_date":"2026-01-01","enlistment_end_date":"2027-03-01"}` for qualification 1. For a later correction, include the latest returned `revision`.

## Authentication, authorization and audit

Users have exactly one role: `system_administrator` or `data_entry_operator`. Permissions derive from `app/core/roles.py`; direct user grants and editable templates are retired. Administrators import/review/export, manage accounts, edit profiles and view audit. Operators read, complete and print profiles. Both roles receive `profile:insert`, as required by FR-16/18 even though the draft's short role table omits it. Administrators also retain lookup maintenance for the existing admin UI. Dot-separated conscript/admin permission names are compatibility aliases only.

The cookie is opaque, HTTP-only, SameSite=Strict and Secure by default. Redis contains hashed token keys with idle and absolute expiration. SQL session versions revoke access on role changes, deactivation and password resets without depending on Redis key scans. Existing SQL session rows are no longer accepted. Logout deletes the Redis session. Account/role changes, imports, decisions, inserted recruits, profile changes, exports, documents and denied actions are audited. SQL application credentials cannot alter or delete audit rows.

## Install, run and deploy

Windows prerequisites: Python 3.12, Node.js 22+ for frontend builds, Docker Desktop, Microsoft ODBC Driver 18 for SQL Server. Access imports/exports additionally require a matching 64-bit Microsoft Access Database Engine ODBC driver; creating ACCDB files requires ACE DAO (`DAO.DBEngine.120`) or an empty `ACCESS_TEMPLATE` database. Run Access work on a Windows worker with this engine installed. XLSX/CSV jobs do not need Access.

```powershell
scripts\setup.ps1
scripts\db-init.ps1
scripts\create-admin.ps1
scripts\dev.ps1
```

`dev.ps1` starts SQL Server and Redis containers, applies migrations, and starts the API, worker and frontend as background processes. It prints process IDs and stop commands; logs are in `storage\logs`. To run just the worker in a terminal: `scripts\worker.ps1`. Stop containers with `docker compose -f docker-compose.dev.yml stop` (persistent data remains).

For production, run API and `python -m app.cli.worker` as separately supervised services with the same `.env` and shared storage. Use HTTPS, `ENV=prod`, `SESSION_COOKIE_SECURE=true`, a restricted Redis endpoint, and persistent SQL/Redis/storage volumes. The included Compose file is development-only and binds Redis to loopback. Back up SQL and file storage consistently. An offline deployment must bring Python wheels, built frontend assets, container images if used, and the Microsoft drivers onto the intranet in advance.

Useful settings are documented in `.env.example`: `REDIS_URL`, `REDIS_PREFIX`, `QUEUE_NAME`, `STORAGE_ROOT`, `UPLOAD_MAX_BYTES` (50 MiB), `IMPORT_MAX_ROWS` (100,000), `IMPORT_DUPLICATE_POLICY`, `JOB_MAX_ATTEMPTS`, `JOB_TIMEOUT_SECONDS`, `RECOVERY_INTERVAL_SECONDS`, `ACCESS_TABLE`, `ACCESS_TEMPLATE`. Give each environment a distinct queue and prefix. Set the reverse proxy's multipart body limit consistently with the upload limit. Parsers materialize bounded imports in memory; worker memory must be sized for the configured row/size limits. Excel cells above 32,767 characters fail export explicitly; use ACCDB to preserve longer values.

## Migration and compatibility

`backend/sql/009_poc_backend.sql` is additive and idempotent. It adds role/session version to existing accounts and introduces `official_governorate`, `import_job`, `import_record`, `import_record_error`, `recruit`, `export_job`, `recruit_document` and search view/indexes. Existing accounts with the historical `users.manage` grant migrate once to administrator; the others become operators. Review account roles after migration.

Existing user IDs remain integers to preserve established core foreign keys; new business/job/document IDs are UUIDs. This intentionally differs from the draft ERD's UUID user ID. Legacy skeleton conscript/staging/template/session tables remain intact but are not used by the new workflow. Existing legacy conscript data is not automatically transformed into the new `recruit` table. The draft does not specify a barcode encoding; the existing 12-digit sequence is retained and printed as Code 128.

The user-management frontend now selects roles and displays derived permissions. The conscript workflow screens (upload and review with live progress, search, enlistment data entry, label printing) are built on this API; see [ui-design.md](ui-design.md).

## Verification and local machine notes

2026-10-15 audit/rejection follow-up: distinct missing/overlong rejection messages, field-labelled exports (including legacy report messages), exact audit date/time filters, per-validation-run completion attribution, and Arabic/related-record audit search are implemented. See [integration-status.md](integration-status.md#audit-and-rejection-reason-fixes--2026-10-15). Historical audit entries and previously generated export files are retained unchanged; regenerate exports to obtain the clearer reasons. No migration is needed for this follow-up.

Correction/revalidation follow-up: **145 backend tests and 28 frontend tests passed**; type checks and production build passed. Migration `010_import_corrections.sql` preserves original row data and stores corrections separately. The worker revalidates all rows and uses a fresh queue identity for each validation run. See [integration-status.md](integration-status.md) for the correction workflow and remaining limits.

Verified after Stitch integration on 2026-10-14: **143 backend tests passed**, **25 standalone frontend tests passed**, both TypeScript projects type-checked, and the production frontend built successfully. Integration coverage includes real SQL Server/Redis, queue delivery and failure recovery, checkpoint resume, concurrent completion, approval conflicts, native Arabic ACCDB export/readback, protected downloads and the React workflow through a real Vite proxy/API/worker. The live frontend test is launched by the backend suite and skipped in standalone frontend runs. PowerShell scripts were also parsed successfully during the earlier setup pass.

Run `scripts\test.ps1` for SQL/Redis integration tests, unit tests, TypeScript checks and frontend tests. Backend integration tests rebuild only a dedicated database whose name ends in `_test`; use isolated Redis prefixes/queues and storage for tests. Access integration coverage needs the Windows prerequisites above.

Setup completed on 2026-10-14: installed Microsoft ODBC Driver 18.7.1.1 and Python 3.12.10, repaired the copied venv in place, installed declared requirements and applied migrations to the local `personnel` database. The normal setup/test scripts now work with encrypted ODBC 18 connections; the temporary legacy-driver test adapter is no longer needed. API, frontend, SQL Server, Redis and the worker are running locally. App: http://localhost:5173; API/docs: http://localhost:8002/docs. The approved initial administrator credential is stored privately in `storage/setup/admin-credentials.txt`; first login requires changing it.

A real Windows job revealed that RQ 2.12 SpawnWorker still calls POSIX process functions and misquotes this workspace path. Windows now uses `app/core/windows_worker.py`, a subprocess-based RQ adapter, with `app/cli/job_child.py`. Other platforms retain RQ SpawnWorker. This preserves per-job process isolation, hard timeout supervision and RQ execution tracking. The regression suite now runs real child-process import/export jobs from this Windows path.

See `output/pdf/backend-implementation-and-changes.pdf` for the earlier backend setup and deviation report. Its frontend status predates the Stitch integration; use [integration-status.md](integration-status.md) for the current state. The MD defines gender encoding but does not separately state male-only eligibility; rejection of even digits carries forward the earlier conscript rules and remains an explicit assumption. Admin profile correction currently covers only name/police number/dates; initial parsing exposes status before totals are known. Audit global text search is now wired into its React screen.
