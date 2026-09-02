"""
Config for SlugEats.

Data source: UCSC Dining runs CBORD FoodPro at https://nutrition.sa.ucsc.edu/
It is classic ASP.NET WebForms with server-side session state, not a REST API,
so `app/foodpro_scraper.py` drives it with a real browser (Playwright).

Confirmed site behavior (verified live against the running site):

  1. GET /                                  -> lists locations, bootstraps session
  2. GET /shortmenu.aspx?locationNum=NN...  -> sets the WebInaCartLocation cookie
  3. GET /longmenu.aspx?...&dtdate=..&mealName=..  -> the actual day's menu
  4. GET /label.aspx?...&RecNumAndPort=..   -> FDA-style nutrition label

Three findings that shape the scraper:

  * Step 1 is MANDATORY. Hitting longmenu.aspx without first loading "/" in the
    same browser context returns HTTP 500 "Runtime Error" every time. That is
    what the session bootstrap in the scraper exists for.
  * Recipe links on longmenu.aspx are plain GET hrefs carrying RecNumAndPort
    (e.g. "061002*3"), NOT __doPostBack calls. So labels can be fetched by URL
    instead of clicking 200+ links per page.
  * label.aspx output depends ONLY on RecNumAndPort. The same recipe returns a
    byte-identical label across every locationNum and dtdate, so recipe
    nutrition is cached globally and permanently (see RECIPE_CACHE_FILE).
    locationNum/dtdate are still passed because the allergen icons on the label
    only render when they are present.

To rediscover locationNum values (e.g. if UCSC adds a hall):
    python -m scripts.discover_locations
"""

import os

# --------------------------------------------------------------------------
# Mode
# --------------------------------------------------------------------------

# Flip to True for offline dev/testing - serves app/mock_data.py instead of
# touching the real site. Env var wins so you can do USE_MOCK_DATA=1 uvicorn ...
USE_MOCK_DATA = os.getenv("USE_MOCK_DATA", "0").lower() in ("1", "true", "yes")

# --------------------------------------------------------------------------
# FoodPro site structure
# --------------------------------------------------------------------------

FOODPRO_BASE_URL = "https://nutrition.sa.ucsc.edu/"

# These two are literal query-string values the site expects; they are not
# cosmetic. sName appears on every page URL, WeeksMenus on longmenu.aspx.
SITE_NAME = "UC Santa Cruz Dining"
WEEKS_MENUS = "UCSC - This Week's Menus"

# --------------------------------------------------------------------------
# Locations - locationNum values scraped from the landing page on 2026-09-01
# --------------------------------------------------------------------------
# NOTE: locationNum is a STRING, not an int. Cowell & Stevenson is "05" and the
# leading zero is significant - "5" is not accepted by the site.
#
# The site lists four full dining halls and three cafes/markets. There is no
# Porter/Kresge location in FoodPro (the old Nutrislice-era config guessed one).

LOCATIONS = {
    # slug                        location_num, display name,                              dining hall?
    "john-r-lewis-college-nine": ("40", "John R. Lewis & College Nine Dining Hall", True),
    "cowell-stevenson":          ("05", "Cowell & Stevenson Dining Hall",           True),
    "crown-merrill":             ("20", "Crown & Merrill Dining Hall",              True),
    "rachel-carson-oakes":       ("30", "Rachel Carson & Oakes Dining Hall",        True),
    "stevenson-coffee-house":    ("26", "Stevenson Coffee House",                   False),
    "perk-coffee-bar":           ("22", "Perk Coffee Bar",                          False),
    "merrill-market":            ("47", "Merrill Market",                           False),
}

# {slug: display name} - the shape the /halls endpoint returns. Dining halls only.
DINING_HALLS = {
    slug: name for slug, (_num, name, is_hall) in LOCATIONS.items() if is_hall
}

# Every location including cafes, for callers that want them.
ALL_LOCATIONS = {slug: name for slug, (_num, name, _h) in LOCATIONS.items()}

LOCATION_NUMS = {slug: num for slug, (num, _name, _h) in LOCATIONS.items()}


def location_num(slug: str) -> str:
    """FoodPro locationNum for a hall slug."""
    return LOCATION_NUMS[slug]


def location_name(slug: str) -> str:
    """Exact display name FoodPro expects in the locationName query param."""
    return ALL_LOCATIONS[slug]


# --------------------------------------------------------------------------
# Meal periods
# --------------------------------------------------------------------------

# Our API speaks lowercase; FoodPro's mealName param is capitalized.
MENU_TYPES = ["breakfast", "lunch", "dinner"]
MEAL_NAMES = {"breakfast": "Breakfast", "lunch": "Lunch", "dinner": "Dinner"}

# --------------------------------------------------------------------------
# Allergen / diet icons
# --------------------------------------------------------------------------
# longmenu.aspx renders these as <img src="LegendImages/<key>.gif" alt="">, with
# the alt attribute empty - the gif filename is the only signal. label.aspx does
# populate alt, so the labels below were harvested from real label.aspx pages.
# The five without confirmed alt text are marked; they are named from the gif.

ALLERGEN_ICONS = {
    "alcohol": "Alcohol",
    "eggs": "Egg",
    "gluten": "Gluten Friendly",
    "halal": "Halal",
    "milk": "Milk",
    "sesame": "Sesame",
    "soy": "Soy",
    "vegan": "Vegan",
    "veggie": "Vegetarian",
    "wheat": "Wheat",
    "beef": "Beef",        # alt text not yet observed
    "fish": "Fish",        # alt text not yet observed
    "nuts": "Peanut",      # alt text not yet observed
    "pork": "Pork",        # alt text not yet observed
    "treenut": "Tree Nut",  # alt text not yet observed
}

# --------------------------------------------------------------------------
# Scraping behavior - be polite, this is a university-run server
# --------------------------------------------------------------------------

HEADLESS = os.getenv("PLAYWRIGHT_HEADLESS", "1").lower() in ("1", "true", "yes")

# Pause between consecutive page loads. Menus run 180-260 items per meal, so a
# cold scrape is a lot of requests; keep them spaced and strictly sequential.
REQUEST_DELAY_SECONDS = float(os.getenv("FOODPRO_REQUEST_DELAY", "0.35"))

# Cap on nutrition labels fetched in one scrape run, so a single cold API call
# cannot turn into a 10-minute crawl. Items past the cap come back with an empty
# NutritionInfo and get filled in on the next request (the cache persists).
MAX_LABELS_PER_RUN = int(os.getenv("FOODPRO_MAX_LABELS_PER_RUN", "400"))

PAGE_TIMEOUT_MS = 30_000

# FoodPro intermittently stalls on an individual label.aspx request. Give labels
# a shorter leash than menu pages so one hung item costs seconds, not half a
# minute, and give up on a run entirely once the server stops answering at all.
LABEL_TIMEOUT_MS = int(os.getenv("FOODPRO_LABEL_TIMEOUT_MS", "15000"))
RETRY_BACKOFF_SECONDS = 2.0
MAX_CONSECUTIVE_FAILURES = 8

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 "
    "SlugEats/0.3 (UCSC student project)"
)

# --------------------------------------------------------------------------
# Disk cache
# --------------------------------------------------------------------------
# On disk, not just in memory, so restarting uvicorn doesn't re-scrape.

CACHE_DIR = os.getenv(
    "SLUGMACROS_CACHE_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".cache"),
)
MENU_CACHE_DIR = os.path.join(CACHE_DIR, "menus")

# Global recipe -> nutrition store, keyed by RecNumAndPort. Independent of hall
# and date, so it is never invalidated; a recipe is scraped once, ever.
RECIPE_CACHE_FILE = os.path.join(CACHE_DIR, "recipes.json")

# Published menus don't change, but the current week can be edited, so menu
# listings get a TTL. Recipe nutrition does not.
CACHE_TTL_SECONDS = int(os.getenv("SLUGMACROS_CACHE_TTL", str(60 * 60 * 12)))

# A hall that is closed (or hasn't published yet) returns "No Data Available".
# Re-check those far sooner than a real menu, so halls reopening at the start of
# a quarter show up the same day instead of hours later.
EMPTY_CACHE_TTL_SECONDS = int(os.getenv("SLUGMACROS_EMPTY_CACHE_TTL", str(60 * 30)))
