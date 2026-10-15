# Review against the governing PoC Markdown

**Worker restart follow-up — 2026-10-15:** the normal development and standalone worker launchers now run `app.cli.worker_supervisor`. Worker exits trigger automatic restart with bounded backoff and abandoned child-process cleanup. This implements the supervisor restart shown in the MD crash-recovery sequence. Production boot/service management remains a deployment step; see [backend-poc.md](backend-poc.md#install-run-and-deploy).

**Latest follow-up — 2026-10-15:** item 5 / FR-25 now exposes incremental reading counts and streamed batch validation, with checkpoint recovery. FR-23/24 software was improved: identical preview/print documents, full-name fit checks, offline font and independent barcode decoding at 203/300 DPI. Physical printer/scanner acceptance is still pending; the owner has no printer set up and chose to retain 50 × 25 mm. These updates supersede the historical observations below.

**Follow-up — 2026-10-15:** rejection reasons (item 2), audit time filtering (item 3), revalidation-completion attribution (item 4), and the FR-13 audit-search limitations below have been addressed. The original observations are retained as the audit record; see [integration-status.md](integration-status.md#audit-and-rejection-reason-fixes--2026-10-15) for the current behavior. Gender eligibility, initial parsing metrics and the other listed limits remain outside this fix.

Reviewed on 2026-10-14, after the correction/revalidation implementation. Source: `PoC 3f98b04e77e080368063da1908126936.md`, including its functional requirements, sequence diagrams, ERD and database constraints. The MD repeats FR-3 and FR-21; both occurrences are covered below.

This is a requirements audit, not a claim that all requirements are complete. Application behavior was not changed during this audit. Evidence consists of current code inspection, existing regression coverage, and read-only probes of the national-ID validator, editable fields and development settings. The previously passing 145 backend / 28 frontend tests do not prove complete specification coverage.

## Confirmed gaps and discrepancies

### 1. Gender validation is stricter than the governing MD — FR-4

`backend/app/recruits/validation.py:67` rejects every even gender digit. The new MD explains odd = male and even = female but does not explicitly say to reject women. Its own example national ID is rejected with the sole error code `GENDER` when its remaining fields are supplied correctly. This was reproduced using the example from the MD.

The male-only rule came from the older conscript requirements and was carried forward as an assumption. It is not an exact implementation of the newer MD. If the newer MD is authoritative without an additional eligibility rule, the validator and corresponding SQL constraint/test expectations need to be aligned with it. Do not change an identity number merely to make it pass validation.

### 2. Some rejection reasons remain ambiguous, especially in exports — FR-5 / FR-9

The screen now identifies each failing field and exposes its current/original values, but the shared `FIELD_REQUIRED` message still combines two different failures: a missing value and a value exceeding a length limit. It does not state the applicable limit.

`backend/app/recruits/jobs.py:216` exports only `error_message`, omitting `field_name` and `error_code`. Two missing fields therefore produce identical messages in the rejection-reasons column, with no indication of which fields are affected. A read-only probe with empty `ps_name` and `gov_name` confirmed this.

Needed: distinguish missing/too-long errors and include the field name in each exported reason. Existing source-value preservation and XLSX/ACCDB generation are implemented.

### 3. Audit time-of-day filtering is absent from the screen — FR-14

The API accepts precise ISO timestamps, including timezone offsets. `frontend/src/features/admin/audit/AuditLogPage.tsx` exposes only date inputs and converts the selected days to midnight boundaries. An administrator cannot select, for example, 09:30–11:45 from the screen.

Needed: time-capable inputs with consistent timezone conversion and clear end-boundary semantics. The backend date/time filter itself exists.

### 4. Revalidation completion can name the wrong administrator — FR-11 / FR-12

The correction and revalidation-request events correctly record the acting administrator. However, `backend/app/recruits/jobs.py:189` always writes `validation_complete` using `job.uploaded_by_user_id`. If administrator B corrects/revalidates a file uploaded by administrator A, completion is attributed to A.

Needed: retain the requester for each validation run, or explicitly record automated completion as a system event linked to the initiating administrator. Existing tests use the same administrator for both actions and do not expose this distinction.

### 5. Initial parsing has no incremental row metrics — FR-25

`backend/app/recruits/jobs.py:132` calls `read_records(path)`, which materializes the complete file before publishing its total and validating in 250-row batches. The UI shows a parsing state during this period, then receives validation counters. This falls short of continuous parsing metrics in the functional requirement and parsing-by-batch in the sequence diagram.

Needed: incremental parsing/staging progress, followed by validation that still accounts for whole-file duplicates and supports checkpoint recovery. Current validation progress, reconnect snapshots and recovery are implemented.

## Partial coverage and operational limits

- **FR-13, audit search:** text search matches stored action/entity codes, user identity and before/after JSON. Arabic labels shown on screen are not translated into those codes for text search; searching the displayed word for approval will not inherently match the stored `approve` action. The action dropdown works. Also, a national-ID search does not resolve every event attached to that recruit: a label event stores the recruit UUID/barcode, without the national ID. The requirement's global-search intent would be better met by resolving the affected recruit and displayed action names.
- **FR-21, administrator editing:** lock enforcement is implemented. After approval, administrators can edit name, police number and service dates only. Imported identity/qualification fields can now be corrected before approval, but not on an approved recruit. The MD does not enumerate the administrator's editable fields, so this is an unresolved scope limitation rather than proof that every field must be editable.
- **FR-23 / FR-24, physical printing:** the label endpoint and frontend print flow exist, with barcode, name, police number and year. Real HTTP tests verify the returned label HTML; they do not establish scan reliability, actual label-printer output or fitting unusually long names. Printer/scanner acceptance testing remains outstanding.
- **FR-26, secure-cookie deployment:** Redis sessions, HttpOnly/SameSite cookies and a configurable Secure flag exist. A read-only configuration check found `ENV=dev` and `SESSION_COOKIE_SECURE=false`, which supports the current HTTP localhost setup. A production HTTPS deployment with Secure cookies has not been delivered or verified.
- **Worker-crash sequence:** child-job failures/checkpoints/retries are handled, but the local PowerShell launcher does not automatically restart the top-level worker supervisor process if that process itself dies. The diagram assumes such supervision. A Windows service/service supervisor with automatic restart remains deployment work.

## Functional requirement coverage

“Implemented” here means code and relevant existing coverage were found, subject to the limitations above; it does not mean every possible input or physical device has been tested.

| MD requirement | Assessment | Main implementation evidence |
| --- | --- | --- |
| FR-1: xlsx/csv/xls/accdb upload | Implemented; mdb additionally supported | `recruits/files.py`, upload endpoint and React import form |
| FR-2: batch dropdown | Implemented: 1–4 | `imports/ImportsPage.tsx`, request/SQL constraints |
| FR-3: enlistment year | Implemented | Import form, request/SQL constraints |
| FR-3: quarter start dates | Implemented | `initial_start`, frontend batch suggestion |
| FR-4: ID format, birth, gender, governorate, uniqueness | Implemented checks with gender discrepancy | `recruits/validation.py`, SQL constraints, duplicate tests |
| FR-5: valid/invalid report and individual reasons | Implemented; reason wording still partial | Report/rows endpoints, row-detail dialog, gap 2 |
| FR-6: approve valid / cancel all | Implemented | Locked job transactions, approval duplicate recheck, cancellation |
| FR-7: rejected-row export | Implemented | Export jobs and authenticated downloads |
| FR-8: XLSX and ACCDB | Implemented | Real Excel/Access writers; native Access regression coverage |
| FR-9: raw data plus specific reasons | Source data preserved; reasons need field specificity | Export writer, gap 2 |
| FR-10: administrator audit screen | Implemented | Audit route permission and frontend route guard |
| FR-11: log critical actions | Implemented, with revalidation attribution defect | Audit calls in upload/approve/complete/correct/user services |
| FR-12: actor, timestamp, before/after | Implemented for edits/corrections; attribution defect noted | Append-only audit table, service snapshots, gap 4 |
| FR-13: global audit search | Implemented with language/record-resolution limitations | `admin/audit/service.py`, audit search input |
| FR-14: date and time range | API implemented; UI date-only | Audit API and gap 3 |
| FR-15: national-ID profile lookup | Implemented | `/recruits/by-national-id/{national_id}`, entry screen |
| FR-16: police-number entry | Implemented | Entry form, completion schema |
| FR-17: police-number/year uniqueness | Implemented in API and database | Filtered unique index, completion transaction |
| FR-18: initial dates/manual overrides; independent end date | Implemented after integration fix | Backend suggestions; editable dates; frontend/live tests |
| FR-19: qualification durations | Implemented: 14/20/26/38 months | Validation rules, frontend rules, SQL trigger |
| FR-20: required dates and matching duration | Implemented | Form validation, completion service, SQL constraints/trigger |
| FR-21: locking and administrator-only modifications | Locking implemented; edit-field scope limited | Completion transaction, `profile:update`, edit schema |
| FR-21: unified search | Implemented | Search API and React search screen |
| FR-22: national ID/barcode/name/police number + year | Implemented | Search criteria and backend query filters |
| FR-23: barcode printing module | Implemented; physical acceptance test outstanding | Labels screen, backend printable HTML |
| FR-24: barcode/name/police number/year on label | Implemented in layout; physical fitting/scan unverified | Label rendering and HTTP integration test |
| FR-25: continuous processing metrics | Validation metrics implemented; initial parsing partial | Worker snapshots/SSE/polling, gap 5 |
| FR-26: username/password, Redis, secure cookies | Implemented capability; current deployment is HTTP development | Auth router, Redis security module, configuration |
| FR-27: roles and permissions | Implemented | `core/roles.py`, per-route permission checks |
| FR-28: administrator creates users/assigns roles | Implemented | User API and admin screens |
| FR-29: administrator changes activation/roles | Implemented | User service, revocation on changes |
| FR-30: logout/expiry/invalidation | Implemented | Redis TTL/absolute expiry, SQL session versions, auth tests |

## Sequence, database and implementation choices

- SQL uniqueness for national IDs and police-number/year, unique staging row number per job, required foreign keys, progress-count constraints, atomic profile locking/audit and native rowversion are present.
- The stack matches FastAPI, SQLAlchemy/pyodbc, SQL Server, Redis sessions/Pub/Sub and Python RQ with persistent files. The Windows subprocess worker adapter addresses the RQ/Windows incompatibility while retaining queue semantics.
- Uploads/exports are committed to a SQL-backed dispatch queue before delivery to RQ. This intentionally differs from the diagram's immediate enqueue-before-response ordering and supports recovery from Redis delivery failures; it can introduce a dispatcher-interval delay.
- SSE uses a `progress` event with explicit status, including terminal statuses, rather than separate named completed/failed events. The frontend handles that contract and closes terminal streams.
- Existing user IDs remain integers rather than the ERD's UUIDs; staging parsed fields are mostly stored as JSON rather than separate columns; source record IDs are strings rather than integers. These are documented compatibility/storage choices, not absent workflows.
- The MD's short roles table omits `profile:insert`, although FR-16/18 require it for operators. The implementation grants it to operators and administrators to satisfy the functional workflow.
- Duplicate handling within an uploaded file is an explicit policy (`reject_all` by default). The MD clearly forbids duplicates against the database but does not fully specify which within-file occurrence should survive.
- Full in-app source-row correction is an owner-authorized addition. It preserves originals and requires revalidation and a separate approval; it does not replace the required report/export/approve/cancel flow.

## Items not omitted from this MD

Civilian employee workflows, Oracle migration, employee reports, backup/restore UI, bulk barcode printing, printer-device monitoring, self-service password-reset requests and certificate/blockchain features are not explicit functional requirements of this conscripts PoC MD. They may belong to older documents or Stitch references, but should not be counted as omissions from this document.

Recommended next work: resolve the gender-rule discrepancy; improve rejection specificity; fix audit attribution and time controls; then implement parsing progress and close the audit-search/deployment/physical-test gaps. This audit did not alter eligibility rules, records or runtime configuration.
