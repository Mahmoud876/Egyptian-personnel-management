# Skeleton build plan

Build one phase at a time. At the end of each phase: run the checks listed, commit, then **stop and report** (what was built, how to run it, anything decided along the way) and wait for approval.

## Phase 0: Repo and tooling

- `git init`, `.gitignore` (Python, Node, `.env`, `dist`, `*.mdb` uploads folder), `README.md`, `.env.example`.
- `docker-compose.dev.yml`: SQL Server 2022 (dev only), volume for data, SA password from `.env`.
- `backend/`: Python 3.12 project (`pyproject.toml` or `requirements.txt` + `requirements-dev.txt`), FastAPI app factory, `GET /api/v1/health` returning DB connectivity.
- `frontend/`: Vite + React 19 + TypeScript strict, MUI with RTL cache, `@fontsource/cairo`, React Router, TanStack Query. `<html dir="rtl" lang="ar">`. Vite dev proxy `/api` → `http://localhost:8000`.
- `scripts/dev.ps1` (start DB, backend, frontend), `scripts/test.ps1`, `scripts/gen-types.ps1`.
- `docs/licenses.md` started with every dependency added so far.

**Done when:** `scripts/dev.ps1` starts everything; the frontend shows an empty RTL page in Arabic; `/api/v1/health` reports the DB is reachable.

## Phase 1: Database core

- `backend/sql/001_database.sql`: create DB with `Arabic_100_CI_AS` if missing.
- `002_core.sql`: `permission`, `app_user`, `user_permission`, `permission_template`, `template_permission`, `user_session`, `audit_log` (see `docs/permissions.md`).
- `003_permissions_seed.sql`: every code from `docs/permissions.md` + the seed templates.
- `004_lookups.sql`: `governorate`, `police_station`, `qualification`, `batch_schedule`, `work_entity`, `action_type` + seed data from `docs/business-rules.md`.
- `005_conscripts.sql`: `import_batch`, `import_row`, `conscript` with all constraints from `docs/business-rules.md` (UQ national_id, UQ (police_no, conscription_year), UQ barcode, CHECK length/digits, CHECK end_date > start_date). System-versioned temporal table on `conscript`.
- `006_employees.sql`: `employee`, `job_action`, `document` (FILESTREAM can be a TODO; use `VARBINARY(MAX)` in dev), `document_link`, `migration_batch`, `migration_error`. Temporal on `employee` and `job_action`.
- `scripts/db-init.ps1` runs the scripts in order. Scripts are idempotent.
- SQLAlchemy models mirror the tables (no auto-create; SQL scripts are the source of truth).

**Done when:** `db-init.ps1` runs twice without errors; tables, constraints and seeds exist.

## Phase 2: Auth, permissions, audit (fully working)

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`. Server-side sessions, HTTP-only cookie, idle timeout from config. Login failures audited.
- `require_permission(*codes)` dependency and `has_permission()`; denied attempts audited.
- `audit.write(...)` helper used by every write.
- `scripts/create-admin.ps1`: creates the first admin with every permission.
- Tests:
  - login / logout / me
  - a user without a code gets 403 **and** an `audit_log` row with `action='denied'`
  - **route coverage test**: iterate over all FastAPI routes and fail if any route other than login and health lacks a `require_permission` dependency.

**Done when:** all tests pass.

## Phase 3: Admin screens (fully working)

Backend + frontend:
- Users: list, create, edit, deactivate, reset password (`users.view`, `users.manage`).
- User permissions editor: permissions grouped by module with Arabic names, checkboxes, "apply template" dropdown that copies a template's codes into the form, save (`users.manage`).
- Templates: list, create, edit (`templates.manage`).
- Audit log viewer: filters by user, action, entity, date range; paged; shows old/new values side by side (`audit.view`).
- Lookups: simple editable tables (`lookups.manage`).

Frontend shell:
- Login page, app layout (RTL sidebar on the right, top bar with user name and logout), 403 and 404 pages.
- `usePermission`, `<Can>`, `<RequirePermission>`; sidebar built from a menu config where each item declares its permission.

**Done when:** an admin can create a user, apply the "مدخل بيانات — المجندين" template, log in as that user, and see only the conscripts search, data entry and label items. A forbidden URL shows the 403 page and the attempt shows in the audit log.

## Phase 4: Conscripts module, stubbed

Backend: routers and Pydantic schemas for every endpoint below, each with its permission; handlers return `501` with `TODO(rules): docs/business-rules.md#...`.

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/conscripts/imports` (file + batch_no + year) | `conscripts.import.upload` |
| GET | `/conscripts/imports/{id}` | `conscripts.import.upload` |
| GET | `/conscripts/imports/{id}/rows?status=` | `conscripts.import.upload` |
| POST | `/conscripts/imports/{id}/approve` | `conscripts.import.approve` |
| POST | `/conscripts/imports/{id}/cancel` | `conscripts.import.approve` |
| GET | `/conscripts/imports/{id}/rejected?format=xlsx\|mdb` | `conscripts.import.export` |
| GET | `/conscripts/by-national-id/{nid}` | `conscripts.enter` |
| PUT | `/conscripts/{id}/enlistment` | `conscripts.enter` |
| PATCH | `/conscripts/{id}` | `conscripts.edit_locked` |
| GET | `/conscripts/search` | `conscripts.view` |
| GET | `/conscripts/{id}` | `conscripts.view` |
| GET | `/conscripts/{id}/label` | `conscripts.label.print` |

Frontend screens (layout and forms complete, wired to the typed API client, showing a "قيد التطوير" notice when the API returns 501):
- Upload: file picker, batch select (1–4), year input.
- Import report: summary counts, rejected rows table with reasons, approve / cancel / export buttons (each behind its permission).
- Data entry: national ID lookup, read-only received data, police number, start/end date fields, save.
- Search: one search box + filters, results table, open record.
- Record view, with an edit button behind `conscripts.edit_locked`.
- Label print: print-only CSS layout with a placeholder barcode area.

**Done when:** every screen renders, every button respects its permission, `tsc` and tests pass.

## Phase 5: Employees module, stubbed

Same approach: routers + schemas + permissions + 501 stubs, and screens for employee list/search, employee detail with job actions and documents tabs, create/edit employee, record job action with attachment, import files, reports, migration runs (start, reconciliation report, rollback).

**Done when:** every screen renders and respects permissions.

## Later (not part of the skeleton)

Real validation and import logic, barcode generation, Excel/Access export, migration pipeline, reports, backup/restore scripts, offline build kit (`wheelhouse/`, npm cache, `build.ps1`), deployment guide.
