---
name: منظومة شئون الأفراد
colors:
  surface: '#f8f9ff'
  surface-dim: '#d2daeb'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff3ff'
  surface-container: '#e6eeff'
  surface-container-high: '#e1e8f9'
  surface-container-highest: '#dbe3f3'
  on-surface: '#141c28'
  on-surface-variant: '#43474e'
  inverse-surface: '#29313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#74777f'
  outline-variant: '#c4c6cf'
  surface-tint: '#465f86'
  primary: '#032448'
  on-primary: '#ffffff'
  primary-container: '#1f3a5f'
  on-primary-container: '#8ba4cf'
  inverse-primary: '#aec8f4'
  secondary: '#545f6e'
  on-secondary: '#ffffff'
  secondary-container: '#d8e3f5'
  on-secondary-container: '#5a6574'
  tertiary: '#342000'
  on-tertiary: '#ffffff'
  tertiary-container: '#503400'
  on-tertiary-container: '#c69d60'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#aec8f4'
  on-primary-fixed: '#001c3b'
  on-primary-fixed-variant: '#2d476d'
  secondary-fixed: '#d8e3f5'
  secondary-fixed-dim: '#bcc7d9'
  on-secondary-fixed: '#111c29'
  on-secondary-fixed-variant: '#3d4856'
  tertiary-fixed: '#ffddb0'
  tertiary-fixed-dim: '#ecbf7f'
  on-tertiary-fixed: '#281800'
  on-tertiary-fixed-variant: '#5f410c'
  background: '#f8f9ff'
  on-background: '#141c28'
  surface-variant: '#dbe3f3'
typography:
  headline-lg:
    fontFamily: Cairo
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Cairo
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Cairo
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Cairo
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Cairo
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-table:
    fontFamily: Cairo
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Cairo
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Cairo
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  code-num:
    fontFamily: monospace
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.5rem
  margin: 1.5rem
  margin-compact: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system serves an Egyptian governmental agency's internal personnel management platform (منظومة شئون الأفراد). The core design identity is rooted in sober administrative authority, operational clarity, and institutional trust. It prioritizes utilitarian efficiency over consumer appeal, minimizing cognitive fatigue for civil servants processing high-volume records throughout extended shifts.

### Design Movement & Aesthetic Direction
- **Style:** High-Density Institutional Utilitarianism.
- **RTL-First Principle:** Right-to-left layout geometry governs all information hierarchy, navigation flows, and visual cues.
- **Atmosphere:** Calm, structured, predictable, and devoid of marketing ornamentation, gradients, or decorative flair.
- **Visual Weight:** Grounded by authoritative deep navy surfaces, crisp structured borders, and high-legibility typographic alignment optimized for Arabic text processing.

## Colors

The palette establishes formal institutional gravity with stark functional separation between canvas, structural chrome, and status communication.

### Structural & Core Tokens
- **Background (`#F6F7F9`):** Neutral cool gray for the application canvas, distinguishing work areas from raised sheets.
- **Surfaces (`#FFFFFF`):** High-density workspace elements (cards, fixed sidebar, topbar, and data tables).
- **Primary Navy (`#1F3A5F`):** Used for primary interactive triggers, active navigation markers, and authoritative anchor elements.
- **Primary Hover (`#2B4C7E`):** Distinct interactive state providing visual confirmation under pointer devices.
- **Text Main (`#1C2430`):** Near-black neutral ensuring WCAG AAA legibility against white containers.
- **Text Secondary (`#5B6675`):** Reserved for meta-labels, secondary details, timestamps, and column headers.
- **Borders & Dividers (`#E3E6EB`):** Crisp 1px structural partitions defining tables, inputs, and container boundaries without shadows.

### Status Tonal Pairs (Badges & Alerts)
Semantic notifications utilize muted backgrounds paired with saturated, high-contrast foreground glyphs and text:
- **Success / Valid:** Foreground `#1E7F4F` on Background `#E8F5EE` (Approved leaves, active service status).
- **Error / Rejected:** Foreground `#B42318` on Background `#FEE4E2` (Disciplinary actions, invalid civil IDs, rejected requests).
- **Warning / Pending:** Foreground `#B54708` on Background `#FEF0C7` (Promotions awaiting review, expiring clearances).
- **Information:** Foreground `#175CD3` on Background `#EFF4FF` (System notices, administrative circulars).

## Typography

The typography is built around Google Font **Cairo** to ensure baseline metrics, diacritic rendering, and balanced Arabic text rhythm across bureaucratic tables and dashboards.

### Rules & Formatting
- **Numerals:** All numerical entries (National IDs / الرقم القومي, military ranks, personnel codes, salaries, and dates) strictly employ Western digits (`1, 2, 3...`) rendered in tabular or monospaced font stacks (`code-num`) for clear columnar alignment.
- **Headings:** Bold and semibold weights (600) are reserved strictly for page titles (`headline-lg`), modular headers (`headline-md`), and modal titles (`headline-sm`).
- **Body & Dense Tables:** Standard application body copy resolves at `14px` (`body-md`), whereas high-volume administrative tables compress to `13px` (`body-table`) with a strict `20px` line-height to maximize visible vertical records per screen.
- **Letter Spacing:** Fixed to `normal` or `0` across Arabic text runs to avoid breaking cursive letter connections.

## Layout & Spacing

The layout is strictly anchored to an **8px base grid** designed for dense administrative utility.

### Shell Architecture
- **Right Sidebar (القائمة الجانبية):** Fixed to the right edge with a constant width of `240px`, a background of `#FFFFFF`, and an inner left border of `1px solid #E3E6EB`.
- **Topbar (الشريط العلوي):** Height fixed at `64px`, stretching from the left screen boundary to the right sidebar. Hosts page titles and hierarchical breadcrumbs on the right, global search in the center, and the user profile menu on the far left.
- **Main Canvas:** Background `#F6F7F9` with default internal padding of `24px` (`space-lg`), reducing to `16px` (`space-md`) on smaller desk monitors.
- **Grid Density:** Complex search forms and civil servant record layouts use 12-column or 6-column fluid grids with `16px` gutters (`gutter`), compressible to `8px` (`gutter-dense`) inside nested operational panels.

## Elevation & Depth

This design system avoids heavy drop shadows and floating skeuomorphic depth, relying on flat surfaces and explicit structural lines.

- **Flat Border Paradigm:** Depth is communicated through planar separation via `1px solid #E3E6EB` borders and surface color shifts (`#F6F7F9` page ground versus `#FFFFFF` containers).
- **Z-Index Hierarchy:**
  - `0`: Background canvas (`#F6F7F9`).
  - `10`: Surface cards, data grids, toolbars (`#FFFFFF`).
  - `20`: Fixed structural elements (Right Sidebar, Topbar).
  - `30`: Sticky table column headers during vertical scrolling.
  - `40`: Dropdown menus, tooltips, autocompletes (shadow: `0 2px 4px rgba(0, 0, 0, 0.06)`).
  - `50`: Modal dialogs and overlay backdrops.

## Shapes

The geometric framework is uniform and restrained:
- **Baseline Metric:** All interactive controls (buttons, inputs, select fields), cards, badges, and modals share an exact `8px` (`0.5rem`) border radius.
- **Data Table Cells & List Items:** 0px radius inside dense grids to preserve linear alignment across borders.
- **Pill Exceptions:** Rounded-full styling is barred across the interface to prevent visual informality, with the exception of circular user avatar placeholders.

## Components

### Buttons
- **Primary:** Background `#1F3A5F`, text `#FFFFFF`, radius `8px`, height `36px`, horizontal padding `16px`. Hover: `#2B4C7E`. Focus: outline `2px solid #1F3A5F` with `2px` offset.
- **Secondary (Outline):** Background `#FFFFFF`, border `1px solid #E3E6EB`, text `#1C2430`. Hover: `#F6F7F9`.
- **Destructive:** Background `#FEE4E2`, border `1px solid #B42318`, text `#B42318`. Hover: background `#B42318`, text `#FFFFFF`.

### Input Fields & Controls
- **Height & Padding:** Standard height `36px`, horizontal padding `12px`, typography `14px Cairo`.
- **Borders:** `1px solid #E3E6EB`, background `#FFFFFF`. Active focus transitions border to `#1F3A5F`.
- **Text Alignment:** Right-aligned for Arabic text fields; Left-aligned with monospaced typography for National IDs, IBANs, phone numbers, and civil service codes.
- **Labels:** Positioned strictly above fields, `13px Cairo`, weight `500`, color `#1C2430`.

### Data Tables (جداول البيانات)
- **Header Cells (`<th>`):** Height `40px`, background `#F6F7F9`, border-bottom `1px solid #E3E6EB`, color `#5B6675`, font size `13px Cairo`, font weight `600`, text-align `right`.
- **Body Rows (`<td>`):** Height `44px`, border-bottom `1px solid #E3E6EB`, color `#1C2430`, font size `13px Cairo`. Alternating rows remain `#FFFFFF` with hover state `#F6F7F9`.
- **Numeric Columns:** Pinned or aligned with monospaced digit formatting.

### Status Badges
- **Structure:** Height `24px`, padding `0 8px`, border radius `8px`, font size `12px Cairo`, font weight `500`.
- **Variants:**
  - *Active / معتمد:* Bg `#E8F5EE`, Text `#1E7F4F`.
  - *Suspended / مرفوض:* Bg `#FEE4E2`, Text `#B42318`.
  - *Under Review / قيد الانتظار:* Bg `#FEF0C7`, Text `#B54708`.
  - *Transferred / ملاحظة:* Bg `#EFF4FF`, Text `#175CD3`.

### Selection Controls (Checkboxes & Radios)
- Box dimensions `16x16px`, border `1px solid #5B6675`, radius `4px` (checkbox) / `50%` (radio). Checked state background `#1F3A5F` with `#FFFFFF` inner indicator.