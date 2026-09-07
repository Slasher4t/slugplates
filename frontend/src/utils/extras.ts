// Conservative classification of "extras" (condiments/sauces/small toppings)
// so they collapse into their own section instead of crowding out real food
// in the main list. Deliberately NOT based on calories/protein/serving size -
// a real vegetable, fruit, soup, drink, or side can legitimately be small or
// low-calorie, and that must never be read as "this is a condiment."
//
// Two independent signals, either one is sufficient:
//
// 1. Station name - the strongest signal. Dining halls already group
//    condiments into their own station (confirmed against real UCSC Dining
//    menus: a "Condiments" station holding hot sauces, salsa, seasoning
//    packets, etc.), so a station whose name itself says "condiments",
//    "sauces", "dressings", "toppings", "seasonings", "spreads", or "syrups"
//    is about as reliable a signal as this gets.
//
// 2. Food name - a closed, curated list of condiment/sauce/topping nouns,
//    matched only as a whole word or as the trailing word(s) of the name
//    (e.g. "Ranch Dressing", "Tabasco Green Pepper Sauce", "Tajin
//    Seasoning") - never a bare substring search, which is how something
//    like "Ranch Chili Beans" or "BBQ Pork Ribs" would wrongly get caught by
//    "ranch"/"bbq" as loose fragments. If a name doesn't clearly end in one
//    of these nouns, it's shown normally rather than guessed at.
//
// When neither signal fires, the item is real food and stays in its normal
// station section - uncertainty always resolves to "show it."

const EXTRA_STATION_WORDS = [
  "condiment",
  "condiments",
  "sauce",
  "sauces",
  "dressing",
  "dressings",
  "topping",
  "toppings",
  "seasoning",
  "seasonings",
  "spread",
  "spreads",
  "syrup",
  "syrups",
];

// Matched only against the END of the food name (see isExtraByName), so
// "Beef Stir-Fry Noodles" doesn't get caught by a stray "fry" and "Ranch
// Chili Beans" doesn't get caught by "ranch" not even being in this list.
const EXTRA_NAME_SUFFIXES = [
  "sauce",
  "hot sauce",
  "dressing",
  "vinaigrette",
  "syrup",
  "seasoning",
  "ketchup",
  "mustard",
  "mayo",
  "mayonnaise",
  "relish",
  "salsa",
  "jam",
  "jelly",
  "honey",
  "gravy",
  "dip",
  "sprinkles",
  "croutons",
  "whipped cream",
  "cream cheese",
  "butter pat",
];

function isExtraByStation(station: string): boolean {
  const lower = station.trim().toLowerCase();
  return EXTRA_STATION_WORDS.some((word) => new RegExp(`\\b${word}\\b`).test(lower));
}

function isExtraByName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return EXTRA_NAME_SUFFIXES.some((suffix) => {
    // Whole name equals the suffix ("Ketchup") or the name ends with " <suffix>"
    // as whole words ("Tabasco Green Pepper Sauce" ends with " sauce").
    return lower === suffix || lower.endsWith(` ${suffix}`);
  });
}

export function isExtra(item: { name: string; station: string | null }): boolean {
  if (item.station && isExtraByStation(item.station)) return true;
  return isExtraByName(item.name);
}
