# SlugEats

UCSC dining hall macro tracker. Two parts:

- **Backend** (repo root, `app/`) — FastAPI + Playwright, scrapes live menu and
  nutrition data off UCSC Dining's real site.
- **Frontend** (`frontend/`) — Vite + React + TypeScript, the actual app:
  Menu / Today / Goals / History, responsive from a phone-width browser up to
  a full desktop layout, styled after native iOS/macOS.

## Data source

UCSC Dining runs **CBORD FoodPro** at <https://nutrition.sa.ucsc.edu/> — not a
REST API. It's classic ASP.NET WebForms with server-side session state and
pages that 500 if requested out of order, so the backend drives a real
headless browser (Playwright) instead of hand-rolling HTTP/cookies.

Key findings from testing against the live site (see `app/config.py` and
`app/foodpro_scraper.py` for the full detail):

- Hitting `longmenu.aspx` cold (no prior page load in that browser session)
  returns HTTP 500 every time — a landing-page visit has to happen first to
  establish session state.
- Recipe nutrition labels (`label.aspx`) are keyed **only** by a recipe id,
  identical across every hall and date — so nutrition is cached globally and
  permanently, not per hall/day. Menu listings, which do vary by hall/date/
  meal, get a much shorter TTL.
- There are **four** dining halls (John R. Lewis & College Nine, Cowell &
  Stevenson, Crown & Merrill, Rachel Carson & Oakes) plus three cafes/markets
  — not five, and there's no Porter/Kresge location in FoodPro.

## Quick start (local dev, both parts)

**Backend:**

```bash
cd slugmacros                  # repo root — see note on the folder name below
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium    # REQUIRED — pip alone doesn't ship the browser
uvicorn app.main:app --reload  # http://localhost:8000
```

Offline / no-browser mode: `USE_MOCK_DATA=1 uvicorn app.main:app --reload`.

**Frontend** (separate terminal):

```bash
cd frontend
cp .env.example .env.local     # defaults to http://localhost:8000
npm install
npm run dev                    # http://localhost:5173
```

Open `http://localhost:5173` — that's the actual app.

## Backend endpoints

- `GET /locations` — `{dining_halls: {...}, cafes_markets: {...}}`, grouped
  for the frontend's location switcher
- `GET /halls` — flat `{slug: name}`, dining halls only (`?include_cafes=true`
  for everything) — kept for backward compatibility, `/locations` is what the
  frontend actually uses
- `GET /menu/{hall_id}?menu_type=lunch&date=2026-09-01` — one hall's menu with
  full macros
- `GET /menu?menu_type=lunch&date=...` — all halls at once
- `GET /search?q=chicken&menu_type=lunch&date=...` — cross-hall search
- `POST /tray/totals`, `POST /suggest` — left over from an earlier iteration;
  harmless, unused by the current frontend (it computes totals client-side
  from its own log), kept since nothing asked for their removal

Caching, pacing, and the exact scrape mechanics are documented in
`app/foodpro_scraper.py` and `app/config.py`.

## Frontend architecture

Plain Vite + React + TypeScript — no Next.js, no CSS framework, no state
library beyond React context. Deliberately minimal given the app's size.

- **Responsive strategy**: one codebase, one CSS breakpoint (900px). Below it:
  bottom tab bar, single-column stacked layout — the same visual language as
  a native iOS app. At/above it: top nav, side-by-side grids. Both the
  desktop top-nav and mobile tab-bar are always in the DOM; CSS `display`
  shows exactly one per breakpoint (elements hidden via `display: none` are
  already excluded from the tab order and accessibility tree, so this isn't
  an a11y issue, just two nav renderings for one router state).
- **`src/context/`** — `ThemeContext` (auto/light/dark, mirrors
  `prefers-color-scheme` when auto), `GoalsContext` (the four numbers),
  `LogContext` (the food log), `MenuSelectionContext` (what the Menu tab is
  currently browsing). All persisted through one seam:
- **`src/storage/keyValueStore.ts`** — every persisted read/write goes through
  this one module instead of touching `localStorage` directly, specifically
  so a future move to real accounts is a contained change here, not a rewrite
  across contexts/components. See its header comment for the reasoning.
- **`src/api/`** — typed fetch wrappers around the backend, base URL from
  `VITE_API_BASE_URL`.
- **`src/components/today/TripleRing.tsx`** — the Apple-Fitness-style ring.
  Outer→inner: Calories (rose) → Carbs (sage) → Fat (navy light-mode / sky
  dark-mode via the `--accent` token). Protein has no ring — legend-only,
  matching Apple's own 3-ring cap for readability.
- **`src/pages/HistoryPage.tsx`** + **`src/utils/history.ts`** — daily/weekly
  aggregation over the log, Line (7/30 day) and Bar (4/8 week) views via
  Recharts, with a "keep logging" empty state below 3 logged days.

## Product decisions made along the way

A few things the spec left as calls to make, decided and recorded here so
they're not silently arbitrary:

- **Log date is always real "today"**, regardless of what date you're
  browsing on the Menu tab. Browsing tomorrow's dinner menu to plan ahead and
  tapping **+** logs it under today, not tomorrow — the Menu tab's date field
  is a menu-preview control only, never a log backdating control.
- **Goals/log/history persist to `localStorage`, not Supabase**, since there's
  no auth system — without real accounts, "server-side" storage would still
  just be keyed by a random per-browser id, i.e. localStorage with extra
  latency and infra for no actual cross-device benefit yet. Revisit once
  accounts exist; `keyValueStore.ts` is the seam for that.
- **Delete gesture**: true iOS swipeActions isn't available on the web without
  a gesture library. The equivalent here is tap-to-reveal (tap a logged item
  to slide it left and expose a Remove button; tap again to hide it), plus a
  hover-to-reveal bonus on pointer devices via `@media (hover: hover)`.
- **TypeScript** over plain JS for the frontend — the app has real shared data
  shapes (API items, goals, log entries, daily aggregates) moving through 4
  tabs and two chart types; worth the type safety, and Vite's official
  React-TS template is a zero-extra-config starting point.
- **Recharts** over Chart.js — composes as React components/props rather than
  fighting an imperative canvas API.

## Deployment

**Frontend → Vercel.** Point a Vercel project's root directory at `frontend/`;
it auto-detects Vite (`npm run build`, output `dist/`). `vercel.json` adds an
SPA rewrite so refreshing `/today`, `/goals`, etc. doesn't 404. Set
`VITE_API_BASE_URL` as a Vercel environment variable to wherever the backend
actually lives.

**Backend → NOT Vercel.** This is the part that needs a real flag: the backend
runs Playwright, and a cold hall scrape can take up to ~90 seconds (see
measured numbers in `app/foodpro_scraper.py`'s module docstring). Vercel
serverless functions have execution time limits (10–60s depending on plan)
that a cold scrape can blow straight through, and Playwright's browser binary
doesn't fit the serverless deployment model well regardless. It needs a host
with a persistent, long-lived process — Fly.io, Render, Railway, or a plain
VPS all work. Nothing about this has been deployed yet; both parts currently
only run locally.

## Known simplifications / not built yet

- No accounts — Goals/log/history are per-browser (`localStorage`), so they
  don't follow you across devices yet.
- The repo's top-level folder is still named `slugmacros` on disk. Renaming it
  would disrupt whatever IDE workspace/session currently has it open as a
  root, so it was left as-is pending an explicit go-ahead — everything
  *inside* it (package name, app titles, UI copy, code comments) is SlugEats.
- `app/main.py`'s `/tray/totals` and `/suggest` endpoints are unused by the
  current frontend (superseded by the client-side log) but left in place.
- Menu.tab's "log to today" behavior means there's currently no way to log a
  past day's meal after the fact (e.g. catching up on yesterday) — a
  deliberate v1 simplification, not an oversight; see the product decisions
  section above.
