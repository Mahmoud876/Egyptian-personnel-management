# Stitch frontend and backend integration — 2026-10-14

The Stitch implementation already included typed API hooks. This integration pass preserved its layout, completed the missing reference/count endpoints, corrected the enlistment-date interaction to the MD, and exercised the real workflow across React, the Vite proxy, FastAPI, SQL Server, Redis and the Windows RQ worker.

## Connected workflows

- Cookie login, logout, password change and fixed administrator/operator roles.
- Multipart imports, batch/year selection, history, live SSE progress with polling fallback, validation reports and row-level errors.
- Administrator approval/cancellation and background rejected-row exports to XLSX/ACCDB, with authenticated downloads.
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
- Administrator profile editing currently supports only name, police number and service dates. Editing imported national ID, birth date, governorate, qualification or batch/year is not implemented.
- There is no explicit revalidation/retry endpoint for a previously reviewed import. Approval rechecks duplicates atomically and returns a conflict; correcting/re-uploading the source is the current recovery path.
- During initial parsing the UI shows the parsing state; row totals appear after the parser has read the file. Incremental row metrics then update during validation.
- Bulk label printing, printer-device monitoring, self-service password-reset requests and the decorative certificate/blockchain features in Stitch are not implemented.
- Legacy administrative reference maintenance remains separate from the PoC's fixed quarter start dates, service durations and official national-ID codes. Editing legacy lookup settings does not override those rules.
- Production service installation, automated backup scheduling and an offline deployment package remain operational work. The current launcher/Compose setup is for local development.
- The earlier male-only national-ID eligibility assumption remains; it is stricter than the new MD's statement about verifying the gender digit. No new eligibility restriction was added during frontend integration.

## Verification and use

Verified this pass: **143 backend tests passed** (including the real frontend/API/worker workflow), **25 standalone frontend tests passed**, both TypeScript projects passed, and the production bundle built successfully. The standalone frontend run skips its live integration test because the backend suite supplies the required isolated servers and credentials. The running frontend and API both returned HTTP 200; SQL Server and Redis health checks passed. There is an existing non-fatal Pydantic metadata warning and a Vite bundle-size advisory.

Open `http://localhost:5173` and refresh to load the updated screens. The API runs on `http://localhost:8002`; frontend requests use the same-origin `/api/v1` proxy.

Run `scripts/test.ps1` for backend, frontend and type checks. The backend suite now also starts temporary API/proxy/worker processes and runs `live.integration.test.tsx`; that test is deliberately skipped in ordinary standalone frontend runs. It checks upload, worker validation, XLSX export, approval, operator completion, persistence, barcode search/label HTML, permission denial and audit results. Browser visual layout and physical printing require a separate manual check.
