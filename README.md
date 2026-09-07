# SlugPlates

**A dining and nutrition companion for UC Santa Cruz.**

SlugPlates pulls live menu and nutrition data from UC Santa Cruz dining locations and turns it into a simple macro-tracking experience.

Instead of finding a meal on UCSC's dining site, opening its nutrition label, and manually entering it somewhere else, SlugPlates connects the dining menu directly to the tracker.

**Live app:** https://slugplates.vercel.app/

**Production API:** https://slugeats-api.tailac5032.ts.net

---

## Naming

The consumer-facing product is **SlugPlates**.

The backend remains independently branded as **SlugEats API**.

```text
SlugPlates Web / iOS
        |
        v
SlugEats API
        |
        v
UCSC Dining
```

A few legacy `SlugEats` identifiers intentionally remain for backwards compatibility, including some local persistence keys.

The backend API identity is also intentionally preserved.

---

## Why SlugPlates

UCSC Dining publishes menus and nutrition through CBORD FoodPro.

The information exists, but getting from:

```text
What's being served?
        |
        v
What's in it?
        |
        v
Does it fit my goals?
```

requires jumping through multiple pages and manually tracking everything elsewhere.

SlugPlates turns that into:

```text
Open menu
   |
   v
Find food
   |
   v
Tap +
   |
   v
Tracked
```

---

## Features

### Menu

- Live UCSC dining menus
- Dining hall and meal switching
- Nutrition information
- Serving sizes
- Dietary/allergen icons
- Responsive desktop and mobile layouts
- Fast cached menu responses

### Today

- Daily calorie tracking
- Protein, carbohydrate, and fat totals
- Macro progress visualization
- Food log

### Goals

- Daily calorie goal
- Protein goal
- Carbohydrate goal
- Fat goal

### History

- Historical nutrition tracking
- Line and bar chart views
- Multi-day progress

### Appearance

- Light mode
- Dark mode
- Automatic system appearance

---

## Data source

UCSC Dining uses **CBORD FoodPro**:

```text
https://nutrition.sa.ucsc.edu/
```

FoodPro is not a REST API.

It is a stateful ASP.NET WebForms application where navigation order, cookies, and session state matter. Some pages can fail when requested directly without establishing the expected session first.

Because of that, SlugEats API drives a real headless Chromium browser using Playwright.

The scraper follows roughly:

```text
FoodPro landing page
        |
        v
Establish session
        |
        v
Select dining location
        |
        v
Load meal menu
        |
        v
Parse menu rows
        |
        v
Fetch recipe nutrition labels
        |
        v
Normalize into structured JSON
```

Nutrition labels are keyed using FoodPro recipe identifiers so nutrition can be reused across halls and dates.

---

## Architecture

```text
                  SlugPlates
                Web        iOS
                 |          |
                 +----+-----+
                      |
                      v
                SlugEats API
                      |
                      v
              Tailscale Funnel
                      |
                      v
          Self-hosted Ubuntu server
                      |
                FastAPI + Uvicorn
                      |
              Playwright + Chromium
                      |
                      v
              UCSC CBORD FoodPro
```

The web frontend is hosted on Vercel.

The backend runs as a persistent service on a self-hosted Ubuntu server. Uvicorn is managed by `systemd`, allowing the API to automatically start after a reboot.

Tailscale Funnel exposes the backend through a public HTTPS endpoint without directly exposing the server or forwarding an inbound router port.

The production API is:

```text
https://slugeats-api.tailac5032.ts.net
```

The API itself listens only on the server's loopback interface:

```text
127.0.0.1:8010
```

---

## Quick start

Clone the repository:

```bash
git clone https://github.com/Slasher4t/slugplates.git
cd slugplates
```

### Backend

Create a Python virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Install Chromium for Playwright:

```bash
playwright install chromium
```

Run the API:

```bash
uvicorn app.main:app --port 8000
```

The local API will be available at:

```text
http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
```

Create:

```text
.env.local
```

with:

```text
VITE_API_BASE_URL=http://localhost:8000
```

Then run:

```bash
npm run dev
```

---

## Backend endpoints

The FastAPI backend currently exposes endpoints including:

```text
GET /
GET /locations
GET /halls
GET /menu/{hall_id}
GET /menu
GET /search
POST /tray/totals
POST /suggest
```

The frontend primarily consumes the location and menu endpoints.

The backend remains independently branded as:

```text
SlugEats API
```

---

## Frontend architecture

The frontend is built with:

```text
Vite
React
TypeScript
```

The same web application adapts from mobile-width layouts to desktop layouts.

On desktop, menu categories are distributed between two independent vertical stacks so a very tall category in one column does not create large empty gaps in the other.

On mobile, menus remain a normal single-column list.

User data is currently stored locally in the browser through a shared storage abstraction.

That includes:

- goals
- logged foods
- history
- appearance preference

This keeps the current app simple while leaving a clear migration path for account-based storage later.

---

## Nutrition loading

FoodPro nutrition labels are considerably more expensive to retrieve than the menu listing itself.

SlugEats API therefore separates menu discovery from nutrition enrichment.

A cold menu request can return the menu after a short synchronous enrichment period while remaining uncached nutrition is populated in the background.

Nutrition data can have different states:

```text
available
pending
confirmed unavailable
temporary scrape failure
```

Unknown nutrition is not treated as numeric zero.

The frontend can distinguish nutrition that is still loading from nutrition that FoodPro genuinely does not provide.

---

## Caching

There are two primary caches.

### Menu cache

Menu data is keyed approximately by:

```text
location + date + meal
```

Cached menu requests can return very quickly without navigating FoodPro again.

### Recipe cache

Nutrition is keyed by FoodPro recipe identifier.

```text
RecNumAndPort
```

Because a recipe's nutrition is reusable across dining halls and dates, the recipe cache becomes increasingly useful as more menus are accessed.

The production server stores these caches on its local disk.

Unlike the previous ephemeral deployment setup, cache data can survive normal API process restarts and server reboots.

This substantially reduces repeated FoodPro scraping.

---

## Production deployment

### Web

SlugPlates is deployed on Vercel:

```text
https://slugplates.vercel.app
```

The production frontend uses:

```text
VITE_API_BASE_URL=https://slugeats-api.tailac5032.ts.net
```

### API

SlugEats API is self-hosted on Ubuntu.

```text
FastAPI
   |
Uvicorn
   |
Playwright
   |
Chromium
```

The application is managed by `systemd`, keeping the API process available without requiring an interactive terminal session.

The public HTTPS endpoint is provided through Tailscale Funnel:

```text
https://slugeats-api.tailac5032.ts.net
```

Render was previously used as the primary production backend and may remain available temporarily as a fallback, but it is no longer the primary API host.

Moving to a persistent server removes the large host cold-start delay that affected the previous free-tier deployment.

Cold menu requests can still take several seconds because the API may need to retrieve live information from FoodPro, while cached requests are substantially faster.

---

## Current limitations

- **No accounts yet** — goals, food logs, and history are currently local to each browser/device.
- **Cold menu misses are slower than cache hits** — a new menu may still require live FoodPro navigation.
- **Home-hosted backend availability** — the production API depends on the server having power and internet connectivity.
- **Nutrition availability depends on FoodPro** — some recipes may genuinely lack nutrition information.
- **No manual backdating** — logging is currently focused on the current day.
- **Some backend endpoints are not exposed in the main UI yet** — `/tray/totals` and `/suggest` remain available for future features.

---

## Roadmap

### v1.1

- Production API reliability
- Faster menu loading
- Background nutrition enrichment
- Persistent caching
- Nutrition-data correctness improvements
- Desktop menu layout fixes
- Shared production API for web and iOS

### v1.2

Focused UI/UX refinement:

- spacing and layout polish
- typography refinement
- loading and empty states
- accessibility
- animation polish
- visual consistency across web and iOS

### v2.0

Planned larger product expansion:

- accounts
- authentication
- persistent user profiles
- cross-device sync
- synced goals and history
- saved preferences
- personalized dining suggestions
- recommendations based on available foods and remaining macros

---

## Stack

**Frontend**

- React
- TypeScript
- Vite
- Recharts

**Backend**

- Python
- FastAPI
- Playwright
- Chromium
- BeautifulSoup
- Pydantic

**Infrastructure**

- Vercel
- Ubuntu Linux
- systemd
- Tailscale Funnel

**Planned**

- Supabase

---

## AI-assisted development

SlugPlates uses AI-assisted development as part of the engineering workflow.

I designed the product, architecture, interface, scraping/data pipeline, deployment strategy, and technical direction while using AI coding tools to accelerate implementation, debugging, testing, and iteration.

---

## About

Built by **Jayanth Bandaru**, Computer Science @ UC Santa Cruz.

SlugPlates is an independent student project and is not affiliated with or endorsed by UC Santa Cruz.

Built because figuring out the macros in dining hall food should not require this much effort.
