# Stitch frontend and backend integration — 2026-10-14

Latest follow-up: audit and rejection-reason fixes on 2026-10-15, documented below.

The Stitch implementation already included typed API hooks. This integration pass preserved its layout, completed the missing reference/count endpoints, corrected the enlistment-date interaction to the MD, and exercised the real workflow across React, the Vite proxy, FastAPI, SQL Server, Redis and the Windows RQ worker.

## Connected workflows

- Cookie login, logout, password change and fixed administrator/operator roles.
- Multipart imports, batch/year selection, history, live SSE progress with polling fallback, validation reports and row-level errors.
- Administrator approval/cancellation and background rejected-row exports to XLSX/ACCDB, with authenticated downloads.
- Full row inspection, field-specific rejection reasons, administrator source-data corrections before approval, and whole-file revalidation. Original uploaded values are retained separately, and corrections are audited.
- National-ID lookup, unified search, police-number/year search and barcode lookup.
- Profile completion with explicit start/end dates, duration validation, unique police-number/year, record locking and immutable barcode assignment.
- Administrator correction of name/police number/dates, linked document upload/download, and audit search/filter/detail screens.
- Barcode preview and the audited backend printable label. Physical printer operation has not been tested.
- Dashboard counters now use filtered database totals rather than counting only the latest 100 uploads. Official governorate names use the national-ID reference table, not the older administrative table.

## Fixes made in this pass

1. FR-18/20: the backend supplies initial date suggestions. Both dates remain editable; changing the start does not change the end. An incorrect duration prevents saving with a clear Arabic message. Invalid calendar dates and out-of-range calculations are rejected locally as well as by the server.
2. Added the official governorate read endpoint and a validated multi-status filter for import history. Regenerated the TypeScript API contract.
3. Guarded live progress against malformed events, mismatched job IDs and old versions. Added visible retry handling for export polling failures.
4. Added a real HTTP integration regression that drives the React screens using synthetic users and data in `personnel_test`, leaving the development administrator and records untouched.

## Remaining backend work and limits

The main conscripts workflow exists, but the entire broader personnel system is not complete:

- Civilian employee CRUD and employment actions, Oracle migration execution, employee reports/e-archive workflows, and backup/restore tools are not implemented. Some database models/tables exist; that is not a functioning module.
- After approval, administrator profile editing supports only name, police number and service dates. National ID, birth date, governorate and qualification can now be corrected in staging before approval; changing these fields on an already-approved recruit remains unimplemented. Batch/year correction still requires uploading under the correct batch/year.
- During initial parsing the UI shows the parsing state; row totals appear after the parser has read the file. Incremental row metrics then update during validation.
- Bulk label printing, printer-device monitoring, self-service password-reset requests and the decorative certificate/blockchain features in Stitch are not implemented.
- Legacy administrative reference maintenance remains separate from the PoC's fixed quarter start dates, service durations and official national-ID codes. Editing legacy lookup settings does not override those rules.
- Production service installation, automated backup scheduling and an offline deployment package remain operational work. The current launcher/Compose setup is for local development.
- The earlier male-only national-ID eligibility assumption remains; it is stricter than the new MD's statement about verifying the gender digit. No new eligibility restriction was added during frontend integration.

## Verification and use

Verified after row corrections: **145 backend tests passed** (including the real frontend/API/worker correction workflow), **28 standalone frontend tests passed**, both TypeScript projects passed, and the production bundle built successfully. The standalone frontend run skips its live integration test because the backend suite supplies the required isolated servers and credentials. Vite reports a non-fatal bundle-size advisory.

Open `http://localhost:5173` and refresh to load the updated screens. The API runs on `http://localhost:8002`; frontend requests use the same-origin `/api/v1` proxy.

Run `scripts/test.ps1` for backend, frontend and type checks. The backend suite now also starts temporary API/proxy/worker processes and runs `live.integration.test.tsx`; that test is deliberately skipped in ordinary standalone frontend runs. It checks upload, worker validation, XLSX export, approval, operator completion, persistence, barcode search/label HTML, permission denial and audit results. Browser visual layout and physical printing require a separate manual check.

## Correcting rejected rows

In the report, choose **عرض تفاصيل السجل**, inspect the flagged fields and their original values, edit the verified source values, then choose **حفظ التصحيح وإعادة الفحص**. Every correction rechecks the entire file, including duplicate relationships with other rows and the database. The administrator must still approve the resulting valid group; saving a correction never inserts recruits automatically. **إعادة فحص الملف** also refreshes database-duplicate checks after an approval conflict. Failed revalidation can be retried from the report.

Approved/cancelled imports remain read-only. Concurrent stale edits are rejected using the inspected report version. A pending export must finish before corrections/revalidation so its data and rejection reasons stay consistent. Corrected rejected-row exports contain the current values and an `original_uploaded_data` JSON column (collision-safe name) preserving the original source record. The original upload file and staging `raw_data_json` are unchanged.

During correction/revalidation, the complete staging table stays available for read-only inspection, including after navigation or refresh and after a failed recheck. Tabs and paging remain usable; classifications/errors are explicitly provisional until the job returns to `READY_FOR_REVIEW`. The table retains the current page during a progress refresh without allowing stale edits, and adjusts pagination when corrected rows leave a group. Editing, approval and export remain blocked until validation finishes. Initial uploads still wait for their first completed report. Saving a correction persists it immediately and queues validation; the default dispatcher can take up to 30 seconds to pick it up.

Verified this visibility fix with **149 backend tests passed**, including the real frontend/API/worker workflow, and **33 standalone frontend tests passed** (one live test skipped in the standalone run). Both TypeScript projects and the production build passed. API/frontend health checks returned HTTP 200. Tests cover inspection in queued/parsing/validating/failed revalidation states, preserved source/correction data, restricted mutations, and slow refreshes without stale edits; browser visual inspection was not performed.

Migration `010_import_corrections.sql` adds a separate correction snapshot and validation generation; it is additive and preserves existing uploads. Each validation generation gets a new queue identity so completed RQ jobs cannot prevent subsequent revalidation. Detailed reasons/export/revalidation follow the MD; editing staged values inside the application is the usability extension explicitly requested by the owner in this conversation.

## Audit and rejection-reason fixes — 2026-10-15

- Missing required values and overlong values now have distinct codes/messages. Length errors show the allowed and actual length. Report reads clarify the old combined `FIELD_REQUIRED` messages using the saved row values; re-uploading is unnecessary. New XLSX and ACCDB exports prefix every reason with its Arabic field label and source column name. Already-generated export files remain unchanged; generate a new export for the improved wording.
- Audit filters accept local date and time (including seconds), convert to UTC, and state the device timezone. The start is inclusive and the end exclusive. Reversed/equal bounds are rejected in the API and blocked in the UI without displaying stale matches.
- Completion audit entries identify the requester of the particular validation run, using its immutable `revalidation_requested` audit event. Initial validation retains the uploader as initiator. Retries keep the same requester; if a legacy run has no matching request event, completion is attributed to the system rather than guessing. New completion entries include `validation_run`. Historical audit entries are not rewritten.
- Global audit search recognizes Arabic action/entity labels (including common alef spelling variations) and resolves national ID, barcode, police number and normalized recruit name to associated recruit events. Thus label and document events are searchable even when their JSON omits the national ID. Related import, staged correction and export events are included. IP/permission searches and exact user/action/entity/time filters remain supported; SQL LIKE wildcard input is escaped. The backend alias catalog is checked against the frontend labels by a regression test.

No database migration, new dependency or data re-import is required for these four fixes. The running development API reloads the changed code; each Windows worker child imports the updated validation/export code when it starts.

Verification: **154 backend tests passed**, including the real React/API/worker workflow and native ACCDB export; **35 standalone frontend tests passed**, with the live test run separately by the backend suite. Both TypeScript projects and the production build passed. API and frontend health checks returned HTTP 200. No browser visual inspection was performed.
