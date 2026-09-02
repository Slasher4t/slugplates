// Mirrors app/models.py exactly - keep these two in sync by hand, there's no
// codegen step. snake_case field names match the backend's JSON as-is rather
// than translating case, so a payload can be copy-pasted straight from the
// API into a fixture without renaming anything.

export type MealType = "breakfast" | "lunch" | "dinner";

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];

export interface NutritionInfo {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  serving_size: string | null;
}

export interface FoodItem {
  id: string;
  name: string;
  hall_id: string;
  hall_name: string;
  menu_type: MealType;
  date: string; // YYYY-MM-DD
  station: string | null;
  portion: string | null;
  nutrition: NutritionInfo;
  icons: string[];
}

export interface LocationGroups {
  dining_halls: Record<string, string>;
  cafes_markets: Record<string, string>;
}
