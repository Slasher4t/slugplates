import contextlib
import datetime

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALL_LOCATIONS, DINING_HALLS, LOCATIONS, MENU_TYPES, USE_MOCK_DATA
from app.models import FoodItem, TrayRequest, TrayTotals, SuggestRequest
from app import foodpro_scraper
from app.suggest import suggest_items


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    # Launch the browser once at boot and share it for the whole process -
    # starting Chromium per request would dominate every scrape.
    await foodpro_scraper.startup()
    yield
    await foodpro_scraper.shutdown()


app = FastAPI(title="SlugEats API", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # public app, no accounts yet - tighten if that changes
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "name": "SlugEats API",
        "source": "CBORD FoodPro (nutrition.sa.ucsc.edu)",
        "mock_mode": USE_MOCK_DATA,
        "halls": DINING_HALLS,
        "menu_types": MENU_TYPES,
        "cache": foodpro_scraper.cache_stats(),
    }


@app.get("/halls")
async def list_halls(include_cafes: bool = Query(default=False)):
    """Dining halls by default; cafes/markets are opt-in. Flat {slug: name}.

    For the frontend's grouped location switcher (dining halls vs cafes &
    markets as separate sections), use GET /locations instead.
    """
    return ALL_LOCATIONS if include_cafes else DINING_HALLS


@app.get("/locations")
async def list_locations_grouped():
    """Every FoodPro location, split into the two groups the UI's location
    switcher shows: full dining halls vs. cafes/markets."""
    dining_halls = {slug: name for slug, (_num, name, is_hall) in LOCATIONS.items() if is_hall}
    cafes_markets = {slug: name for slug, (_num, name, is_hall) in LOCATIONS.items() if not is_hall}
    return {"dining_halls": dining_halls, "cafes_markets": cafes_markets}


@app.get("/menu/{hall_id}", response_model=list[FoodItem])
async def get_hall_menu(
    hall_id: str,
    menu_type: str = Query(..., description="breakfast, lunch, or dinner"),
    date: str = Query(default=None, description="YYYY-MM-DD, defaults to today"),
):
    if hall_id not in ALL_LOCATIONS:
        raise HTTPException(404, f"Unknown hall '{hall_id}'. Options: {list(ALL_LOCATIONS.keys())}")
    if menu_type not in MENU_TYPES:
        raise HTTPException(400, f"menu_type must be one of {MENU_TYPES}")

    date_str = date or datetime.date.today().isoformat()
    return await foodpro_scraper.get_day_items(hall_id, menu_type, date_str)


@app.get("/menu", response_model=list[FoodItem])
async def get_all_menus(
    menu_type: str = Query(..., description="breakfast, lunch, or dinner"),
    date: str = Query(default=None, description="YYYY-MM-DD, defaults to today"),
):
    """All halls' items for one meal period - the cross-hall search view."""
    if menu_type not in MENU_TYPES:
        raise HTTPException(400, f"menu_type must be one of {MENU_TYPES}")

    date_str = date or datetime.date.today().isoformat()
    return await foodpro_scraper.get_all_halls_items(menu_type, date_str)


@app.get("/search", response_model=list[FoodItem])
async def search_food(
    q: str = Query(..., min_length=2, description="food name to search for"),
    menu_type: str = Query(..., description="breakfast, lunch, or dinner"),
    date: str = Query(default=None, description="YYYY-MM-DD, defaults to today"),
):
    """The wedge feature: 'which hall has pizza today' style search."""
    if menu_type not in MENU_TYPES:
        raise HTTPException(400, f"menu_type must be one of {MENU_TYPES}")

    date_str = date or datetime.date.today().isoformat()
    all_items = await foodpro_scraper.get_all_halls_items(menu_type, date_str)
    q_lower = q.lower()
    return [item for item in all_items if q_lower in item.name.lower()]


@app.post("/tray/totals", response_model=TrayTotals)
async def compute_tray_totals(
    tray: TrayRequest,
    menu_type: str = Query(...),
    date: str = Query(default=None),
):
    """Given a list of {food_id, servings}, compute total macros.

    Not used by the current frontend - it keeps its own log client-side (in
    localStorage) with a nutrition snapshot on each entry, so totals are a
    pure client-side sum with no round trip. Left here since it's a small,
    harmless, independently useful endpoint (e.g. for a future server-backed
    log) and nothing asked for its removal.
    """
    date_str = date or datetime.date.today().isoformat()
    all_items = await foodpro_scraper.get_all_halls_items(menu_type, date_str)
    items_by_id = {item.id: item for item in all_items}

    totals = TrayTotals(calories=0, protein_g=0, carbs_g=0, fat_g=0)
    for tray_item in tray.items:
        food = items_by_id.get(tray_item.food_id)
        if not food or not food.nutrition.has_data:
            continue
        n = food.nutrition
        totals.calories += (n.calories or 0) * tray_item.servings
        totals.protein_g += (n.protein_g or 0) * tray_item.servings
        totals.carbs_g += (n.carbs_g or 0) * tray_item.servings
        totals.fat_g += (n.fat_g or 0) * tray_item.servings

    return totals


@app.post("/suggest", response_model=list[FoodItem])
async def suggest_food(req: SuggestRequest):
    """Given remaining macro targets, suggest items that best close the gap."""
    if req.menu_type not in MENU_TYPES:
        raise HTTPException(400, f"menu_type must be one of {MENU_TYPES}")

    all_items = await foodpro_scraper.get_all_halls_items(req.menu_type, req.date, req.hall_ids)
    return suggest_items(all_items, req.remaining)
