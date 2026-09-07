import { describe, expect, it } from "vitest";
import { isExtra } from "./extras";

describe("isExtra", () => {
  it("classifies real condiments-station items as extras (real UCSC menu data)", () => {
    // Confirmed real examples from a live UCSC Dining "Condiments" station.
    expect(isExtra({ name: "Cholula Chipotle Hot Sauce", station: "Condiments" })).toBe(true);
    expect(isExtra({ name: "Tajin Seasoning", station: "Condiments" })).toBe(true);
    expect(isExtra({ name: "Tapatio Salsa Picante", station: "Condiments" })).toBe(true);
    expect(isExtra({ name: "Cholula", station: "Condiments" })).toBe(true);
  });

  it("classifies by name suffix even outside a condiments station", () => {
    expect(isExtra({ name: "Ranch Dressing", station: "Salad Bar" })).toBe(true);
    expect(isExtra({ name: "Tabasco Green Pepper Sauce", station: "Grill" })).toBe(true);
    expect(isExtra({ name: "Maple Syrup", station: "Breakfast" })).toBe(true);
    expect(isExtra({ name: "Ketchup", station: null })).toBe(true);
    expect(isExtra({ name: "Whipped Cream", station: "Dessert" })).toBe(true);
  });

  it("does NOT flag real dishes whose names loosely resemble condiment words", () => {
    // The exact false-positive trap a naive substring match would fall into.
    expect(isExtra({ name: "Ranch Chili Beans", station: "Entrees" })).toBe(false);
    expect(isExtra({ name: "BBQ Pork Ribs", station: "Grill" })).toBe(false);
    expect(isExtra({ name: "Beef Stir-Fry Noodles", station: "Global" })).toBe(false);
    expect(isExtra({ name: "Honey Garlic Chicken", station: "Grill" })).toBe(false);
    expect(isExtra({ name: "Saucy Chicken Wings", station: "Grill" })).toBe(false);
  });

  it("never classifies by nutrition magnitude - small/low-cal real food stays normal", () => {
    // isExtra's signature doesn't even accept calories/protein/serving size,
    // but assert the intent explicitly: real low-calorie foods pass through.
    expect(isExtra({ name: "Steamed Broccoli", station: "Salad Bar" })).toBe(false);
    expect(isExtra({ name: "Fresh Fruit Cup", station: "Breakfast" })).toBe(false);
    expect(isExtra({ name: "Side Salad", station: "Salad Bar" })).toBe(false);
    expect(isExtra({ name: "Black Coffee", station: "Beverages" })).toBe(false);
  });

  it("shows the item normally when uncertain (no station or name signal)", () => {
    expect(isExtra({ name: "Grilled Chicken Breast", station: "Grill" })).toBe(false);
    expect(isExtra({ name: "Caesar Salad", station: "Salad Bar" })).toBe(false);
    expect(isExtra({ name: "Kosher Dill Pickles", station: "Deli Bar" })).toBe(false);
    expect(isExtra({ name: "Vegan Chipotle Gardein", station: "Entrees" })).toBe(false);
  });

  it("matches station words as whole words, not substrings of an unrelated station name", () => {
    // A hypothetical "Seasonal Specials" station should not trip "season".
    expect(isExtra({ name: "Autumn Harvest Bowl", station: "Seasonal Specials" })).toBe(false);
  });

  it("is case-insensitive on both station and name", () => {
    expect(isExtra({ name: "ketchup", station: "CONDIMENTS" })).toBe(true);
    expect(isExtra({ name: "Ranch DRESSING", station: null })).toBe(true);
  });
});
