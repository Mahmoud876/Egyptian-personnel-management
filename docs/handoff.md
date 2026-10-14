> **Historical document:** The owner's newer PoC Markdown now governs the conscripts backend. See [backend-poc.md](backend-poc.md) for implemented workflows, Redis sessions, RBAC, migration and operating instructions. Conflicting skeleton-era rules below are superseded.

# Project handoff: status, knowledge, next steps

Last updated: 2026-10-14. Written so work can continue on another PC, by a person or by a new Claude Code session that has none of the earlier conversation.

**New Claude Code session: read in this order:** `CLAUDE.md` → this file → `docs/skeleton-plan.md` → `docs/permissions.md` → `docs/business-rules.md`. Then ask the user which of the pending decisions in [§16](#16-pending-decisions-waiting-for-the-user) they have answered.

---

## 1. What the project is

Two government web apps on one shared core, built as proof-of-concepts for a tender. All UI text is Arabic (RTL). Everything must run fully offline on an intranet.

1. **Conscripts affairs (منظومة شئون المجندين)**: receive the Armed Forces file (Access `.mdb`), validate national IDs, approve or reject rows, register enlistment data (police number, dates), print barcode labels. **PoC deadline: 5 days.**
2. **Civilian employees (منظومة العاملين المدنيين)**: migrate from Oracle 11g to SQL Server, employee records, job actions with decision documents, simulated e-archive, reports, backup/restore.

Original specs (in the project root, **not in git**, see [§3](#3-moving-to-the-new-pc)): `مجندين.docx`, `العاملين المدنيين POC.pdf`, sample input `Person_data_S.mdb` (table `person_data`, 100 rows).

People: the user (project owner, drives decisions); **Mahmoud** builds the module business logic, or it is built together module by module. Business logic stays as stubs unless the user asks (the user explicitly asked for barcode generation, which is done).

---

## 2. Status at a glance

| Step | Status | Commit |
| --- | --- | --- |
| Phase 0: repo, tooling, Docker SQL Server, FastAPI health, RTL React shell | ✅ done | `1b7dce6` |
| Phase 1: database (scripts 001–007), seeds, least-privilege app login, models | ✅ done | `eebda52` |
| Phase 2: login/logout/me/change-password, sessions, `require_permission`, audit, create-admin | ✅ done | `00fbe37` |
| Phase 3: admin screens (users, permissions editor, templates, audit viewer, lookups) + app shell | ✅ done | `37b458b` |
| Barcode generation (requested by the user, ahead of Phase 4) | ✅ done | `0b10623` |
| Phase 4: conscripts module, stubbed (routes + schemas + screens, 501 handlers) | ⏳ next | |
| Phase 5: employees module, stubbed | ⏳ | |
| Business logic (import/validation/approval/export, data entry, search, labels; employees) | ⏳ later | |

Checks at the last commit: **105 backend tests, `tsc --noEmit` clean, 13 frontend tests, all passing** (`scripts\test.ps1`).

Phase 3 "done when" was verified against the live app: an admin created a user, applied the "مدخل بيانات — المجندين" template, that user logged in and saw only Home + conscripts search / data entry / label items; opening `/admin/users` showed the 403 page and both the screen attempt and the API attempt appeared in the audit log.

---

## 3. Moving to the new PC

### 3.1 What git carries and what it doesn't

Git (the `.git` folder inside the project) carries all code, SQL scripts, docs and this file. There is **no remote**; move the repo by copying the whole project folder (or push to a **private** remote, but never push the spec files or the sample `.mdb`).

**Not in git, copy by hand if you want them:**

| Item | Needed? |
| --- | --- |
| `Person_data_S.mdb`, `مجندين.docx`, `العاملين المدنيين POC.pdf` (root) | Yes for business logic and tests. Gitignored on purpose: the sample may contain real personal data |
| `.env` | No: `scripts\setup.ps1` generates a new one with fresh passwords and free ports |
| `backend\.venv`, `frontend\node_modules` | No: recreated by `setup.ps1`. Skip them when copying (large) |
| Dev database (Docker volume `personnel-dev_mssql-data`) | No: recreated by `db-init.ps1`. It only held seed data, the `admin` user, a demo user `entry1` and audit rows |

### 3.2 Prerequisites on the new PC (Windows)

```powershell
winget install Git.Git Python.Python.3.12 OpenJS.NodeJS.LTS Microsoft.msodbcsql.18 Docker.DockerDesktop
```

- Python **3.12** (with the `py` launcher), Node **22+** (24 LTS used here), Docker Desktop (Linux containers), **ODBC Driver 18 for SQL Server**.
- For the conscripts import logic (later): the **64-bit Microsoft Access Database Engine** (driver name `Microsoft Access Driver (*.mdb, *.accdb)`). Check with `Get-OdbcDriver | ? Name -like '*Access*'`. It was present on the old PC; reading `Person_data_S.mdb` through it was tested and works (see §12).
- If PowerShell refuses scripts: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### 3.3 First run

```powershell
cd "<project folder>"
scripts\dev.ps1            # creates .env, venv, installs deps, starts SQL Server, applies backend\sql, opens backend + frontend windows
scripts\create-admin.ps1   # prints a one-time password for user "admin" (must be changed at first login)
scripts\test.ps1           # all checks; expect 105 backend + 13 frontend tests passing
```

Open `http://localhost:<WEB_PORT>` (default 5173). Ports are in `.env`; setup picks a free one if 8000/5173 are busy (on the old PC 8000 and 8001 were taken, so the API ran on **8002**).

The demo user `entry1` does not exist on a fresh database. Recreate it in the UI: إدارة النظام ← المستخدمون ← مستخدم جديد, apply the template "مدخل بيانات — المجندين".

### 3.4 Known machine pitfalls (all hit on the old PC)

- **`PYTHONHOME` set machine-wide by other software** (ZKBioTime did this; it was uninstalled from the old PC). Symptom: `SRE module mismatch` or `No module named 'encodings'`. The scripts clear it; in your own terminal run `Remove-Item Env:PYTHONHOME`.
- **`localhost` resolves to `::1`** while the SQL container listens on IPv4 only → login timeout. `.env` uses `DB_HOST=127.0.0.1`.
- **Docker Desktop crashed** once ("Docker Desktop is unable to start"). Fix: `docker desktop restart`. The container now has `restart: unless-stopped`, so the DB comes back by itself.
- **A stale backend kept serving old code**: uvicorn `--reload` runs the app in a child process; killing the parent with `Stop-Process` left the child holding the port. Closing the window normally is fine. `dev.ps1` now refuses to start a second server on a busy port.
- **VS Code says packages are missing**: select `backend\.venv\Scripts\python.exe` as the interpreter.

---

## 4. Stack and exact versions

| Layer | Choice (version) |
| --- | --- |
| Database | SQL Server 2022 (Docker image `mcr.microsoft.com/mssql/server:2022-latest`, Developer, dev only). Server and DB collation `Arabic_100_CI_AS` |
| Backend | Python 3.12.10, FastAPI 0.143.0, Uvicorn 0.54.0, SQLAlchemy 2.1.4 (sync, 2.0-style), pyodbc 5.3.0 + ODBC Driver 18, Pydantic 2.14.1, pydantic-settings 2.15.0, pwdlib[argon2] 0.3.1 |
| Backend tests | pytest 9.1.1, httpx2 2.13.1 (Starlette 1.x's TestClient wants `httpx2`, not `httpx`) |
| Frontend | React 19.3.0, TypeScript **5.9.3** (pinned; see §13), Vite 8.3.4, MUI 9.5.0 + emotion 11.14 + stylis-plugin-rtl 2.1.1, @fontsource/cairo 5.3.0, React Router 8.4.0, TanStack Query 5.104.2, react-hook-form 7.90.0, zod 4.6.7, @hookform/resolvers 5.9.1, openapi-fetch 0.17.0, jsbarcode 3.12.3 |
| Frontend tests | vitest 5.0.4, jsdom 30.1.2, @testing-library/react 16.3.3 |
| API types | openapi-typescript 7.13.0 → `frontend/src/shared/api/schema.d.ts` |
| Runtime | Node 24.20.0 (build only), Docker 28.4 |

Licences: every dependency is in `docs/licenses.md`. Rule: MIT/BSD/Apache/ISC only. Exceptions recorded: `@fontsource/cairo` (OFL-1.1, named in the stack), transitive `typing_extensions` (PSF-2.0). Build-time-only transitive deps include MPL-2.0 `lightningcss` (Vite), not shipped.

---

## 5. Repository layout (what exists now)

```
.env.example            all config keys (copied to .env by setup.ps1)
docker-compose.dev.yml  SQL Server 2022, Arabic collation, healthcheck, restart unless-stopped
CLAUDE.md               project rules (loaded automatically by Claude Code)
KICKOFF.md              the original kickoff prompt
README.md               how to run, scripts, database notes, troubleshooting
backend/
  requirements.txt / requirements-dev.txt / pytest.ini
  sql/001..008_*.sql    hand-written, numbered, idempotent T-SQL (source of truth for the schema)
  app/
    main.py             create_app(): routers, error handlers, serves frontend/dist in prod
    models.py           imports every models module (complete metadata; import before any query)
    cli/db_init.py      applies backend/sql in order (sqlcmd-style $(VAR) and GO)
    cli/create_admin.py first admin with every permission (--reset)
    core/  config, db, models (Base + core tables), security (hashing, sessions), permissions,
           audit, errors, messages (Arabic API errors), queries (paging, LIKE escape, constraint names),
           schemas (UtcDatetime, Page), health
    auth/               router/schemas/service: login, logout, me, change-password, permission-check
    admin/
      models.py         lookup tables
      users/ templates/ audit/ lookups/   router + schemas + service each
    modules/conscripts/ models.py, barcode.py
    modules/employees/  models.py
    documents/models.py, migration/models.py
  tests/                conftest (test DB), helpers, test_* (see §11)
frontend/
  src/main.tsx, index.html (dir="rtl" lang="ar")
  src/app/        providers (RTL cache, theme, query client, notifications), theme, routes, menu,
                  layout/AppLayout (sidebar + top bar), HomePage, useHealthQuery, app.test.tsx
  src/shared/     api/client.ts (+ generated schema.d.ts), auth/ (useMe, login/logout, RequireAuth),
                  permissions/ (usePermission, <Can>, <RequirePermission>), i18n/ar.ts, format.ts,
                  ui/ (icons, states, ErrorPages incl. UnderDevelopment, PageHeader, notifications, Barcode)
  src/features/   auth/ (Login, ChangePassword), admin/ (api, PermissionChecklist, users, templates,
                  audit, lookups, routes, paths), conscripts/ + employees/ (paths + placeholder routes)
  src/test/       render helpers (render the app as a given user, stub fetch)
scripts/          _common.ps1, setup.ps1, db-init.ps1, dev.ps1, test.ps1, gen-types.ps1, create-admin.ps1
docs/             permissions.md, business-rules.md, skeleton-plan.md, licenses.md, handoff.md (this)
```

---

## 6. Database

Run `scripts\db-init.ps1` (also run automatically by `dev.ps1` and `test.ps1`). It connects as `DB_ADMIN_USER` (sa in dev) and applies every `backend/sql/NNN_*.sql` in order. Scripts are idempotent; a DBA can also run them with `sqlcmd -I -f 65001 -v DB_NAME=... APP_DB_USER=... APP_DB_PASSWORD=...`.

| Script | Contents |
| --- | --- |
| `001_database.sql` | Creates DB `$(DB_NAME)` (default `personnel`) with `Arabic_100_CI_AS`; fails if it exists with another collation; turns on READ_COMMITTED_SNAPSHOT |
| `002_core.sql` | `fn_normalize_ar_name` (أ إ آ→ا, ة→ه, ى→ي, strip tatweel + diacritics; schemabound, created only if missing); `permission`, `app_user`, `user_permission`, `permission_template`, `template_permission`, `user_session`, `audit_log` |
| `003_permissions_seed.sql` | MERGE of all 27 permission codes (Arabic + English names, Arabic descriptions, sort order); the 6 seed templates, created only if missing (admin edits survive) |
| `004_lookups.sql` | `governorate` (12), `police_station` (24), `qualification` (4, with service months 14/26/20/38), `batch_schedule` (4: 1 Jan/1 Apr/1 Jul/1 Oct), `work_entity` + `action_type` (empty: no seed in spec). Insert-missing seeds. FK `app_user.work_entity_id` |
| `005_conscripts.sql` | `import_batch`, `conscript` (system-versioned → `conscript_history`), `import_row` (raw text of each file row + status + JSON `rejection_reasons`) |
| `006_employees.sql` | `migration_batch`, `migration_error`, `employee` and `job_action` (both system-versioned), `document` (VARBINARY in dev; FILESTREAM TODO for prod), `document_link` (real FKs to employee / job_action) |
| `007_app_login.sql` | Login + user `personnel_app`, role `app_role`: SELECT/INSERT/UPDATE/DELETE/EXECUTE on schema dbo; **DENY UPDATE, DELETE on audit_log**; **DENY INSERT/UPDATE/DELETE on permission**. Re-running resets its password to `.env` |
| `008_conscript_barcode.sql` | `conscript_barcode_seq`; `CK_conscript_barcode_format`; `CK_conscript_registered` now also requires a barcode; trigger `TR_conscript_barcode_immutable` |

Design points:
- All text `NVARCHAR` (including permission codes: pyodbc sends NVARCHAR parameters; VARCHAR columns would force implicit conversions).
- Every business table has `created_at/created_by/updated_at/updated_by`. Timestamps are **UTC** (`SYSUTCDATETIME()`); the API returns them with an offset; the UI shows local time.
- Constraint names are explicit (`PK_`, `FK_`, `UQ_`, `CK_`, `DF_`), so services map violations to Arabic messages (`core/queries.violated_constraint`).
- Digit checks use `COLLATE Latin1_General_BIN2` so Arabic-Indic digits (٠-٩) are rejected.
- **Filtered unique indexes** where NULLs must not collide: `(police_no, conscription_year) WHERE police_no IS NOT NULL`, `barcode WHERE barcode IS NOT NULL`, employee `national_id`/`employee_no` among non-deleted, `(source_system, source_key)`.
- Conscript constraints in place: national ID 14 ASCII digits + unique (R1, R2, R8); `end_date > start_date`; status `received|registered`; registered requires police number, dates, `locked_at`, barcode. R3–R6 are API-side (TODO(rules)).
- To change the schema later: **add a new numbered script**; never edit one that has run on a shared database. (002 was edited once during Phase 2 to fix a bug, on a dev-only database that was then rebuilt.)
- Tests use a separate database **`personnel_test`**, dropped and rebuilt from the scripts at the start of every pytest run. The dev database is never touched by tests.

---

## 7. Backend

**Config** (`app/core/config.py`, from `.env`): `ENV`, `DB_HOST/PORT/NAME/DRIVER/TRUST_SERVER_CERTIFICATE`, `DB_USER/DB_PASSWORD` (app login), `DB_ADMIN_USER/DB_ADMIN_PASSWORD` (db-init only), `SESSION_COOKIE_SECURE` (false in dev, **true in production with HTTPS**), `SESSION_IDLE_MINUTES` (30), `SESSION_MAX_HOURS` (12), `API_PORT`, `WEB_PORT`, `MSSQL_SA_PASSWORD`.

**Errors**: always `{"detail": "<Arabic>", "code": "<machine code>"}`. Arabic messages live in `app/core/messages.py`. 422 adds an `errors` list.

**Auth and sessions** (`core/security.py`, `auth/`): Argon2id hashing (rehash on login); unknown users take the same time as wrong passwords; the cookie `session` holds a random 32-byte token (HTTP-only, SameSite=Strict, Secure per config) and `user_session.id` stores its **SHA-256**; idle and absolute expiry; changing the password signs out other sessions; a user with `must_change_password` can only call me / logout / change-password (`403 password_change_required` elsewhere).

**Permissions** (`core/permissions.py`): `require_permission(*codes)` = must hold all codes; `require_permission()` = any signed-in user; `require_any_permission(*codes)` = at least one. A denial writes `audit_log(action='denied', entity='route', entity_id='GET /path', permission_code=<first missing>)` and commits before the 403. `has_permission(user, code)` for service-level scoping. `audit.write()` adds a row in the caller's transaction.

**API** (all under `/api/v1`):

| Method + path | Permission |
| --- | --- |
| `GET /health` | public |
| `POST /auth/login` | public |
| `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | signed in (allowed during a pending password change) |
| `POST /auth/permission-check {permission, path}` | signed in; 204 or 403 + audit (`entity_id='screen <path>'`). Used by the frontend route guard |
| `GET /permissions` | `users.view` or `templates.manage` |
| `GET /users?q=&is_active=&page=&page_size=` | `users.view` (search matches username or normalised Arabic name) |
| `GET /users/{id}` | `users.view` |
| `POST /users`, `PUT /users/{id}`, `PUT /users/{id}/permissions`, `POST /users/{id}/reset-password` | `users.manage` (cannot deactivate yourself or remove your own `users.manage`; deactivation and reset end the user's sessions; new and reset users must change password) |
| `GET /templates` | `users.manage` or `templates.manage` |
| `POST /templates`, `PUT /templates/{id}` | `templates.manage` |
| `GET /audit?user_id=&action=&entity=&date_from=&date_to=&page=&page_size=` | `audit.view` |
| `GET /audit/facets` | `audit.view` |
| `GET /lookups/{kind}` | signed in (dropdowns everywhere use them) |
| `POST /lookups/{kind}`, `PUT /lookups/{kind}/{row_id}` | `lookups.manage`. Kinds: `governorates`, `police-stations` (code must start with its governorate code), `qualifications`, `batch-schedules` (edit only), `work-entities`, `action-types` |

Every write is audited with old/new values (`create`, `update`, `update_permissions`, `reset_password`, `change_password`, `login`, `login_failed`, `logout`, `denied`, `reset_admin`).

**CLIs**: `python -m app.cli.db_init`, `python -m app.cli.create_admin [--username admin] [--reset]` (run from `backend/`, or use the PowerShell scripts).

---

## 8. Frontend

- **Shell**: `/login`; everything else inside `<RequireAuth>` + `AppLayout` (sidebar on the right, top bar with user menu: change password, logout). Temporary passwords are forced to `/change-password`. 403 and 404 pages. Mobile: drawer from the right.
- **Permissions in the UI**: `usePermission(code)`, `useAnyPermission(codes)`, `<Can perm|anyOf>`, `<RequirePermission perm>` (shows the 403 page and calls `POST /auth/permission-check` so the attempt is audited). The sidebar comes from `src/app/menu.ts`, where each item declares its permission; `visibleMenu()` filters it. Only codes are checked, never template names.
- **Routes**: `/`, `/change-password`, `/admin/users`, `/admin/users/new`, `/admin/users/:userId`, `/admin/templates`, `/admin/audit`, `/admin/lookups`; placeholders (قيد التطوير, already guarded): `/conscripts/imports/new` (conscripts.import.upload), `/conscripts/search` (conscripts.view), `/conscripts/entry` (conscripts.enter), `/conscripts/labels` (conscripts.label.print), `/employees` (employees.view), `/employees/imports` (employees.import), `/reports` (reports.view), `/migration` (migration.run).
- **Screens done**: users list (search, status filter, paging), user create/edit (details, work entity, active switch, permissions grouped by module with "apply template", reset password), templates (list + dialog editor), audit log (filters by user/action/item/date range, expandable rows with old/new values side by side, changed fields highlighted), lookups (6 tabs, add/edit dialogs with validation mirroring the API).
- **Data**: typed client `api` (openapi-fetch over `schema.d.ts`; base URL = same origin), `unwrap()` throws `ApiError(status, Arabic message, code)`. A 401 anywhere clears "me", so the guards send the user to login. Hooks per feature (`features/admin/api.ts`).
- **Text**: all Arabic strings in `src/shared/i18n/ar.ts`. Dates shown with `ar-EG-u-nu-latn` (Arabic text, Latin digits).
- **Barcode**: `src/shared/ui/Barcode.tsx` (see §10).
- After any backend API change: `scripts\gen-types.ps1` (builds the OpenAPI schema in-process; no server needed).

---

## 9. Permission model (summary)

27 codes in 3 modules (full table with Arabic names in `docs/permissions.md`):
- admin: `users.view`, `users.manage`, `templates.manage`, `lookups.manage`, `audit.view`
- conscripts: `conscripts.view`, `conscripts.enter`, `conscripts.edit_locked`, `conscripts.label.print`, `conscripts.import.upload`, `conscripts.import.approve`, `conscripts.import.export`
- employees: `employees.view`, `employees.scope.all`, `employees.create`, `employees.edit`, `employees.delete`, `employees.history.view`, `job_actions.create`, `documents.view`, `documents.upload`, `employees.import`, `reports.view`, `reports.export`, `migration.run`, `migration.rollback`, `backup.manage`

Seed templates: مدير النظام — المجندين (12 codes), مدخل بيانات — المجندين (3), مدير النظام — العاملين (20), موظف شئون العاملين (10), مستعلم (3), مراجع (5). A template only pre-fills the user form; applying copies its codes. Tests check that the seeded codes and templates match `docs/permissions.md` exactly.

---

## 10. Barcode (built)

The spec says the label shows the barcode, the four-part name, the police number and the conscription year, and that the barcode is created after enlistment data is entered. It does **not** say what the barcode encodes. Implemented proposal (**to confirm with the client**, recorded in `docs/business-rules.md#barcode`):

- Value: **12 digits = year (4) + batch (1) + sequence (7)**, e.g. `202630001234`, sequence from `dbo.conscript_barcode_seq`.
- Why: stable (independent of police number/name corrections), digits only (USB scanners work with the Arabic keyboard layout), even length (Code 128 subset C, compact), no personal data (rejected: national ID on labels; police number + year can change).
- `app/modules/conscripts/barcode.py`: `format_barcode()`, `is_valid_barcode()`, `assign_barcode(db, conscript)`. The enlistment save must call `assign_barcode()` in the same transaction that sets status `registered` (that save is not built yet). A conditional UPDATE (`WHERE barcode IS NULL`) makes racing saves of one record agree on one value.
- DB guards: format CHECK, unique index, registered requires barcode, trigger blocks changing an assigned barcode.
- Frontend `<Barcode value moduleMm=0.25 barHeightMm=10 showText>`: JsBarcode, Code 128C, sized in mm: 0.25 mm bars (2 dots at 203 dpi), 10-module quiet zones, ~30.25 mm wide for 12 digits, fits a 50 × 25 mm label. Digits printed under the bars.
- Tests: format rules, 40 parallel assignments with no duplicates, racing saves of one record, DB guards, SVG geometry.
- Not yet: the label screen (Phase 4), print CSS (`@page { size: 50mm 25mm; margin: 0 }`), a test with a real scanner. Tip: Chrome/Edge `--kiosk-printing` skips the print dialog at high-volume stations.

---

## 11. Scripts and tests

| Script | Purpose |
| --- | --- |
| `scripts\setup.ps1` | Idempotent: `.env` (generated passwords, free ports, adds new keys from `.env.example`), venv, pip install, npm install (`npm ci` only on a fresh checkout) |
| `scripts\db-init.ps1` | Start the DB container and apply `backend\sql` |
| `scripts\dev.ps1` | db-init, then backend (uvicorn --reload) and frontend (vite) in their own windows; skips a server whose port is already in use |
| `scripts\test.ps1` | db-init, then pytest, `tsc --noEmit`, vitest; exit 1 on failure |
| `scripts\gen-types.ps1` | Regenerate `schema.d.ts` from FastAPI |
| `scripts\create-admin.ps1` | First admin with every permission (`-Username`, `-Reset`) |

PowerShell scripts must stay **ASCII-only** (Windows PowerShell 5.1 misreads UTF-8 without BOM).

Backend tests (`backend/tests`): schema vs models sync, seeds vs docs, constraints, temporal history, Arabic normalisation, app login restrictions, db_init idempotency, auth flows, permission checks + audit, **route coverage** (every route has a permission except login and health; walks FastAPI's nested routers, cross-checks with OpenAPI, verifies anonymous requests get 401, has a self-test), admin APIs, create_admin, barcode. Frontend tests: menu filtering, guards (login redirect, 403 + audit call, forced password change, 404), login validation and Arabic errors, health status, barcode geometry.

---

## 12. Things verified by hand

- Live "done when" scenario for Phase 3 through the Vite proxy (script-driven): all steps passed.
- Screenshots (headless Edge driven over the DevTools protocol from a small Node script, signed in by setting the session cookie): admin pages, data-entry user sidebar, 403 page, audit log, lookups, mobile drawer. RTL layout and Cairo font correct.
- Reading the sample Access file with Python works:
  ```python
  pyodbc.connect("DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=<path>;ReadOnly=1;")
  # table person_data, 100 rows; id INTEGER, others text (LONGCHAR / VARCHAR); values arrive as str
  ```
- Production build: `npm run build` → `frontend/dist`; FastAPI serves it with SPA fallback; unknown `/api/...` stays a JSON 404. The bundle has no external URLs (offline OK).

---

## 13. Decisions made (and why)

1. **Permission codes only**, never roles; templates copy codes. `require_permission()` with no code = signed in; `require_any_permission` added for "users.manage or templates.manage" style reads.
2. **Session tokens stored hashed** (SHA-256), so a database read doesn't expose live sessions.
3. **Temporary passwords enforced on the server**, not just in the UI.
4. **Least-privilege app login** (`personnel_app`, script 007); sa is used only by db-init.
5. **Separate test database** rebuilt every run, because the app login can't delete audit rows (by design).
6. **Seeds don't overwrite admin edits** (templates and lookups insert-only; permission codes are owned by script 003).
7. **NVARCHAR everywhere**, including permission codes (deviation from the original "varchar 100" in permissions.md, which was updated).
8. **document_link with real FKs** (not an entity/entity_id pair), so a wrong link can't exist undetected.
9. **UTC storage, local display**; RCSI on.
10. **Lookup reads open to any signed-in user** (reference data for dropdowns); writes need `lookups.manage`.
11. **Admin self-protection**: can't deactivate yourself or remove your own `users.manage`.
12. **Frontend route guard reports blocked screens** to the backend so they reach the audit log (Phase 3 "done when" needs that).
13. **TypeScript pinned to 5.9.3**: TypeScript 7 (native) has no JS compiler API, which openapi-typescript needs.
14. **No `@mui/icons-material`** (large); a small set of Material icon paths (Apache-2.0) is inlined.
15. **Barcode design** as in §10 (proposal pending client confirmation).
16. **Spec files and the sample `.mdb` kept out of git** (possible real personal data).
17. **Cairo font (OFL-1.1)** accepted as a licence exception because CLAUDE.md names it.
18. **SQL script numbering follows `docs/skeleton-plan.md`** (CLAUDE.md and permissions.md were aligned to it).

---

## 14. Gotchas learned (save time next time)

- FastAPI 0.14x keeps included routers as nested `_IncludedRouter` objects, so `app.routes` shows no API routes. A naive route check passes vacuously (it did once). The coverage test handles this.
- T-SQL `LIKE '[^a-z._-]'`: a hyphen inside the class is read as a range. Put it first: `[^-a-z._]`.
- `DECLARE @s NVARCHAR = @x COLLATE ...` does not keep the collation; the variable takes the DB collation. Under Arabic collations diacritics are ignorable, so `REPLACE` matched wrong text. Put `COLLATE Latin1_General_BIN2` inside each `REPLACE`.
- Temporal tables: insert + update in one transaction produce a zero-length history row that `FOR SYSTEM_TIME ALL` hides; query `<table>_history` directly in tests.
- A `CREATE TABLE` permission error rolls back the whole transaction, not just a savepoint.
- `ALTER`-ing a schemabound function used by persisted computed columns fails; change it through a new script that drops and re-adds the columns.
- pyodbc reports errors from later statements in a batch only when you walk `cursor.nextset()`.
- Filtered unique indexes need `QUOTED_IDENTIFIER ON` (sqlcmd defaults it off, hence `-I`).
- `npm ci` deletes `node_modules` and fails with EPERM (-4048) while Vite is running.
- Windows PowerShell 5.1: native-command arguments lose embedded double quotes (use single quotes in inline Python), `Set-Content -Encoding UTF8` writes a BOM (docker compose and dotenv choke on it), redirecting native stderr with `$ErrorActionPreference='Stop'` throws.
- `python -I` ignores `PYTHONIOENCODING`; call `sys.stdout.reconfigure(encoding="utf-8")` to print Arabic.
- openapi-fetch captures `fetch` at creation; the client passes `fetch: (r) => globalThis.fetch(r)` so tests can stub it, and uses an absolute base URL because the test DOM rejects relative URLs.
- JsBarcode measures text with a canvas; jsdom has none, so tests mock `getContext`.
- MUI Drawer + RTL plugin: the temporary drawer opens from the right as intended (verified by screenshot). Write styles in LTR terms (`borderRight`); the plugin flips them.

---

## 15. Open questions for the client

These change validation results or saved data; the business logic can't be finished without them:

1. **R5, governorate code**: the file uses its own codes (Giza 03, Sharqia 12) but real national IDs use official codes (Giza 21, Sharqia 13). Compare the ID with the file's code, or map to official codes? (With the file's code, every real Giza ID would be rejected.)
2. **R7, duplicates inside the file**: reject both copies or keep the first? (Expected sample result "16 rejected" assumes both copies rejected.)
3. **Age**: 15 sample people are under 18. Reject, warn, or accept?
4. **End date**: start 1 Jan 2026 + 14 months → 1 Mar 2027, or 28 Feb 2027 (last day served)?
5. **Police number format**: digits only? length?
6. **Barcode**: confirm the 12-digit format; label printer model and label size.
7. **Production environment**: server OS (Windows needed for exporting rejected rows to Access via the Access driver), SQL Server version/edition (FILESTREAM), HTTPS, users' browser.

The user was offered an Arabic question sheet for the client (not written yet).

---

## 16. Pending decisions (waiting for the user)

1. **Phase 4 scope**: build only the stubbed skeleton (per plan), or also the **data-entry save** (lookup by national ID, police number, dates, save + lock, `assign_barcode()`, audit) and a real `GET /conscripts/{id}/label`, so barcodes can be seen end to end? That save is business logic, so it needs the user's explicit OK.
2. **Arabic question sheet** for the client (§15): write it?
3. Whether to start Phase 4 now (the skeleton doesn't depend on the client's answers).

---

## 17. What's next, in order

### 17.1 Phase 4: conscripts module, stubbed (`docs/skeleton-plan.md`)
Backend: router + Pydantic schemas + permission per endpoint; handlers return **501** with `TODO(rules): docs/business-rules.md#...`:

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

Needs `python-multipart` (Apache-2.0) for the upload; record it in `docs/licenses.md`. Map 501 to the "قيد التطوير" notice in the UI (`messages.NOT_IMPLEMENTED` exists).

Frontend (replace the placeholders; forms complete, wired to the typed client, "قيد التطوير" notice on 501): upload (file picker, batch 1–4, year), import report (counts, rejected rows with reasons, approve / cancel / export buttons each behind its permission), data entry (national ID lookup, read-only received data, police number, start/end dates, save), search (one box that also accepts scanner input + Enter, filters, results, open record), record view (edit button behind `conscripts.edit_locked`), label print (print-only CSS `@page 50mm 25mm`, uses `<Barcode>`). Done when every screen renders, every button respects its permission, tsc and tests pass. Then stop, commit, report.

### 17.2 Phase 5: employees module, stubbed
Same approach: list/search, detail with job actions + documents tabs, create/edit, record job action with attachment, imports, reports, migration runs (start, reconciliation report, rollback). Employee fields are an outline (my guess); confirm when the spec details arrive.

### 17.3 Conscripts business logic (when approved / answers arrive)
- Read `.mdb` via pyodbc + Access driver (works); stage rows exactly as received (`import_batch`, `import_row`, file SHA-256).
- Validation R1–R9 with **all** failing reasons per row (`docs/business-rules.md#validation-rules-upload`). Build a **synthetic test `.mdb`** with the same kinds of errors so the expected "16 rejected (ids 1, 2, 9, 27, 30, 36, 40, 59, 67, 68, 79, 83, 87, 88, 93, 97), 84 valid" can be tested on any machine.
- Approve (insert valid rows as `received`, audit with `batch_id`) / cancel.
- Export rejected rows: Excel with `openpyxl` (MIT); Access by copying an empty template `.mdb` and inserting via the Access driver (Windows only).
- Data entry: start date from `batch_schedule`, end date = start + `qualification.service_months` (client question 4), police number unique per year (Arabic: رقم الشرطة مسجل لنفس سنة التجنيد), lock on save, `assign_barcode()`.
- Search by national ID, police number + year, barcode (`is_valid_barcode`), normalised name.
- Label print screen.

### 17.4 Deliverables required by the spec, not yet planned
- **Deployment guide** (install and run, connect to the database).
- **Stored procedures / views** in the SQL scripts (spec lists "Indexes - Constraints - Stored Procedures / Functions - Views"); add meaningful ones while building the logic (e.g. a search view, an approval procedure).
- Later (plan's "Later"): backup/restore scripts (database + attachments, with a failure test), offline build kit (`wheelhouse/`, npm cache, `build.ps1`), employees migration pipeline and test dataset (1,000 employees, 3,000 job actions, 2,000 documents, 10 work entities, 10 users).

### 17.5 Smaller known gaps
- No login rate limiting / lockout yet (worth adding for a government system).
- `client_ip` ignores `X-Forwarded-For` until the production proxy is known.
- `SESSION_COOKIE_SECURE=true` and HTTPS for production.
- Pagination labels use Arabic-Indic digits (MUI locale) while dates use Latin digits; harmonise if the client cares.

---

## 18. How the user likes to work

- Phase by phase: build, run the checks, commit, then report and wait for approval (CLAUDE.md). The user accepted Phases 2 and 3 back to back to reach visible UI sooner.
- The user authorised installing whatever tools are needed ("download whatever u need").
- The user wants visible progress (UI) and practical answers; keep reports short, in English. App text is Arabic.
- Business logic only on explicit request (so far only barcode generation was requested).
