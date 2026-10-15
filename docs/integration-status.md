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
- Initial parsing now publishes discovered-row counts while reading; evaluated/valid/invalid counters update during the following streamed validation pass. Whole-file duplicate detection is completed before classifying rows.
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

## Live parsing and labels — 2026-10-15

- Migration `011_import_parsing_progress.sql` adds persisted `parsed_rows`. SSE and polling return this counter. The worker discovers IDs incrementally, committing progress every 250 records or one second while records arrive; no fake percentage is shown before the total is known. A second streaming pass evaluates batches of 250 with complete duplicate counts. Full source records are no longer all held in one list. Revalidation reads staging with bounded keyset pages. Parsing retries restart the read count; committed validation checkpoints remain intact and prevent duplicate staging.
- The owner confirmed the printer is not set up and authorized keeping **50 × 25 mm**. Preview and printing now use the same backend-generated document, with embedded offline Cairo font, fixed Code 128 bar dimensions and quiet zones, full name and police-number/year. Text fitting waits for fonts, shrinks only the name down to 6 pt, and prevents application printing when the full name still cannot fit. Barcode bars are never resized to accommodate names. Preview is enlarged only on screen.
- Preview requests (`?preview=true`) do not create print audit entries. Actual print requests retain the `label` action and record `event=print_requested`; UI wording no longer claims that paper was printed. The browser dialog selects the printer, 50 × 25 mm stock, 100% scale, zero margins and no headers/footers. A duplicate frame-load event cannot open multiple print dialogs.
- `output/labels/sample-50x25.html` is a standalone synthetic sample; barcode `000000000000` is for calibration only and does not identify a recruit. For a real label, scan it in the recruit-selection screen and verify that it opens the correct record.
- Software verification rasterizes actual SVG bars at **203 and 300 DPI** and decodes them with the independent ZXing decoder. Name overflow/font-wait/print guards are tested in jsdom. Physical feed alignment, adhesive stock, ink/thermal quality and scanner acceptance remain pending until hardware is available. No connected browser was available for visual inspection.

Verification: **164 backend tests passed** and **41 standalone frontend tests passed**; the live React/API/worker test passed in the backend suite. Both TypeScript projects and the production build passed. Migration 011 was applied to the development database and the development worker was gracefully restarted. Existing uploaded and approved records were preserved.

## Automatic worker restart — 2026-10-15

`scripts/dev.ps1` and `scripts/worker.ps1` now launch `app.cli.worker_supervisor`. It restarts exited workers after 2 seconds, backs off repeated failures up to 30 seconds, and resets the delay after a stable minute. It logs worker starts, exit codes and restart delays. An OS file lock prevents duplicate supervisors for the same queue/storage. Windows Job Objects contain each worker and its RQ/Access descendants; a startup handshake prevents jobs from starting before containment. Abandoned children are terminated before a replacement starts. Intentional supervisor shutdown stops the tree without respawning it.

This implements the supervisor restart in the MD crash-recovery diagram. Existing SQL checkpoints, stale-execution timing and retry limits remain authoritative; process restart does not immediately override an RQ execution still inside its stale timeout. No schema or business-rule change and no additional dependency were needed. Starting at PC/server boot, and restarting the supervisor itself, remain deployment service-manager configuration.

Verification: **169 backend tests passed**, including terminating a real RQ worker and having its automatic replacement complete an export and subsequent revalidations. New process tests cover restart after zero/nonzero exit, cleanup of abandoned subprocesses, intentional stop, capped backoff and duplicate-supervisor rejection. A random-ID collision discovered in existing tests was fixed by using unique synthetic serials within the test session. PowerShell launcher syntax and `git diff --check` passed. No frontend code changed for this follow-up.

The old idle development worker was stopped through its RQ shutdown command and its OS process exit was confirmed. The replacement supervisor is running under background launcher PID **54200**, with the worker listening on `personnel`. API and frontend returned HTTP 200 after activation. Logs remain in `storage/logs/personnel_worker.error.log`; the launcher stop command is `taskkill /PID 54200 /T /F`. Runtime PIDs change on subsequent launches; always use the current PID file/launcher output.

## Police-number lookup on the label screen — 2026-10-15

The label selector previously interpreted every 12-digit input as a barcode. A saved 12-digit police number therefore returned no match. Added an explicit **police number + enlistment year** mode to the label screen using the existing protected search endpoint. The year is required and must be in the API's 2000–2100 range, consistent with FR-22; the screen never guesses which year's recruit to open. Police numbers retain leading zeros and supported text characters. National-ID and barcode lookup remain available, and Arabic guidance explains that police numbers and generated barcodes differ. The entry screen's national-ID lookup is unchanged.

Verification: **46 standalone frontend tests passed**, both TypeScript projects and the production build passed, and the real React/API/SQL/worker integration test passed with both police-number/year and barcode navigation to the same completed recruit's label. No backend, schema or stored-profile changes were required. The reported profile was checked read-only to confirm that its police number had been saved.
