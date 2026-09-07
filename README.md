# SlugPlates

**A macro tracker built around what UCSC is actually serving.**

SlugPlates pulls live menu and nutrition data from UC Santa Cruz dining locations and turns it into a simple macro-tracking app. Instead of finding a meal on UCSC's dining site, looking up its nutrition label, and manually entering it somewhere else, SlugPlates puts the whole flow in one place.

**Live app:** https://slugplates.vercel.app/


Two parts:

* **Backend** (repo root, `app/`) — FastAPI + Playwright scraper that turns UCSC Dining's CBORD FoodPro site into structured menu and nutrition data.
* **Frontend** (`frontend/`) — Vite + React + TypeScript app with Menu / Today / Goals / History, responsive from a phone-width browser to desktop and styled after native iOS/macOS.

## Why SlugPlates

Tracking macros on a college meal plan is weirdly annoying.

UCSC publishes menus and nutrition information, but the existing system isn't designed around questions like:

* What's actually being served at my dining hall today?
* How much protein is in this meal?
* What does adding this put my daily macros at?
* Which dining hall has the food I'm looking for?

SlugPlates connects the dining menu directly to the tracker: find what UCSC is serving, tap **+**, and it's in your day.

## Features

* **Live UCSC menus** — browse Breakfast, Lunch, and Dinner across supported dining locations.
* **Real nutrition data** — calories, protein, carbs, and fat come from UCSC FoodPro nutrition labels.
* **Daily tracking** — add dining items directly from the menu and see progress toward your macros.
* **Custom goals** — set daily calorie, protein, carbohydrate, and fat targets.
* **History** — visualize intake over daily and weekly ranges.
* **Cross-hall search** — backend support for finding foods across dining halls.
* **Responsive UI** — one interface designed for both mobile and desktop.
* **Light / Dark / Auto themes** — including system appearance matching.

## Data source

UCSC Dining runs **CBORD FoodPro** at https://nutrition.sa.ucsc.edu/ — not a REST API. It's classic ASP.NET WebForms with server-side session state and pages that 500 if requested out of order, so the backend drives a real headless browser with Playwright instead of hand-rolling HTTP requests and cookies.

Key findings from testing against the live site (see `app/config.py` and `app/foodpro_scraper.py` for the full detail):

* Hitting `longmenu.aspx` cold (no prior page load in that browser session) returns HTTP 500 every time — a landing-page visit has to happen first to establish session state.
* Recipe nutrition labels (`label.aspx`) are keyed **only** by recipe id and are identical across halls and dates, so nutrition can be cached globally instead of per hall/day.
* Menu listings do vary by hall, date, and meal, so they're cached separately with a shorter TTL.
* FoodPro currently exposes **four** full dining halls — John R. Lewis & College Nine, Cowell & Stevenson, Crown & Merrill, and Rachel Carson & Oakes — plus three cafes/markets.

The resulting flow looks roughly like:

```text
UCSC Dining / CBORD FoodPro
            ↓
     Playwright scraper
            ↓
    SlugEats API (FastAPI)
        ↓         ↓
SlugPlates Web   native iOS client
```

The backend is a separate product identity from what sits in front of it: **SlugEats API** is the one thing every client — the SlugPlates web app and the native SwiftUI iOS app — talks to. Both consume the exact same production API over plain HTTPS/JSON; nothing about the API is web-specific. See [Deployment](#deployment) for the real production URLs.

## Quick start

### Backend

```bash
git clone https://github.com/Slasher4t/slugplates.git
cd slugplates

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt
playwright install chromium

uvicorn app.main:app --reload
```

The API runs at:

```text
http://localhost:8000
```

For offline development without FoodPro or Chromium:

```bash
USE_MOCK_DATA=1 uvicorn app.main:app --reload
```

Regression tests (parser/cache-state logic only - no live FoodPro access needed):

```bash
pip install -r requirements-dev.txt
pytest tests/
```

### Frontend

In a separate terminal:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

By default:

```text
VITE_API_BASE_URL=http://localhost:8000
```

Open:

```text
http://localhost:5173
```

That's the actual app.

## Backend endpoints

* `GET /` — API identity, mock-mode flag, hall list, and cache stats. Cheap: reads local state only, never touches FoodPro - this is also the lightweight health/readiness check both clients use to tell whether the backend is up (see [Performance & caching](#performance--caching)).
* `GET /locations` — grouped dining halls and cafes/markets for the frontend location switcher.
* `GET /halls` — flat `{slug: name}` list; dining halls only by default, or `?include_cafes=true`.
* `GET /menu/{hall_id}?menu_type=lunch&date=2026-09-02` — one location's menu. Returns fast (menu rows plus whatever nutrition is already cached or fits in a short synchronous enrichment window) rather than waiting for every item's nutrition label - see [Performance & caching](#performance--caching) for what that means for the response shape.
* `GET /menu?menu_type=lunch&date=...` — menus across all dining halls, same response shape as above.
* `GET /search?q=chicken&menu_type=lunch&date=...` — cross-hall food search.
* `POST /tray/totals` — calculate macros for a collection of foods and serving counts.
* `POST /suggest` — suggest menu items based on remaining macro targets.

Every `FoodItem.nutrition` carries a `pending` flag alongside the usual calorie/macro fields (all additive - `has_data` and every other field mean exactly what they always did):

* `pending: false` + real numbers — nutrition is in, including a **genuine** zero (some recipes really are zero-calorie - diet soda, black coffee, a pinch of seasoning - and a couple of "build-your-own station" placeholder recipes are zero because FoodPro's own INGREDIENTS text says so outright: "This recipe was intentionally left blank"). `0 cal` on the wire always means FoodPro's own label said 0, never a stand-in for missing data - see "Nutrition-data correctness" below for how that's enforced and verified.
* `pending: false` + all-null numbers — FoodPro confirmed this recipe has no label (its label.aspx page says so directly: "Nutritional Information is not available for this recipe"). This will never resolve; don't expect it to change.
* `pending: true` + all-null numbers — not enriched yet, OR the one attempt so far loaded a page that wasn't the confirmed-absent one but didn't have a parseable Calories value either (an unexpected page/markup - see below). Either way, a later request may have real numbers once background enrichment (re-)tries it. The web client shows "Loading nutrition…" for this state (Add is disabled - see `pending` in `frontend/src/api/types.ts`) and "No nutrition data" for the confirmed-absent one.

**Nutrition-data correctness.** These three wire states are backed by an explicit `status` on each recipe cache entry - `"success"`, `"confirmed_no_label"`, or `"parse_failed"` - rather than being inferred after the fact. The distinction matters most for the third one: a page that loaded (no HTTP error) and wasn't the confirmed-absent page, but from which no Calories value could be extracted, is `"parse_failed"` and is **never** treated as final - `RecipeCache.needs_enrichment()` keeps offering it for re-scraping on every later request, exactly like a network failure already did, rather than letting one bad response harden into permanent "no data" for that recipe. A live census of every recipe currently on the menu (257 unique recipes, John R. Lewis & College Nine, full enrichment) found 256 successes (13 of them genuinely zero, individually verified against FoodPro's own label.aspx source) and 1 confirmed-absent - zero parse failures. `app/foodpro_scraper.py`'s `_looks_suspicious()` logs (never fabricates or corrects) any successful parse where a real serving size accompanies an unexplained all-zero result, for a human to go check against FoodPro's own data if it's ever a real food rather than a condiment/placeholder. `tests/test_nutrition_parser.py` covers all three states plus the migration path for cache entries written before this distinction existed.

Caching, request pacing, session handling, and the exact scrape mechanics are documented in `app/foodpro_scraper.py` and `app/config.py`.

## Frontend architecture

Plain Vite + React + TypeScript — no Next.js, no CSS framework, and no state library beyond React context. Deliberately minimal given the app's size.

* **Responsive strategy** — one codebase with a primary breakpoint at 900px. Below it: bottom tab bar and single-column stacked layout. At/above it: top navigation and wider grid layouts.
* **`src/components/menu/MenuList.tsx`** — mobile is a single flat column, station order as given. Desktop splits stations across two *independent* vertical stacks (plain flex columns, not a CSS Grid with shared row tracks - that was the v1.0 desktop bug: a tall category and a short one sharing a grid row meant the row was sized to the tall one, leaving a large empty gap under the short one before the next row could start). `distributeColumns()` greedily assigns whole stations to whichever column currently has the smaller estimated height, so a category never gets split and column heights stay reasonably balanced regardless of how unevenly sized adjacent categories are.
* **`src/context/`** — `ThemeContext`, `GoalsContext`, `LogContext`, and `MenuSelectionContext` own shared application state.
* **`src/storage/keyValueStore.ts`** — every persisted read/write goes through one module rather than accessing `localStorage` throughout the app. This gives the app a single migration point when persistent accounts are added.
* **`src/api/`** — typed fetch wrappers around the FastAPI backend, with the API origin supplied through `VITE_API_BASE_URL`.
* **`src/components/today/TripleRing.tsx`** — Apple-Fitness-inspired macro visualization. Outer → inner: Calories → Carbs → Fat, with Protein displayed separately.
* **`src/pages/HistoryPage.tsx`** + **`src/utils/history.ts`** — daily/weekly aggregation over the food log with Line and Bar views through Recharts.

## Product decisions

A few behaviors are intentional rather than accidental implementation details:

* **The log date is always the real current day.** Browsing another date in Menu is treated as previewing a menu, not changing the date of your food log.
* **Goals, log, and history currently persist locally.** Without accounts, putting them in a remote database would add infrastructure without providing meaningful identity-based cross-device sync.
* **Persistent storage has one abstraction layer.** `keyValueStore.ts` exists specifically so moving from local storage to an authenticated backend doesn't require rewriting every context and component.
* **Logged-item deletion uses tap-to-reveal.** On mobile, tapping a logged item exposes its Remove action; pointer devices additionally support hover behavior.
* **TypeScript was chosen intentionally.** Menu items, nutrition information, goals, log entries, and history aggregates are shared across multiple parts of the application and benefit from common typed models.
* **Recharts was chosen over Chart.js.** Its component model fits naturally into the existing React UI.

## Deployment

SlugPlates is deployed as two separate services because the frontend and scraper have very different runtime requirements.

**Frontend → Vercel**

The React/Vite frontend is deployed from `frontend/` on Vercel.

Production:

https://slugplates.vercel.app/

The production frontend receives the backend origin through:

```text
VITE_API_BASE_URL=https://slugeats-api.onrender.com
```

`vercel.json` provides the SPA rewrite required for direct navigation to routes such as `/menu`, `/today`, `/goals`, and `/history`.

**Backend → Render**

The FastAPI + Playwright service runs as a persistent Render web service:

https://slugeats-api.onrender.com/

Playwright's Chromium binary is installed during the Render build:

```bash
pip install -r requirements.txt && PLAYWRIGHT_BROWSERS_PATH=/opt/render/project/src/.playwright playwright install chromium
```

The same browser path is supplied when the server starts:

```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/render/project/src/.playwright uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

A long-lived backend is important here because the scraper maintains a Playwright browser and FoodPro session instead of launching a new Chromium instance for every request.

Cold requests can still be significantly slower than cached requests, especially when the service has recently started and nutrition labels have not yet populated the recipe cache.

## Performance & caching

There are two distinct caches because menu listings and nutrition labels have different lifetimes.

**Menu cache**

Keyed by:

```text
location + date + meal
```

Published menu data gets a normal TTL, while empty/closed-hall responses expire sooner so newly published meals can appear quickly.

**Recipe cache**

Keyed by:

```text
RecNumAndPort
```

FoodPro serves the same nutrition label for a recipe regardless of hall or date, so recipe nutrition can be reused globally. As this cache fills, fewer FoodPro label requests are necessary and menu requests become substantially cheaper.

**Menu delivery is decoupled from nutrition enrichment (v1.1.0).** A cold hall can have 200-260 items, each needing its own FoodPro label fetch. Waiting for all of them before responding is what used to make a cold `/menu` request take minutes. Now `scrape_day()` (`app/foodpro_scraper.py`) returns the menu as soon as the rows themselves are parsed, after enriching only whatever fits in a short time budget (`FOODPRO_SYNC_ENRICH_BUDGET`, default 6s); anything left over is handed to a background task that keeps enriching (respecting the same request pacing, timeouts, and retry/circuit-breaker limits as everything else here) and lands in the recipe cache for the *next* request to pick up - no re-scrape needed, since the menu rows are already cached. Background enrichment acquires the shared scraper lock **per label, not once for the whole batch** - a real request for any other hall/meal (or startup prewarming) is guaranteed to wait behind at most one in-flight label fetch, never behind an entire background run. (An earlier version of this held the lock for the whole batch; measured impact of that bug on a real background run: a concurrent request for a different hall waited 108s. Fixed and re-measured at 1.3s.) See "Every `FoodItem.nutrition` carries a `pending` flag" above for how a client tells "still coming" apart from "confirmed absent."

**Startup prewarm.** Render's disk does not persist across deploys - every deploy starts from a fully empty cache. On boot, the backend fires a single one-shot (not recurring, not a loop) background scrape of today's current-meal-period menu for the app's default hall - the one combination essentially every cold-start visitor requests first - so it has a head start instead of only starting once that request actually arrives. Toggle with `PREWARM_ON_STARTUP` (default on); never blocks readiness, and any failure is swallowed rather than affecting real requests.

**Render cold starts are a separate cost from any of the above.** Render's free tier spins the service down after inactivity; the next request pays for container spin-up plus Playwright/Chromium launch (`lifespan.startup()`) before the app serves anything at all. Measured on production: **~52s** for that combined cold start (isolated by timing `GET /`, which never touches FoodPro, against an already-sleeping service), versus **~0.2s** once warm. This is Render platform latency, not scraper latency, and no amount of scraper optimization changes it - the fix, if wanted, is a paid always-on plan or an external uptime ping to prevent the spin-down.

**Timing instrumentation.** `app/foodpro_scraper.py` logs one line per menu-cache lookup (hit/miss) and one per scrape, breaking total time into bootstrap / menu fetch / menu parse / synchronous enrichment / items handed to the background queue, plus one line per background enrichment batch. Deliberately not per-label - that would be hundreds of log lines per cold hall for no benefit. Visible in Render's log stream.

## Current limitations

* **No accounts yet** — Goals, log, and history remain per-browser and don't sync across devices.
* **Render cold starts are still real** — the first request after the backend has spun down pays for container spin-up plus browser launch (~52s measured), regardless of any scraper/caching optimization. See [Performance & caching](#performance--caching).
* **A newly-published or rarely-requested menu is still not instant** — menu rows return fast even cold, but a completely fresh recipe (never scraped before, by anyone) shows `pending: true` until the background enrichment task reaches it, typically well under a minute for a normal-sized hall.
* **No manual backdating** — the current food log is intentionally tied to the real current day.
* **`/tray/totals` and `/suggest` aren't used by the current frontend** — they're retained as useful API functionality and possible building blocks for later versions.
* **A handful of FoodPro's own recipes report implausible values** — e.g. a real chicken thigh recipe whose label reports 0 calories/0g protein. Verified directly against FoodPro's own label.aspx source (not a scrape/parse bug on our end - see "Nutrition-data correctness" above); this is a data-entry gap in UCSC's own system, which SlugPlates has no way to correct without fabricating a number FoodPro doesn't provide.

## What's next

* **Supabase accounts** — authentication and persistent user profiles.
* **Cross-device sync** — shared goals, logs, and history between devices.
* **Smarter suggestions** — recommend foods available right now based on remaining macros.
* **Broader UI/UX polish** — planned for a later release; v1.1.0 was deliberately scoped to reliability, performance, and a couple of targeted bug fixes rather than visual redesign.
* **Better cross-hall discovery** — make questions like "where can I get chicken right now?" part of the main UI.

## Stack

**Frontend**

* React
* TypeScript
* Vite
* Recharts

**Backend**

* Python
* FastAPI
* Playwright
* BeautifulSoup
* Pydantic

**Infrastructure**

* Vercel
* Render
* Supabase *(planned)*

## AI-assisted development

SlugPlates uses AI-assisted development as part of the engineering workflow. I designed the product, architecture, interface, scraping/data pipeline, and technical direction while using AI coding tools to accelerate implementation, testing, debugging, and iteration.

## About

Built by **Jayanth Bandaru**, Computer Science @ UC Santa Cruz.

SlugPlates is an independent student project and is not affiliated with or endorsed by UC Santa Cruz.

Built because figuring out the macros in dining hall food should not require this much effort.
