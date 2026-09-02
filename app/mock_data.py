"""
Offline stand-in for the FoodPro scraper.

Emits rows in the same shape parse_long_menu() produces (name / rec_num /
station / portion / icons) plus nutrition, so app/foodpro_scraper.py can serve
them through the identical code path with USE_MOCK_DATA=1 - no browser, no
network. Handy for frontend work, tests, and CI.

Station names and portion strings below are copied from real FoodPro pages so
the fake data looks like the real thing.
"""

import random

from app.models import FoodItem, NutritionInfo

STATIONS = {
    "breakfast": ["Breakfast", "Clean Plate", "Campus Bakery", "Cereal", "Beverages"],
    "lunch": ["Lunch", "Clean Plate", "Grill", "Pizza", "Cold Bars", "Beverages"],
    "dinner": ["Dinner", "Clean Plate", "Pasta Bar", "Global Kitchen", "Beverages"],
}

# name, portion, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, icons
FOOD_POOL = {
    "breakfast": [
        ("Cage-Free Scrambled Eggs", "3 oz", 133, 10.5, 0.9, 9.4, 0, 0.2, 108.9, ["Vegetarian", "Egg", "Gluten Friendly"]),
        ("Hard Boiled Cage-Free Egg", "1 ea", 78, 6.3, 0.6, 5.3, 0, 0.6, 62.0, ["Vegetarian", "Egg", "Gluten Friendly"]),
        ("Organic Gluten-Free Oatmeal", "6 ozl", 150, 5.0, 27.0, 3.0, 4.0, 1.0, 5.0, ["Vegan", "Gluten Friendly"]),
        ("Potatoes O'Brien", "3 oz", 110, 2.0, 18.0, 3.5, 2.0, 1.0, 210.0, ["Vegan", "Gluten Friendly"]),
        ("Sausage Links", "2 ea", 150, 11.0, 1.0, 11.0, 0, 0, 380.0, ["Pork", "Gluten Friendly"]),
        ("Texas French Toast", "2 ea", 260, 7.0, 45.0, 6.0, 1.0, 12.0, 320.0, ["Vegetarian", "Egg", "Milk", "Wheat"]),
        ("Lemon Poppyseed Muffin", "1 ea", 288, 2.1, 36.8, 15.2, 0.6, 21.8, 283.5, ["Vegetarian", "Egg", "Wheat"]),
        ("Nonfat Milk", "8 ozl", 83, 8.3, 12.1, 0.2, 0, 12.1, 102.8, ["Vegetarian", "Milk", "Gluten Friendly"]),
    ],
    "lunch": [
        ("Grilled Chicken Breast", "4 oz", 220, 38.0, 0.0, 6.0, 0, 0, 340.0, ["Gluten Friendly"]),
        ("Cheese Pizza Slice", "1 ea", 285, 12.0, 33.0, 11.0, 2.0, 4.0, 560.0, ["Vegetarian", "Milk", "Wheat"]),
        ("Beyond Burger Patty", "1 ea", 250, 20.0, 8.0, 15.0, 2.0, 0, 390.0, ["Vegan", "Soy"]),
        ("Steamed Brown Rice", "4 oz", 215, 5.0, 45.0, 2.0, 3.5, 0, 5.0, ["Vegan", "Gluten Friendly"]),
        ("Black Bean Bowl", "8 ozl", 310, 15.0, 52.0, 5.0, 15.0, 2.0, 420.0, ["Vegan", "Gluten Friendly"]),
        ("Teriyaki Tofu", "3 oz", 240, 16.0, 20.0, 11.0, 2.0, 12.0, 610.0, ["Vegan", "Soy", "Sesame"]),
        ("Steamed Broccoli", "3 oz", 55, 4.0, 10.0, 0.0, 4.0, 2.0, 30.0, ["Vegan", "Gluten Friendly"]),
        ("Grilled Salmon", "4 oz", 280, 34.0, 0.0, 15.0, 0, 0, 190.0, ["Fish", "Gluten Friendly"]),
        ("Chunky Blue Cheese Dressing", "1 ozl", 159, 1.1, 1.1, 15.9, 0, 1.1, 264.5, ["Vegetarian", "Milk"]),
    ],
    "dinner": [
        ("Roasted Turkey Breast", "4 oz", 210, 36.0, 1.0, 5.0, 0, 0, 480.0, ["Gluten Friendly"]),
        ("Garlic Mashed Potatoes", "4 oz", 190, 4.0, 30.0, 7.0, 3.0, 2.0, 350.0, ["Vegetarian", "Milk", "Gluten Friendly"]),
        ("Beef Stir Fry", "5 oz", 320, 26.0, 18.0, 15.0, 3.0, 6.0, 720.0, ["Beef", "Soy", "Sesame"]),
        ("Vegan Chili", "8 ozl", 260, 14.0, 40.0, 4.0, 12.0, 6.0, 540.0, ["Vegan", "Gluten Friendly"]),
        ("Whole Wheat Penne Pasta", "4 oz", 280, 10.0, 55.0, 2.0, 6.0, 2.0, 10.0, ["Vegan", "Wheat"]),
        ("Marinara Sauce", "2 ozl", 60, 2.0, 12.0, 1.0, 2.0, 7.0, 320.0, ["Vegan", "Gluten Friendly"]),
        ("Roasted Vegetables", "3 oz", 90, 3.0, 15.0, 3.0, 4.0, 6.0, 150.0, ["Vegan", "Gluten Friendly"]),
        ("Chicken Tikka Masala", "5 oz", 340, 28.0, 16.0, 18.0, 2.0, 8.0, 690.0, ["Milk", "Gluten Friendly"]),
        ("Garlic Naan", "1 ea", 260, 8.0, 45.0, 6.0, 2.0, 3.0, 420.0, ["Vegetarian", "Milk", "Wheat"]),
    ],
}


def get_mock_rows(hall_slug: str, menu_type: str, date_str: str) -> list[dict]:
    """Deterministic per hall+meal+date, so repeat calls stay stable."""
    rng = random.Random(f"{hall_slug}|{menu_type}|{date_str}")
    pool = list(FOOD_POOL[menu_type])
    rng.shuffle(pool)
    stations = STATIONS[menu_type]

    rows = []
    for index, entry in enumerate(pool):
        name, portion, cal, protein, carbs, fat, fiber, sugar, sodium, icons = entry
        rows.append(
            {
                "name": name,
                "rec_num": f"{900000 + index}*{index % 8 + 1}",
                "station": stations[index % len(stations)],
                "portion": portion,
                "icons": icons,
                "nutrition": {
                    "calories": cal,
                    "protein_g": protein,
                    "carbs_g": carbs,
                    "fat_g": fat,
                    "fiber_g": fiber,
                    "sugar_g": sugar,
                    "sodium_mg": sodium,
                    "serving_size": portion,
                },
            }
        )
    return rows


def mock_items_from_rows(
    rows: list[dict], hall_slug: str, date_str: str, menu_type: str
) -> list[FoodItem]:
    from app.config import ALL_LOCATIONS

    hall_name = ALL_LOCATIONS.get(hall_slug, hall_slug)
    return [
        FoodItem(
            id=f"{hall_slug}:{date_str}:{menu_type}:{row['rec_num']}",
            name=row["name"],
            hall_id=hall_slug,
            hall_name=hall_name,
            menu_type=menu_type,
            date=date_str,
            station=row.get("station"),
            portion=row.get("portion"),
            nutrition=NutritionInfo(**row["nutrition"]),
            icons=row.get("icons", []),
        )
        for row in rows
    ]
