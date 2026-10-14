# UI design system

The frontend follows the Stitch design in `stitch_egyptian_personnel_management_system/` (`DESIGN.md` plus one `code.html`/`screen.png` per screen). The Stitch HTML is a reference only: it loads Tailwind, Google Fonts and Material Symbols from CDNs, which the offline rule forbids. Nothing from it is loaded at runtime.

## Where things live

| Concern | File |
| --- | --- |
| Colour tokens, status tones, monospace stack | `frontend/src/shared/ui/tokens.ts` |
| MUI theme (palette, type scale, component overrides) | `frontend/src/app/theme.ts` |
| Icons (Material outlined paths as inline SVG) | `frontend/src/shared/ui/icons.tsx` |
| Shell: 240px sidebar, 64px top bar, breadcrumbs | `frontend/src/app/layout/AppLayout.tsx`, `app/menu.ts` |
| Building blocks | `shared/ui/PageHeader`, `SectionCard`, `StatCard`, `StatusBadge`, `TablePager`, `ConfirmDialog`, `DataText` (`Mono`, `KeyValue`), `InitialsAvatar`, `Emblem` |

## Rules of thumb

- Navy `#1f3a5f` for primary actions and the active menu item; page ground `#f8f9ff`; white sheets with a 1px border, no shadows.
- 8px radius on controls, cards and badges. Only avatars are round.
- Labels sit above fields. The theme turns MUI's floating label into a static one, so plain `<TextField label=…>` already looks right.
- Status uses tonal pairs (`tones` in `tokens.ts`): `StatusBadge tone="success|error|warning|info|primary|neutral"`.
- IDs, codes, dates and counts use Western digits in `<Mono>`, which also isolates them left-to-right inside Arabic text. Don't use the monospace font inside inputs: Arabic placeholders render badly in it.
- Letter spacing stays 0 everywhere (it breaks cursive joins).
- Write styles in LTR terms (`borderRight`, positive `inset` shadows); the stylis RTL plugin flips them.
- Don't add a plain `::placeholder` selector to emotion styles: the stylis prefixer in this setup crashes on it.
- Every string goes in `shared/i18n/ar.ts`.

## Screen map

| Stitch screen | Route | Notes |
| --- | --- | --- |
| 7 login | `/login` | |
| 9 dashboard | `/` | Database totals, including status-filtered counts across all imports. History and counters refresh every 10 seconds. |
| 11 upload | `/conscripts/imports` | Upload form and history |
| 5 review modal | `/conscripts/imports/:id` | Live progress, valid/rejected rows, field-specific errors, full row inspection, administrator corrections and revalidation before approval, cancel, export rejected rows |
| 10 search | `/conscripts/search` | Criteria in the URL; the top-bar search lands here |
| 3 enlistment entry | `/conscripts/entry`, `/conscripts/entry/:id` | Initial date suggestions from the backend; both dates editable. Changing start preserves end (FR-18); save validates the qualification duration (FR-20). |
| 1 label printing | `/conscripts/labels`, `/conscripts/labels/:id` | Preview drawn locally; printing uses the backend's label page, which is audited |
| 4 permissions | `/admin/users/:id` | Read-only: permissions derive from the role |
| 8 audit | `/admin/audit` | Change comparison panel; global text search (`q`) is wired |
| 2, 6 (employees, migration) | — | Not built: civilian employee workflows are outside the current scope |

Stitch content without a backing feature (printer status, blockchain/SHA certificates, "remember this workstation", password reset requests, bulk barcode printing) was deliberately left out rather than faked.

Recruit governorate names use `/api/v1/lookups/official-governorates`, the same official codes used for national-ID validation. The older administrative governorate table is separate. Stream updates validate job identity and increasing progress versions; polling remains the fallback. Export polling errors are visible and retryable.

`backend/tests/test_frontend_live.py` starts a temporary FastAPI server, Vite proxy and RQ worker using the isolated test database. It drives the actual React upload/review/export/approval/entry/search/label screens in jsdom with real HTTP requests and session cookies. Only canvas text measurement is emulated. It verifies persisted profiles, role denial, an XLSX download, backend label HTML and audit records. It does not verify browser layout or a physical printer.
