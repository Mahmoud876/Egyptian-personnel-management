# Personnel Systems: Conscripts & Civilian Employees

Two government web apps on one shared core (FastAPI + SQL Server + React/MUI RTL). Built as PoCs for a tender.

- Project rules and stack: [CLAUDE.md](CLAUDE.md)
- Build plan: [docs/skeleton-plan.md](docs/skeleton-plan.md)
- Permission model: [docs/permissions.md](docs/permissions.md)
- Business rules: [docs/business-rules.md](docs/business-rules.md)
- Dependency licences: [docs/licenses.md](docs/licenses.md)

## Prerequisites (Windows)

- Git
- Python 3.12 (with the `py` launcher)
- Node.js 22+ LTS (24 recommended); only needed to build the frontend
- Docker Desktop (Linux containers)
- Microsoft ODBC Driver 18 for SQL Server

With winget:
```powershell
winget install Python.Python.3.12 OpenJS.NodeJS.LTS Microsoft.msodbcsql.18 Docker.DockerDesktop Git.Git
```

## Run

```powershell
scripts\dev.ps1
```

On first run this creates `.env` from `.env.example` with a generated database password and free ports, creates `backend\.venv`, and installs backend and frontend dependencies. Then it starts SQL Server in Docker, waits until it is healthy, and opens two windows: the backend (uvicorn with reload) and the frontend (Vite).

- App: `http://localhost:<WEB_PORT>` (default 5173)
- Health: `http://localhost:<API_PORT>/api/v1/health`
- API docs (dev only): `http://localhost:<API_PORT>/docs`

Ports are in `.env`. If 8000 is taken, setup picks the next free port.

Stop: close the two windows; `docker compose -f docker-compose.dev.yml stop` stops the database (data stays in the `personnel-dev_mssql-data` volume).

## Scripts

| Script | What it does |
| --- | --- |
| `scripts\setup.ps1` | Idempotent setup: `.env`, venv, `pip install`, `npm ci`. Called by the others |
| `scripts\dev.ps1` | Starts the DB, backend and frontend |
| `scripts\test.ps1` | Starts the DB, then runs pytest, `tsc --noEmit` and vitest. Exits 1 on any failure |
| `scripts\gen-types.ps1` | Regenerates `frontend/src/shared/api/schema.d.ts` from the FastAPI OpenAPI schema (no running server needed) |

If PowerShell refuses to run scripts: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or run with `powershell -ExecutionPolicy Bypass -File scripts\dev.ps1`.

## Production build (outline)

`npm run build` in `frontend/` produces `frontend/dist`; when that folder exists the backend serves it at `/` with client-side routing fallback, and the API stays under `/api/v1`. Set `ENV=prod` to disable the OpenAPI docs. A full offline deployment kit comes later (see the plan).

## Troubleshooting

- **`SRE module mismatch` or Python fails to start**: another program set `PYTHONHOME` machine-wide (ZKBioTime does). The scripts clear it for their own process. In your own terminal: `Remove-Item Env:PYTHONHOME` before running Python.
- **Backend can't reach the DB at `localhost`**: use `DB_HOST=127.0.0.1`. `localhost` resolves to IPv6 `::1` first and the container port is bound to IPv4 only.
- **VS Code says packages aren't installed**: select `backend\.venv\Scripts\python.exe` as the interpreter.
- **The original specs and `Person_data_S.mdb` aren't in git**: on purpose. The sample may contain real personal data. Keep them in the repo root locally; they are gitignored.
