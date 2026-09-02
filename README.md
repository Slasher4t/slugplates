# SlugPlates

**A macro tracker built around what UCSC is actually serving.**

SlugPlates pulls live menu and nutrition data from UC Santa Cruz dining locations and turns it into a simple macro-tracking app. Instead of finding a meal on UCSC's dining site, looking up its nutrition label, and manually entering it somewhere else, SlugPlates puts the whole flow in one place.

**Live app:** https://slugplates.vercel.app/

> Product name note: the consumer-facing app is SlugPlates. The backend API
> and its Render URL kept their original "SlugEats" identity through this
> rename (see "Naming" below) - that's intentional, not stale copy.

Two parts:

* **Backend** (repo root, `app/`) — FastAPI + Playwright scraper that turns UCSC Dining's CBORD FoodPro site into structured menu and nutrition data.
* **Frontend** (`frontend/`) — Vite + React + TypeScript app with Menu / Today / Goals / History, responsive from a phone-width browser to desktop and styled after native iOS/macOS.

## Naming

The consumer-facing app was renamed **SlugEats → SlugPlates**. A few things
deliberately did *not* follow:

* **The backend keeps its "SlugEats API" identity** — FastAPI's `title`, the
  root endpoint's `"name"` field, the scraper's User-Agent string
  (`SlugEats/0.3 ...`), and `app/config.py`'s module docstring are all
  unchanged. The API is a separate product identity from the app in front of
  it, and nothing asked for its behavior (including what it calls itself
  over the wire) to change.
* **The frontend's localStorage key prefix is still `"slugeats."`** — see the
  comment in `frontend/src/storage/keyValueStore.ts`. Renaming it would make
  every real visitor's saved goals/log/theme invisible overnight (the app
  would look under a new prefix and find nothing) - a storage-behavior
  change well outside a cosmetic rename.
* **The backend URL still says "slugeats"** (`slugeats-api.onrender.com`) —
  real, currently-deployed infrastructure. Changing the text here wouldn't
  change the actual domain, so leaving it accurate took priority over
  leaving it matching; renaming the Render service is a separate,
  infrastructural decision this pass didn't make. The Vercel frontend domain
  and the GitHub repo itself *were* moved (`slugplates.vercel.app`,
  `github.com/Slasher4t/slugplates`), so those two now match the app name.

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
        FastAPI API
            ↓
     SlugPlates frontend
```

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

* `GET /locations` — grouped dining halls and cafes/markets for the frontend location switcher.
* `GET /halls` — flat `{slug: name}` list; dining halls only by default, or `?include_cafes=true`.
* `GET /menu/{hall_id}?menu_type=lunch&date=2026-09-02` — one location's menu with available nutrition data.
* `GET /menu?menu_type=lunch&date=...` — menus across all dining halls.
* `GET /search?q=chicken&menu_type=lunch&date=...` — cross-hall food search.
* `POST /tray/totals` — calculate macros for a collection of foods and serving counts.
* `POST /suggest` — suggest menu items based on remaining macro targets.

Caching, request pacing, session handling, and the exact scrape mechanics are documented in `app/foodpro_scraper.py` and `app/config.py`.

## Frontend architecture

Plain Vite + React + TypeScript — no Next.js, no CSS framework, and no state library beyond React context. Deliberately minimal given the app's size.

* **Responsive strategy** — one codebase with a primary breakpoint at 900px. Below it: bottom tab bar and single-column stacked layout. At/above it: top navigation and wider grid layouts.
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

## Caching

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

## Current limitations

* **No accounts yet** — Goals, log, and history remain per-browser and don't sync across devices.
* **Cold menu loads can be slow** — uncached requests may require Playwright to navigate FoodPro and fetch nutrition labels before responding.
* **No manual backdating** — the current food log is intentionally tied to the real current day.
* **`/tray/totals` and `/suggest` aren't used by the current frontend** — they're retained as useful API functionality and possible building blocks for later versions.

## What's next

* **Background menu refresh** — populate caches before a user has to wait for them.
* **Faster cold loads** — separate immediate menu delivery from slower nutrition-cache enrichment.
* **Supabase accounts** — authentication and persistent user profiles.
* **Cross-device sync** — shared goals, logs, and history between devices.
* **Native iOS app** — use the same FastAPI menu backend and account data as the web client.
* **Smarter suggestions** — recommend foods available right now based on remaining macros.
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
