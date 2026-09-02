"""
Playwright-driven scraper for UCSC Dining's CBORD FoodPro site.

Replaces the old (wrong) Nutrislice HTTP client. FoodPro is ASP.NET WebForms
with server-side session state, so we drive a real browser and let it carry the
cookies rather than hand-rolling the session.

Scrape flow for one hall/date/meal:

    "/"  (bootstrap - REQUIRED, see below)
      -> shortmenu.aspx?locationNum=NN   (sets WebInaCartLocation cookie)
      -> longmenu.aspx?...&dtdate&mealName   (parse the item rows)
      -> label.aspx?...&RecNumAndPort=X      (once per recipe, ever)

Two behaviors worth knowing before you touch this file:

  * The "/" bootstrap is not optional. Going straight to longmenu.aspx in a
    fresh browser context returns HTTP 500 "Runtime Error", 100% of the time.
    _ensure_session() handles it and only pays the cost once per browser.

  * label.aspx keys off RecNumAndPort alone - the same recipe returns an
    identical label at every hall and on every date. So nutrition is cached
    globally and permanently in one JSON file. Menus, which do vary by
    hall/date/meal, are cached separately with a TTL. In practice the recipe
    cache saturates after a few days of use and scrapes become near-instant.

Everything here is sequential on a single page with a delay between loads: this
is a university-run server and there is no upside to hammering it.
"""

from __future__ import annotations

import asyncio
import datetime
import html
import json
import os
import re
import time
import urllib.parse
from typing import Any, Optional

from bs4 import BeautifulSoup

from app import config
from app.models import FoodItem, NutritionInfo

# --------------------------------------------------------------------------
# URL building
# --------------------------------------------------------------------------
# quote_plus reproduces FoodPro's own encoding exactly: spaces as "+", "&" as
# "%26", "'" as "%27". Matching the site's own hrefs avoids surprises.


def _q(value: str) -> str:
    return urllib.parse.quote_plus(value)


def _dtdate(date_str: str) -> str:
    """YYYY-MM-DD -> MM%2fDD%2fYYYY, the form FoodPro's own links use."""
    d = datetime.date.fromisoformat(date_str)
    return f"{d.month:02d}%2f{d.day:02d}%2f{d.year}"


def _short_menu_url(hall_slug: str) -> str:
    return (
        f"{config.FOODPRO_BASE_URL}shortmenu.aspx"
        f"?sName={_q(config.SITE_NAME)}"
        f"&locationNum={config.location_num(hall_slug)}"
        f"&locationName={_q(config.location_name(hall_slug))}"
        f"&naFlag=1"
    )


def _long_menu_url(hall_slug: str, date_str: str, menu_type: str) -> str:
    return (
        f"{config.FOODPRO_BASE_URL}longmenu.aspx"
        f"?sName={_q(config.SITE_NAME)}"
        f"&locationNum={config.location_num(hall_slug)}"
        f"&locationName={_q(config.location_name(hall_slug))}"
        f"&naFlag=1"
        f"&WeeksMenus={_q(config.WEEKS_MENUS)}"
        f"&dtdate={_dtdate(date_str)}"
        f"&mealName={config.MEAL_NAMES[menu_type]}"
    )


def _label_url(rec_num_and_port: str, hall_slug: str, date_str: str) -> str:
    # locationNum/dtdate do not change the nutrition numbers, but the allergen
    # icon block on the label is omitted without them.
    return (
        f"{config.FOODPRO_BASE_URL}label.aspx"
        f"?locationNum={config.location_num(hall_slug)}"
        f"&locationName={_q(config.location_name(hall_slug))}"
        f"&dtdate={_dtdate(date_str)}"
        # Some RecNumAndPort values carry a fractional portion ("889038*1/2").
        # Mirror the site's own hrefs: "*" raw, "/" as lowercase %2f.
        f"&RecNumAndPort={urllib.parse.quote(rec_num_and_port, safe='*').replace('%2F', '%2f')}"
    )


# --------------------------------------------------------------------------
# Parsing
# --------------------------------------------------------------------------


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(text).replace("\xa0", " ")).strip()


def _icons_from(node) -> list[str]:
    """Map LegendImages/<name>.gif -> human label, via config.ALLERGEN_ICONS."""
    found: list[str] = []
    for img in node.find_all("img"):
        src = img.get("src") or ""
        if "LegendImages" not in src:
            continue
        key = os.path.splitext(src.rsplit("/", 1)[-1])[0].lower()
        label = config.ALLERGEN_ICONS.get(key, key)
        if label not in found:
            found.append(label)
    return found


def parse_long_menu(page_html: str) -> list[dict[str, Any]]:
    """
    Pull item rows out of a longmenu.aspx page.

    The page is a nest of layout tables, so instead of walking rows we walk the
    two meaningful divs in document order:
        div.longmenucolmenucat  -> a station header, e.g. "-- Clean Plate --"
        div.longmenucoldispname -> an item, wrapping the label.aspx link
    Station is whatever header was last seen above the item.
    """
    soup = BeautifulSoup(page_html, "lxml")
    rows: list[dict[str, Any]] = []
    station: Optional[str] = None

    for div in soup.find_all("div", class_=["longmenucolmenucat", "longmenucoldispname"]):
        classes = div.get("class", [])

        if "longmenucolmenucat" in classes:
            # Headers arrive wrapped in dashes: "-- Campus Bakery --"
            station = _clean(div.get_text()).strip("- ").strip() or None
            continue

        link = div.find("a")
        name = _clean((link or div).get_text())
        if not name:
            continue

        rec_num = None
        if link and link.get("href"):
            match = re.search(r"RecNumAndPort=([^&\"]+)", link["href"])
            if match:
                rec_num = urllib.parse.unquote(match.group(1))

        # Icons sit in sibling <td>s of the item's own inner <tr>.
        inner_row = div.find_parent("tr")
        icons = _icons_from(inner_row) if inner_row else []

        # The portion cell lives on an *outer* <tr>, so climb until one has it.
        portion = None
        node = div
        while True:
            node = node.find_parent("tr")
            if node is None:
                break
            cell = node.find("div", class_="longmenucolportions")
            if cell:
                portion = _clean(cell.get_text()) or None
                break

        rows.append(
            {
                "name": name,
                "rec_num": rec_num,
                "station": station,
                "portion": portion,
                "icons": icons,
            }
        )

    return rows


# Label values render as <font>Total Fat&nbsp;</font><font>9.4g</font>, with no
# useful classes, so match against the page's flattened text instead of the DOM.
_LABEL_PATTERNS = {
    "calories": r"Calories\s*([\d.,]+)",
    "protein_g": r"\bProtein\s*([\d.,]+)\s*g",
    "carbs_g": r"Tot\.?\s*Carb\.?\s*([\d.,]+)\s*g",
    "fat_g": r"Total\s+Fat\s*([\d.,]+)\s*g",
    "fiber_g": r"Dietary\s+Fiber\s*([\d.,]+)\s*g",
    "sugar_g": r"Sugars\s*([\d.,]+)\s*g",
    "sodium_mg": r"Sodium\s*([\d.,]+)\s*mg",
}


def _num(text: str, pattern: str) -> Optional[float]:
    match = re.search(pattern, text, re.IGNORECASE)
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", ""))
    except ValueError:
        return None


def parse_label(page_text: str, page_html: str = "") -> dict[str, Any]:
    """Scrape one label.aspx page into a plain dict (JSON-cacheable)."""
    text = _clean(page_text)

    data: dict[str, Any] = {key: _num(text, pat) for key, pat in _LABEL_PATTERNS.items()}

    # A few recipes (whole fruit, some bulk items) legitimately have no label -
    # the page just says so. Record that, so we cache the "no data" answer
    # instead of re-scraping the item on every run.
    data["available"] = "not available for this recipe" not in text.lower()

    serving = re.search(r"Serving\s+Size\s*(.*?)\s*Calories", text, re.IGNORECASE)
    data["serving_size"] = _clean(serving.group(1)) if serving else None

    ingredients = re.search(r"INGREDIENTS:\s*(.*?)(?:ALLERGENS:|$)", text, re.IGNORECASE)
    data["ingredients"] = _clean(ingredients.group(1)) if ingredients else None

    allergens = re.search(
        r"ALLERGENS:\s*(.*?)(?:The nutrient composition|$)", text, re.IGNORECASE
    )
    data["allergens"] = _clean(allergens.group(1)) if allergens else None

    if page_html:
        soup = BeautifulSoup(page_html, "lxml")
        block = soup.find("span", class_="labelwebcodesvalue")
        data["icons"] = _icons_from(block) if block else []
    else:
        data["icons"] = []

    return data


def _nutrition_from(record: Optional[dict[str, Any]]) -> NutritionInfo:
    if not record:
        return NutritionInfo()
    return NutritionInfo(
        calories=record.get("calories"),
        protein_g=record.get("protein_g"),
        carbs_g=record.get("carbs_g"),
        fat_g=record.get("fat_g"),
        fiber_g=record.get("fiber_g"),
        sugar_g=record.get("sugar_g"),
        sodium_mg=record.get("sodium_mg"),
        serving_size=record.get("serving_size"),
    )


# --------------------------------------------------------------------------
# Disk cache
# --------------------------------------------------------------------------


def _write_json(path: str, payload: Any) -> None:
    """Write via a temp file + rename so a crash can't leave a truncated cache."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    os.replace(tmp, path)


def _read_json(path: str) -> Optional[Any]:
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None


class RecipeCache:
    """
    RecNumAndPort -> nutrition dict, shared across every hall and date.

    Verified live: label.aspx returns byte-identical output for a given
    RecNumAndPort regardless of locationNum or dtdate, so these entries never
    expire. This is what keeps repeat scrapes cheap.
    """

    def __init__(self, path: str = config.RECIPE_CACHE_FILE):
        self.path = path
        self._data: dict[str, dict] = _read_json(path) or {}
        self._dirty = False

    def get(self, rec_num: str) -> Optional[dict]:
        return self._data.get(rec_num)

    def put(self, rec_num: str, record: dict) -> None:
        self._data[rec_num] = record
        self._dirty = True

    def flush(self) -> None:
        if self._dirty:
            _write_json(self.path, self._data)
            self._dirty = False

    def __len__(self) -> int:
        return len(self._data)


def _menu_cache_path(hall_slug: str, date_str: str, menu_type: str) -> str:
    return os.path.join(config.MENU_CACHE_DIR, f"{hall_slug}_{date_str}_{menu_type}.json")


# --------------------------------------------------------------------------
# Scraper
# --------------------------------------------------------------------------


class FoodProScraper:
    """
    Owns one long-lived Playwright browser, context and page, reused across
    every scrape. Launching a browser per item would dominate the runtime.

    A single lock serializes scrapes: one page can only be on one URL at a
    time, and serial access is also the polite way to treat this server.
    """

    def __init__(self) -> None:
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None
        self._bootstrapped = False
        self._current_location: Optional[str] = None
        self._lock = asyncio.Lock()
        self.recipes = RecipeCache()

    # -- browser lifecycle ---------------------------------------------------

    async def start(self) -> None:
        if self._browser is not None:
            return
        from playwright.async_api import async_playwright

        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=config.HEADLESS)
        self._context = await self._browser.new_context(user_agent=config.USER_AGENT)
        self._context.set_default_timeout(config.PAGE_TIMEOUT_MS)
        self._page = await self._context.new_page()
        self._bootstrapped = False
        self._current_location = None

    async def close(self) -> None:
        self.recipes.flush()
        for closer in (self._context, self._browser):
            if closer is not None:
                try:
                    await closer.close()
                except Exception:
                    pass
        if self._playwright is not None:
            try:
                await self._playwright.stop()
            except Exception:
                pass
        self._playwright = self._browser = self._context = self._page = None
        self._bootstrapped = False
        self._current_location = None

    # -- navigation ----------------------------------------------------------

    async def _goto(self, url: str):
        await asyncio.sleep(config.REQUEST_DELAY_SECONDS)
        return await self._page.goto(url, wait_until="domcontentloaded")

    async def _ensure_session(self, hall_slug: str) -> None:
        """
        Establish the state longmenu.aspx requires.

        The landing page must be loaded once per browser context or every
        longmenu.aspx request 500s. shortmenu.aspx then sets WebInaCartLocation
        for the hall; we only reload it when switching halls.
        """
        await self.start()

        if not self._bootstrapped:
            await self._goto(config.FOODPRO_BASE_URL)
            self._bootstrapped = True

        if self._current_location != hall_slug:
            await self._goto(_short_menu_url(hall_slug))
            self._current_location = hall_slug

    # -- scraping ------------------------------------------------------------

    async def _scrape_menu_rows(
        self, hall_slug: str, date_str: str, menu_type: str
    ) -> list[dict[str, Any]]:
        await self._ensure_session(hall_slug)
        response = await self._goto(_long_menu_url(hall_slug, date_str, menu_type))

        # FoodPro answers 500 for dates it has no menu for - not an error worth
        # raising, the hall just isn't serving that meal.
        if response is not None and response.status >= 500:
            return []

        return parse_long_menu(await self._page.content())

    async def _scrape_label(
        self, rec_num: str, hall_slug: str, date_str: str
    ) -> Optional[dict[str, Any]]:
        """
        Fetch one nutrition label, tolerating a flaky server.

        FoodPro intermittently stalls on individual label requests, so give each
        one a short timeout and a single retry. Returning None just means this
        item shows up without macros and gets retried on a later request.
        """
        url = _label_url(rec_num, hall_slug, date_str)

        for attempt in range(2):
            try:
                await asyncio.sleep(config.REQUEST_DELAY_SECONDS)
                response = await self._page.goto(
                    url, wait_until="domcontentloaded", timeout=config.LABEL_TIMEOUT_MS
                )
                if response is not None and response.status >= 400:
                    return None
                text = await self._page.inner_text("body")
                return parse_label(text, await self._page.content())
            except Exception:
                if attempt == 0:
                    await asyncio.sleep(config.RETRY_BACKOFF_SECONDS)
                    continue
                return None
        return None

    async def scrape_day(
        self, hall_slug: str, date_str: str, menu_type: str
    ) -> list[dict[str, Any]]:
        """
        Scrape one hall/date/meal into cacheable dicts, filling nutrition from
        the global recipe cache and only hitting label.aspx for recipes we have
        never seen before.
        """
        async with self._lock:
            rows = await self._scrape_menu_rows(hall_slug, date_str, menu_type)

            fetched = 0
            consecutive_failures = 0
            for row in rows:
                rec_num = row.get("rec_num")
                if not rec_num:
                    continue
                if self.recipes.get(rec_num) is not None:
                    continue
                if fetched >= config.MAX_LABELS_PER_RUN:
                    # Leave the rest for a later call; the cache persists, so
                    # each request chips away at the backlog.
                    break
                record = await self._scrape_label(rec_num, hall_slug, date_str)
                if record is None:
                    consecutive_failures += 1
                    if consecutive_failures >= config.MAX_CONSECUTIVE_FAILURES:
                        # Server is unhappy - stop pressing it. The menu rows we
                        # already have are still returned, and the labels we
                        # missed get picked up on a later request.
                        break
                    continue
                consecutive_failures = 0
                self.recipes.put(rec_num, record)
                fetched += 1

            self.recipes.flush()
            return rows


_scraper = FoodProScraper()

# Guards against two concurrent API calls scraping the same hall/date/meal.
_inflight: dict[tuple, asyncio.Task] = {}


async def startup() -> None:
    """Launch the browser up front so the first request isn't slow."""
    if not config.USE_MOCK_DATA:
        await _scraper.start()


async def shutdown() -> None:
    await _scraper.close()


# --------------------------------------------------------------------------
# Public API - same surface the old nutrislice_client exposed
# --------------------------------------------------------------------------


def _to_food_items(
    rows: list[dict[str, Any]], hall_slug: str, date_str: str, menu_type: str
) -> list[FoodItem]:
    hall_name = config.ALL_LOCATIONS.get(hall_slug, hall_slug)
    items: list[FoodItem] = []

    for index, row in enumerate(rows):
        rec_num = row.get("rec_num")
        record = _scraper.recipes.get(rec_num) if rec_num else None

        # Prefer the label's alt-text icons; longmenu only gives gif filenames.
        icons = (record or {}).get("icons") or row.get("icons") or []

        items.append(
            FoodItem(
                id=f"{hall_slug}:{date_str}:{menu_type}:{rec_num or f'row{index}'}",
                name=row["name"],
                hall_id=hall_slug,
                hall_name=hall_name,
                menu_type=menu_type,
                date=date_str,
                station=row.get("station"),
                portion=row.get("portion"),
                nutrition=_nutrition_from(record),
                icons=icons,
            )
        )

    return items


async def _get_rows(hall_slug: str, menu_type: str, date_str: str) -> list[dict[str, Any]]:
    """Cached menu rows for one hall/date/meal. Scrapes at most once."""
    if config.USE_MOCK_DATA:
        from app.mock_data import get_mock_rows

        return get_mock_rows(hall_slug, menu_type, date_str)

    path = _menu_cache_path(hall_slug, date_str, menu_type)
    cached = _read_json(path)
    if cached:
        rows = cached.get("rows", [])
        # Closed halls cache briefly; published menus cache for the full TTL.
        ttl = config.CACHE_TTL_SECONDS if rows else config.EMPTY_CACHE_TTL_SECONDS
        if (time.time() - cached.get("fetched_at", 0)) < ttl:
            return rows

    key = (hall_slug, date_str, menu_type)
    task = _inflight.get(key)
    if task is None:
        task = asyncio.create_task(_scraper.scrape_day(hall_slug, date_str, menu_type))
        _inflight[key] = task
    try:
        rows = await asyncio.shield(task)
    finally:
        _inflight.pop(key, None)

    _write_json(path, {"fetched_at": time.time(), "rows": rows})
    return rows


async def get_day_items(hall_slug: str, menu_type: str, date_str: str) -> list[FoodItem]:
    """Normalized FoodItems for one hall / meal period / day."""
    rows = await _get_rows(hall_slug, menu_type, date_str)
    if config.USE_MOCK_DATA:
        from app.mock_data import mock_items_from_rows

        return mock_items_from_rows(rows, hall_slug, date_str, menu_type)
    return _to_food_items(rows, hall_slug, date_str, menu_type)


async def get_all_halls_items(
    menu_type: str, date_str: str, hall_ids: Optional[list[str]] = None
) -> list[FoodItem]:
    """FoodItems across all (or selected) halls for one meal period."""
    targets = hall_ids or list(config.DINING_HALLS.keys())
    items: list[FoodItem] = []
    for hall_slug in targets:
        if hall_slug not in config.LOCATIONS:
            continue
        items.extend(await get_day_items(hall_slug, menu_type, date_str))
    return items


def cache_stats() -> dict[str, Any]:
    menu_files = 0
    if os.path.isdir(config.MENU_CACHE_DIR):
        menu_files = len([f for f in os.listdir(config.MENU_CACHE_DIR) if f.endswith(".json")])
    return {
        "cached_recipes": len(_scraper.recipes),
        "cached_menus": menu_files,
        "cache_dir": config.CACHE_DIR,
    }
