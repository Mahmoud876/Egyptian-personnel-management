# Dependency licences

Rule (CLAUDE.md): only MIT, BSD, Apache-2.0 or ISC. Every direct dependency is listed here with its version, licence and reason. Exceptions are listed explicitly at the end.

Check again after adding a dependency:
- Backend: `backend\.venv\Scripts\python.exe -c "import importlib.metadata as m; [print(d.metadata['Name'], d.metadata.get('License-Expression') or d.metadata.get('License')) for d in m.distributions()]"`
- Frontend: walk `npm ls --all --parseable --omit=dev` and read each package's `package.json` `license` field.

## Backend, runtime (`backend/requirements.txt`)

| Package | Version | Licence | Why |
| --- | --- | --- | --- |
| fastapi | 0.143.0 | MIT | Web framework |
| uvicorn | 0.54.0 | BSD-3-Clause | ASGI server |
| sqlalchemy | 2.1.4 | MIT | DB access (sync, 2.0-style API) |
| pyodbc | 5.3.0 | MIT | ODBC driver binding for SQL Server |
| pydantic | 2.14.1 | MIT | Request/response validation |
| pydantic-settings | 2.15.0 | MIT | Config from `.env` |

Notable transitive: starlette (BSD-3-Clause), anyio (MIT), opentelemetry-api (Apache-2.0, pulled in by fastapi), python-dotenv (BSD-3-Clause), **typing_extensions (PSF-2.0)**.

## Backend, dev (`backend/requirements-dev.txt`)

| Package | Version | Licence | Why |
| --- | --- | --- | --- |
| pytest | 9.1.1 | MIT | Test runner |
| httpx2 | 2.13.1 | BSD-3-Clause | HTTP client behind FastAPI's `TestClient` (Starlette 1.x prefers it over `httpx`) |

Transitive: httpcore2 (BSD-3-Clause), truststore (MIT), pluggy (MIT), iniconfig (MIT), Pygments (BSD-2-Clause), packaging (Apache-2.0 OR BSD-2-Clause).

## Frontend, runtime (`frontend/package.json` dependencies)

| Package | Version | Licence | Why |
| --- | --- | --- | --- |
| react, react-dom | 19.3.0 | MIT | UI library |
| @mui/material | 9.5.0 | MIT | Component library |
| @emotion/react | 11.14.0 | MIT | MUI styling engine |
| @emotion/styled | 11.14.1 | MIT | MUI styling engine |
| @emotion/cache | 11.14.0 | MIT | Custom cache for the RTL stylis plugin |
| stylis | 4.4.0 | MIT | CSS preprocessor used by emotion (`prefixer`) |
| stylis-plugin-rtl | 2.1.1 | MIT | Flips styles for RTL |
| @fontsource/cairo | 5.3.0 | **OFL-1.1** | Cairo font, bundled locally (no Google Fonts). See exceptions |
| react-router | 8.4.0 | MIT | Routing |
| @tanstack/react-query | 5.104.2 | MIT | Server state / data fetching |

Full production tree (94 packages): MIT 87, BSD-3-Clause 3, ISC 2, Apache-2.0 1, OFL-1.1 1 (Cairo).

## Frontend, dev (`frontend/package.json` devDependencies)

| Package | Version | Licence | Why |
| --- | --- | --- | --- |
| typescript | 5.9.3 | Apache-2.0 | Type checking. Pinned to 5.x: TypeScript 7 (native) has no JS compiler API, which openapi-typescript needs |
| vite | 8.3.4 | MIT | Dev server and bundler |
| @vitejs/plugin-react | 6.1.2 | MIT | React support for Vite |
| vitest | 5.0.4 | MIT | Test runner |
| jsdom | 30.1.2 | MIT | DOM environment for component tests |
| @testing-library/react | 16.3.3 | MIT | Component test helpers |
| @testing-library/dom | 10.4.2 | MIT | Peer of @testing-library/react |
| openapi-typescript | 7.13.0 | MIT | Generates `schema.d.ts` from FastAPI's OpenAPI |
| @types/react, @types/react-dom | 19.3.0 | MIT | Types |
| @types/stylis | 4.2.7 | MIT | Types |
| @types/node | 24.19.2 | MIT | Types for `vite.config.ts` |

Build-time transitive licences outside the allow-list (not shipped in the bundle): lightningcss (MPL-2.0, Vite's CSS tooling), lru-cache (BlueOak-1.0.0), argparse (Python-2.0), mdn-data (CC0-1.0), @csstools/* (MIT-0), type-fest (MIT OR CC0-1.0). All permissive or file-level copyleft used unmodified.

## Dev tools (installed on the machine, not shipped)

| Tool | Version | Licence | Why |
| --- | --- | --- | --- |
| SQL Server 2022 container (`mcr.microsoft.com/mssql/server:2022-latest`, Developer edition) | 2022 | Microsoft EULA (Developer edition: dev/test only) | Dev database. Production uses the client's licensed on-prem SQL Server |
| Microsoft ODBC Driver 18 for SQL Server | 18.7.1.1 | Microsoft licence (redistributable) | Required by pyodbc |
| Python | 3.12.10 | PSF-2.0 | Backend runtime |
| Node.js | 24.20.0 LTS | MIT | Frontend build only; not needed at runtime |

## Exceptions to the licence rule

| Package | Licence | Status |
| --- | --- | --- |
| @fontsource/cairo | OFL-1.1 (SIL Open Font License) | Named explicitly in the CLAUDE.md stack; treated as approved. OFL allows bundling and redistribution with the app; the font may not be sold on its own. |
| typing_extensions (transitive, Python) | PSF-2.0 | Unavoidable: required by pydantic, fastapi, sqlalchemy. Permissive. |
