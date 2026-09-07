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
import logging
import os
import re
import time
import urllib.parse
from typing import Any, Optional
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from app import config
from app.models import FoodItem, NutritionInfo

# One line per scrape/enrichment/prewarm event - phase timings so production
# logs can actually show where time goes, without logging every individual
# label fetch (hundreds per cold hall - that would just be noise). Uses
# basicConfig's own "no-op if a handler already exists" behavior, so this is
# safe to call regardless of whatever uvicorn's own logging setup does.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("slugeats.scraper")

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


# Confirmed live against nutrition.sa.ucsc.edu (2026-09): a recipe with no
# published label renders as literally nothing but this one line - no
# "Nutrition Facts" heading, no Serving Size, no Calories line at all.
_NOT_AVAILABLE_PHRASE = "not available for this recipe"

# A distinct, separately-confirmed pattern: some recipes (station/build-your-
# own concepts like "Pasta Bar", "Rice Bowl Bar") DO have a normal, fully
# structured label - Nutrition Facts, Serving Size, a real Calories line -
# with every field genuinely reported as 0, and FoodPro says so explicitly
# in its own INGREDIENTS line. This is FoodPro's own confirmation that the
# all-zero result is deliberate, not a parser gap - see _looks_suspicious().
_INTENTIONALLY_BLANK_PHRASE = "intentionally left blank"


def parse_label(page_text: str, page_html: str = "") -> dict[str, Any]:
    """
    Scrape one label.aspx page into a plain dict (JSON-cacheable).

    Sets data["status"] to exactly one of:
      "confirmed_no_label" - the page itself says so (_NOT_AVAILABLE_PHRASE).
        This will never resolve; no point re-enriching it.
      "success" - a numeric Calories value was found, whatever it is
        (including a genuine 0 - see _looks_suspicious for that case).
      "parse_failed" - the page loaded, didn't say "not available", but no
        Calories value could be extracted anyway: an unexpected page
        (session/redirect/error page slipping past the HTTP-status check) or
        a real label in a markup shape these patterns don't handle. This
        must NOT be treated as equivalent to "confirmed no label" - callers
        (see RecipeCache.needs_enrichment) keep retrying it rather than
        caching it as final truth. Investigated live against 257 real
        recipes for this audit: zero instances found - but the code must
        not silently collapse this into "no data" if one ever occurs.
    """
    text = _clean(page_text)
    lower = text.lower()

    data: dict[str, Any] = {key: _num(text, pat) for key, pat in _LABEL_PATTERNS.items()}

    if _NOT_AVAILABLE_PHRASE in lower:
        data["status"] = "confirmed_no_label"
    elif data["calories"] is not None:
        data["status"] = "success"
    else:
        data["status"] = "parse_failed"

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


def _looks_suspicious(record: dict[str, Any]) -> Optional[str]:
    """
    Conservative, log-only sanity check for a "success" parse - never changes
    what gets cached or returned, only flags it for a human to check against
    FoodPro's own source. Returns a short reason string, or None if nothing
    looks off.

    Deliberately narrow: a real, non-trivial serving size alongside every
    core macro field being exactly zero AND FoodPro not itself explaining it
    (intentionally-left-blank recipes are self-explained, not suspicious;
    zero-calorie drinks/seasonings/condiments are common and real). This is
    detection, not correction - it never fabricates or overrides a value.
    """
    if record.get("status") != "success":
        return None
    if _INTENTIONALLY_BLANK_PHRASE in (record.get("ingredients") or "").lower():
        return None
    serving_size = (record.get("serving_size") or "").strip()
    if not serving_size:
        return None
    macros = (record.get("calories"), record.get("protein_g"), record.get("carbs_g"), record.get("fat_g"))
    if all(v == 0 for v in macros):
        return f"all-zero macros with serving_size={serving_size!r}"
    return None


def _log_parse_result(
    rec_num: str, record: dict[str, Any], hall_slug: str, name_by_rec_num: Optional[dict[str, str]]
) -> None:
    """
    One line per freshly-fetched label, only when something's worth a human's
    attention - a normal successful parse of an ordinary item logs nothing
    here (that would be noise on every cold hall). Never logs raw HTML - just
    enough identifying information to go look the recipe up: name (when
    known), rec_num, hall, and why it was flagged.
    """
    name = (name_by_rec_num or {}).get(rec_num, "?")
    status = record.get("status")
    if status == "parse_failed":
        logger.warning(
            "PARSE_FAILED name=%r rec_num=%s hall=%s - label loaded but no Calories value found; "
            "will retry on a later request rather than being treated as confirmed-absent",
            name, rec_num, hall_slug,
        )
        return
    if status == "success":
        reason = _looks_suspicious(record)
        if reason:
            logger.info("SUSPICIOUS name=%r rec_num=%s hall=%s reason=%s", name, rec_num, hall_slug, reason)


def _record_status(record: dict[str, Any]) -> str:
    """
    "success" | "confirmed_no_label" | "parse_failed", for any record shape.

    Cache records written by this version of the scraper already carry
    "status" directly (see parse_label). Records written by the pre-audit
    version instead carried a bare "available" boolean, which collapsed
    "confirmed no label" and "parser couldn't find Calories" into the same
    False-shaped bucket - this reinterprets those under the new, more honest
    three-way split, so an old cache file self-heals (a previously-stuck
    parse_failed masquerading as confirmed-absent becomes retryable again)
    without needing to wipe or migrate the file on disk.
    """
    status = record.get("status")
    if status is not None:
        return status
    if record.get("available") is False:
        return "confirmed_no_label"
    if record.get("calories") is not None:
        return "success"
    return "parse_failed"


def _nutrition_from(record: Optional[dict[str, Any]]) -> NutritionInfo:
    """
    Build the wire NutritionInfo for one item's recipe cache record.

    Three states a caller must not conflate (see NutritionInfo.pending's
    docstring in models.py, and _record_status above):
      record is None, or status == "parse_failed": pending=True - nobody has
        a final answer yet, a later request may. Treating a parse failure
        the same as "never scraped" (rather than as "confirmed absent") is
        deliberate: it keeps getting retried instead of being treated as
        permanent recipe truth on the strength of a single bad response.
      status == "confirmed_no_label": pending=False, all null - FoodPro
        itself says this recipe has no label. This will never resolve.
      status == "success": pending=False, real values (however implausible
        they may look - see _looks_suspicious, which only logs, never
        changes what's returned here).
    """
    if not record or _record_status(record) == "parse_failed":
        return NutritionInfo(pending=True)
    if _record_status(record) == "confirmed_no_label":
        return NutritionInfo(pending=False)
    return NutritionInfo(
        calories=record.get("calories"),
        protein_g=record.get("protein_g"),
        carbs_g=record.get("carbs_g"),
        fat_g=record.get("fat_g"),
        fiber_g=record.get("fiber_g"),
        sugar_g=record.get("sugar_g"),
        sodium_mg=record.get("sodium_mg"),
        serving_size=record.get("serving_size"),
        pending=False,
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

    def needs_enrichment(self, rec_num: str) -> bool:
        """
        True if this recipe has no *final* answer yet: never scraped, or the
        one cached attempt was "parse_failed" (page loaded, wasn't confirmed
        absent, but no Calories value could be extracted - see parse_label).
        "success" and "confirmed_no_label" are the only final states; a
        parse_failed record is deliberately never final, so it keeps getting
        retried on the next enrichment pass rather than being treated as
        permanent recipe truth on the strength of one bad response. Also
        correctly reinterprets pre-audit cache records that only ever had an
        "available" boolean - see _record_status.
        """
        record = self._data.get(rec_num)
        if record is None:
            return True
        return _record_status(record) == "parse_failed"

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

        # v1.1.0: background nutrition enrichment (see scrape_day / _spawn_
        # background_enrichment). _enriching claims rec_nums the moment a
        # background task takes them on, so a second near-simultaneous
        # request can't schedule duplicate work for the same recipes.
        # _background_tasks holds strong refs so asyncio can't GC a task
        # that's still running (the standard "fire and forget" gotcha).
        self._enriching: set[str] = set()
        self._background_tasks: set[asyncio.Task] = set()

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
        # Cancel rather than await: a background enrichment task mid-request
        # against a browser we're about to close would just raise once the
        # page disappears under it - cancelling is the clean version of that.
        for task in list(self._background_tasks):
            task.cancel()
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

    async def _enrich_missing(
        self,
        hall_slug: str,
        date_str: str,
        rec_nums: list[str],
        budget_seconds: Optional[float],
        name_by_rec_num: Optional[dict[str, str]] = None,
    ) -> int:
        """
        Fetch nutrition labels for the given rec_nums, in order, until either
        the list is exhausted, budget_seconds elapses, MAX_LABELS_PER_RUN is
        hit, or too many fetches fail in a row (FoodPro having a bad moment -
        stop pressing it, pick up later).

        IMPORTANT: this assumes the caller already holds self._lock for the
        entire call - that's only correct for the *synchronous* phase in
        scrape_day(), which is bounded by SYNC_ENRICHMENT_BUDGET_SECONDS and
        is part of fulfilling the very request that's already holding the
        lock's turn. It is NOT used for background enrichment (see
        _run_background_enrichment below) - holding this lock for an entire
        unbounded background batch (proven in testing: 107s for 244 items)
        is exactly what let one background batch block every other
        hall/meal's request, and even startup prewarming, behind it.

        Always re-checks the recipe cache before fetching: another caller
        (a previous background pass, or another request) may have already
        filled a given rec_num in since this list was built. Returns how
        many labels were actually fetched, for logging.
        """
        start = time.monotonic()
        fetched = 0
        consecutive_failures = 0
        for rec_num in rec_nums:
            if not self.recipes.needs_enrichment(rec_num):
                continue
            if budget_seconds is not None and (time.monotonic() - start) >= budget_seconds:
                break
            if fetched >= config.MAX_LABELS_PER_RUN:
                break
            record = await self._scrape_label(rec_num, hall_slug, date_str)
            if record is None:
                consecutive_failures += 1
                if consecutive_failures >= config.MAX_CONSECUTIVE_FAILURES:
                    break
                continue
            consecutive_failures = 0
            self.recipes.put(rec_num, record)
            _log_parse_result(rec_num, record, hall_slug, name_by_rec_num)
            fetched += 1
        self.recipes.flush()
        return fetched

    async def _run_background_enrichment(
        self,
        hall_slug: str,
        date_str: str,
        rec_nums: list[str],
        name_by_rec_num: Optional[dict[str, str]] = None,
    ) -> int:
        """
        Background counterpart to _enrich_missing - fetches one label per
        self._lock acquisition instead of one acquisition for the whole
        batch, so a foreground request already waiting on the lock is
        serviced after at most one in-flight label fetch (~1s), not after
        the entire background batch (confirmed by testing: this was 107s+
        for a real cold hall before this fix).

        This works because asyncio.Lock is FIFO-fair even under a tight
        release-then-immediately-reacquire loop: a waiter that started
        waiting before this loop's next acquire() call is guaranteed to go
        first (CPython's Lock.acquire() only takes its fast path when there
        are no *live* waiters already queued - see asyncio/locks.py). So a
        foreground request queued up during one label fetch jumps ahead of
        this loop's next iteration automatically; nothing here has to know
        or care that it happened.

        Same MAX_LABELS_PER_RUN cap and consecutive-failure circuit breaker
        as the synchronous phase; no time budget here since nothing is
        waiting on this specific call to finish.
        """
        fetched = 0
        consecutive_failures = 0
        for rec_num in rec_nums:
            if not self.recipes.needs_enrichment(rec_num):
                continue
            if fetched >= config.MAX_LABELS_PER_RUN:
                break
            async with self._lock:
                # Re-check under the lock: whoever we yielded to while
                # queued for our turn may have just fetched this same one.
                if not self.recipes.needs_enrichment(rec_num):
                    continue
                record = await self._scrape_label(rec_num, hall_slug, date_str)
            if record is None:
                consecutive_failures += 1
                if consecutive_failures >= config.MAX_CONSECUTIVE_FAILURES:
                    break
                continue
            consecutive_failures = 0
            self.recipes.put(rec_num, record)
            self.recipes.flush()
            _log_parse_result(rec_num, record, hall_slug, name_by_rec_num)
            fetched += 1
        return fetched

    def _spawn_background_enrichment(
        self,
        hall_slug: str,
        date_str: str,
        rec_nums: list[str],
        name_by_rec_num: Optional[dict[str, str]] = None,
    ) -> None:
        """
        Fire-and-forget enrichment for whatever's still missing after the
        synchronous budget ran out. Never awaited by a request - the menu
        response has already gone out by the time this runs.

        Claims rec_nums up front (self._enriching) so a second request
        landing moments later, for the same or an overlapping menu, doesn't
        also spawn a redundant task for recipes already being fetched -
        recipes are global (one label per RecNumAndPort, any hall/date), so
        "already being fetched" applies regardless of which hall/date/meal
        asked for it.
        """
        to_claim = [r for r in rec_nums if r not in self._enriching]
        if not to_claim:
            return
        self._enriching.update(to_claim)

        async def _run() -> None:
            start = time.monotonic()
            try:
                fetched = await self._run_background_enrichment(hall_slug, date_str, to_claim, name_by_rec_num)
                logger.info(
                    "background_enrich hall=%s date=%s claimed=%d fetched=%d elapsed=%.2fs",
                    hall_slug, date_str, len(to_claim), fetched, time.monotonic() - start,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                # Never let a background scrape take the API down - this is
                # strictly a nice-to-have over the next request re-fetching
                # the same rows and finding it still missing.
                logger.exception("background_enrich failed hall=%s date=%s", hall_slug, date_str)
            finally:
                self._enriching.difference_update(to_claim)

        task = asyncio.create_task(_run())
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    async def scrape_day(
        self, hall_slug: str, date_str: str, menu_type: str
    ) -> list[dict[str, Any]]:
        """
        Scrape one hall/date/meal into cacheable dicts.

        v1.1.0: menu rows and nutrition enrichment are decoupled. This only
        blocks on menu rows (fast - a couple of page loads) plus a small,
        time-boxed batch of missing labels (SYNC_ENRICHMENT_BUDGET_SECONDS),
        then returns - so a caller gets a usable menu back in seconds even
        completely cold, not the ~247s a full 260-item cold enrichment used
        to take. Whatever nutrition didn't fit in the budget keeps getting
        filled in by a background task after this returns (see
        _spawn_background_enrichment) and shows up on a later request once
        it lands in the recipe cache - no extra scrape needed for that, the
        menu rows are already cached.
        """
        request_start = time.monotonic()
        async with self._lock:
            bootstrap_start = time.monotonic()
            await self._ensure_session(hall_slug)
            bootstrap_elapsed = time.monotonic() - bootstrap_start

            menu_start = time.monotonic()
            response = await self._goto(_long_menu_url(hall_slug, date_str, menu_type))
            menu_fetch_elapsed = time.monotonic() - menu_start

            if response is not None and response.status >= 500:
                # FoodPro answers 500 for dates it has no menu for - not an
                # error worth raising, the hall just isn't serving that meal.
                rows: list[dict[str, Any]] = []
                menu_parse_elapsed = 0.0
            else:
                parse_start = time.monotonic()
                rows = parse_long_menu(await self._page.content())
                menu_parse_elapsed = time.monotonic() - parse_start

            # Name lookup purely for diagnostics (_log_parse_result) - never
            # affects what gets scraped or cached. A recipe can appear under
            # more than one name/station in principle; first-seen wins,
            # which is fine for a log line's sake.
            name_by_rec_num = {
                row["rec_num"]: row["name"] for row in rows if row.get("rec_num")
            }

            # A recipe can appear at more than one station sharing one label -
            # dict.fromkeys dedupes while preserving first-seen menu order.
            # needs_enrichment (not a bare cache-hit check) so a recipe whose
            # only cached attempt was "parse_failed" is retried here too,
            # rather than being treated as done.
            missing = list(dict.fromkeys(
                rec_num
                for row in rows
                if (rec_num := row.get("rec_num")) and self.recipes.needs_enrichment(rec_num)
            ))

            sync_fetched = 0
            if missing:
                sync_fetched = await self._enrich_missing(
                    hall_slug, date_str, missing,
                    budget_seconds=config.SYNC_ENRICHMENT_BUDGET_SECONDS,
                    name_by_rec_num=name_by_rec_num,
                )

        # Lock released - hand off whatever the sync budget didn't cover.
        remaining = [r for r in missing if self.recipes.needs_enrichment(r)]
        if remaining:
            self._spawn_background_enrichment(hall_slug, date_str, remaining, name_by_rec_num)

        logger.info(
            "scrape hall=%s date=%s meal=%s items=%d bootstrap=%.2fs menu_fetch=%.2fs "
            "menu_parse=%.2fs sync_enrich=%d/%d background_queued=%d total=%.2fs",
            hall_slug, date_str, menu_type, len(rows), bootstrap_elapsed, menu_fetch_elapsed,
            menu_parse_elapsed, sync_fetched, len(missing), len(remaining),
            time.monotonic() - request_start,
        )
        return rows


_scraper = FoodProScraper()

# Guards against two concurrent API calls scraping the same hall/date/meal.
_inflight: dict[tuple, asyncio.Task] = {}


def _current_pacific_meal_and_date() -> tuple[str, str]:
    """
    ("today", "the meal period someone opening the app right now most likely
    wants") in UCSC's own timezone. Mirrors the frontend's own
    defaultMealForNow() threshold (frontend/src/utils/date.ts) exactly:
    breakfast before 10, lunch before 15, dinner otherwise - the point is to
    prewarm whatever a visitor's own client would default to right now, and
    that heuristic runs client-side against the visitor's local clock, which
    for UCSC's actual users is Pacific in the overwhelming common case.
    """
    now = datetime.datetime.now(ZoneInfo("America/Los_Angeles"))
    meal = "breakfast" if now.hour < 10 else "lunch" if now.hour < 15 else "dinner"
    return meal, now.date().isoformat()


async def _prewarm() -> None:
    """
    Best-effort, one-shot warm-up kicked off from startup() - not a loop, not
    recurring, runs exactly once per process boot, so it's inherently bounded
    and can never turn into runaway scraping on its own.

    Deliberately narrow: only the app's default hall (the first dining hall
    MenuPage.tsx selects for a fresh visitor with nothing picked yet), only
    today, only the current meal period - the single combination essentially
    every cold-start visitor requests first. Scraping every hall here instead
    would queue several halls' worth of work onto the one shared browser page
    ahead of whatever a real visitor actually asks for next, which could
    leave that visitor waiting *longer* than if this didn't run at all.

    Worth doing at all because Render's disk does not persist across deploys
    (confirmed in production: cache_stats() reads 0 cached recipes/menus
    immediately after a fresh deploy) - so every boot starts from a fully
    cold cache regardless, and this just gives the most likely first request
    a head start instead of only starting once that request actually arrives.

    Uses the exact same path a real request would (_get_rows), so it composes
    safely with everything that already guards that path: the per-key
    in-flight dedupe (a real request for the same hall/date/meal arriving
    while this runs shares this task rather than double-scraping) and the
    scraper's own request pacing/timeouts/retry limits. Any failure here is
    caught and logged, never raised - this is a nice-to-have, not something
    that should ever be able to affect a real request.
    """
    try:
        default_hall = next(iter(config.DINING_HALLS), None)
        if not default_hall:
            return
        meal, today = _current_pacific_meal_and_date()
        logger.info("prewarm start hall=%s date=%s meal=%s", default_hall, today, meal)
        await _get_rows(default_hall, meal, today)
        logger.info("prewarm done hall=%s date=%s meal=%s", default_hall, today, meal)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("prewarm failed")


async def startup() -> None:
    """Launch the browser up front so the first request isn't slow."""
    if not config.USE_MOCK_DATA:
        await _scraper.start()
        if config.PREWARM_ON_STARTUP:
            # Not awaited - readiness (GET /) must not wait on this.
            task = asyncio.create_task(_prewarm())
            _scraper._background_tasks.add(task)
            task.add_done_callback(_scraper._background_tasks.discard)


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

        # A row with no rec_num at all (rare) has nothing that could ever be
        # looked up - that's a confirmed absence, not "check back later", so
        # don't route it through _nutrition_from(None), which means pending.
        nutrition = _nutrition_from(record) if rec_num else NutritionInfo(pending=False)

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
                nutrition=nutrition,
                icons=icons,
            )
        )

    return items


async def _get_rows(hall_slug: str, menu_type: str, date_str: str) -> list[dict[str, Any]]:
    """Cached menu rows for one hall/date/meal. Scrapes at most once."""
    if config.USE_MOCK_DATA:
        from app.mock_data import get_mock_rows

        return get_mock_rows(hall_slug, menu_type, date_str)

    lookup_start = time.monotonic()
    path = _menu_cache_path(hall_slug, date_str, menu_type)
    cached = _read_json(path)
    if cached:
        rows = cached.get("rows", [])
        # Closed halls cache briefly; published menus cache for the full TTL.
        ttl = config.CACHE_TTL_SECONDS if rows else config.EMPTY_CACHE_TTL_SECONDS
        if (time.time() - cached.get("fetched_at", 0)) < ttl:
            logger.info(
                "menu_cache HIT hall=%s date=%s meal=%s items=%d lookup=%.3fs",
                hall_slug, date_str, menu_type, len(rows), time.monotonic() - lookup_start,
            )
            return rows

    logger.info("menu_cache MISS hall=%s date=%s meal=%s", hall_slug, date_str, menu_type)
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
