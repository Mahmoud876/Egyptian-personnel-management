# Personnel Systems — Conscripts & Civilian Employees

Two government web apps on one shared core, built as PoCs for a tender:

1. **Conscripts affairs (منظومة شئون المجندين)**: receive conscript files from the Armed Forces (Access `.mdb`), validate them, register enlistment data, print barcode labels. PoC deadline: 5 days.
2. **Civilian employees (منظومة العاملين المدنيين)**: migrate from Oracle 11g to SQL Server, employee records, job actions with decision documents, simulated e-archive, reports.

Original specs are in this folder: `مجندين.docx`, `العاملين المدنيين POC.pdf`, sample input `Person_data_S.mdb`.
Read before working on a module:
- `docs/permissions.md`: the permission model and every permission code
- `docs/business-rules.md`: validation rules, date rules, lookups
- `docs/skeleton-plan.md`: the phased build plan and what "done" means for each phase

## Current goal

Build the **skeleton** described in `docs/skeleton-plan.md`, one phase at a time. Stop after each phase, report what was built and how to run it, and wait for approval before starting the next.

Skeleton means: the shared core works end to end (login, permissions, users, audit), and every module has its routes, schemas, screens and DB tables in place, with business logic left as stubs (`501 Not Implemented` on the API, a placeholder on the screen) and a `TODO(rules):` comment that points to the relevant section of `docs/business-rules.md`. **Do not implement module business logic unless asked.** Mahmoud builds it, or we build it together module by module.

## Stack

| Layer | Choice |
| --- | --- |
| Database | SQL Server 2022. `NVARCHAR` for all text, collation `Arabic_100_CI_AS` |
| DB scripts | Hand-written T-SQL in `backend/sql/`, numbered (`001_database.sql`, `002_core.sql`… as listed in `docs/skeleton-plan.md`), idempotent (`IF NOT EXISTS`) |
| Backend | Python 3.12, FastAPI, Uvicorn, SQLAlchemy 2.x (sync, 2.0-style API), `pyodbc` + ODBC Driver 18, Pydantic v2, `pydantic-settings` |
| Auth | Server-side sessions: random session id in an HTTP-only, SameSite=Strict cookie, row in `user_session`. Passwords hashed with `pwdlib` (Argon2) |
| Frontend | React 19, TypeScript 5.9 (strict; not 7, openapi-typescript needs the JS compiler API), Vite, MUI with RTL (`@emotion/cache` + `stylis-plugin-rtl`), React Router, TanStack Query, React Hook Form + Zod |
| Fonts | `@fontsource/cairo` (bundled locally) |
| API types | `openapi-typescript` generates `frontend/src/shared/api/schema.d.ts` from FastAPI's `/openapi.json` |
| Tests | `pytest` + `httpx2` via FastAPI `TestClient` (backend), `vitest` + Testing Library + jsdom (frontend) |
| Dev DB | `docker-compose.dev.yml` running `mcr.microsoft.com/mssql/server:2022-latest`. Dev only; production is on-prem |

## Hard rules

- **Permission-based, never role-based.** Code checks permission codes only (`conscripts.import.upload`), never a role or template name. See `docs/permissions.md`.
- **Every API route declares a permission** with `Depends(require_permission("..."))`, except `POST /api/v1/auth/login`, `GET /api/v1/health`. A test enforces this (see plan, phase 2).
- **The frontend hides what the user can't do, but the backend is what enforces it.** Never rely on the UI alone.
- **Denied attempts are audited.** `require_permission` writes an `audit_log` row with `action='denied'` before raising 403.
- **Fully offline.** No CDN links, no Google Fonts, no external calls at runtime. Every asset is bundled. The app must run on an intranet with no internet.
- **Arabic-first UI, RTL.** All user-facing text is Arabic and lives in `frontend/src/shared/i18n/ar.ts` (one place, no hard-coded strings in components). Code, identifiers, comments, commits: English.
- **Licences:** only MIT, BSD, Apache-2.0 or ISC dependencies. Record every new dependency in `docs/licenses.md` (name, version, licence, why). Ask before adding anything heavy.
- **Validation lives in both layers:** Pydantic in the API, and `CHECK`/`UNIQUE`/FK constraints in SQL Server.
- **No secrets in code.** Config from `.env` (commit only `.env.example`).
- Target OS for dev is **Windows**: provide PowerShell scripts in `scripts/` (`setup.ps1`, `dev.ps1`, `test.ps1`, `gen-types.ps1`), not only bash. Keep `.ps1` files ASCII-only (Windows PowerShell 5.1 misreads UTF-8 without a BOM).

## Project layout

```
backend/
  app/
    main.py            # app factory, routers, static files (serves frontend/dist in prod)
    core/              # config, db, security (sessions, hashing), permissions, audit, errors
    admin/             # users, permission assignment, templates, audit viewer, lookups
    modules/
      conscripts/      # router.py, schemas.py, service.py, models.py
      employees/
    imports/           # shared upload -> stage -> validate -> approve/reject -> export pipeline
    documents/         # attachments, SHA-256
    reports/
    migration/         # Oracle 11g -> SQL Server
  sql/                 # numbered T-SQL scripts
  tests/
frontend/
  src/
    app/               # router, providers, layout (RTL shell, sidebar, top bar)
    shared/            # api client + generated types, auth, permissions (usePermission, <Can>), i18n, ui
    features/
      admin/           # users, permissions editor, templates, audit log, lookups
      conscripts/
      employees/
docs/
scripts/
```

## Conventions

- API under `/api/v1`, JSON, snake_case fields. Errors: `{ "detail": "...", "code": "..." }` with Arabic `detail` for user-facing errors.
- One router per module; services hold logic, routers stay thin.
- DB: table names singular snake_case (`app_user`, `conscript`). Every business table has `created_at`, `created_by`, `updated_at`, `updated_by`.
- Frontend: feature folders own their routes, API hooks (`useXxxQuery`) and screens. Route guard: `<RequirePermission perm="...">`. Menu items declare the permission that shows them.
- Commit after each completed step with a clear message. Run backend tests and `tsc --noEmit` before committing.
