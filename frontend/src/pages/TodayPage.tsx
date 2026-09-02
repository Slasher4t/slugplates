import { MacroLegend } from "../components/today/MacroLegend";
import { MealLogSection } from "../components/today/MealLogSection";
import { TripleRing } from "../components/today/TripleRing";
import { useGoals } from "../context/GoalsContext";
import { useLog } from "../context/LogContext";
import type { MealType } from "../api/types";
import { todayISO } from "../utils/date";

const MEAL_LABELS: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

export function TodayPage() {
  const { goals } = useGoals();
  const { entriesForDate, totalsForDate, removeEntry } = useLog();
  const date = todayISO();

  const entries = entriesForDate(date);
  const totals = totalsForDate(date);

  const byMeal: Record<MealType, typeof entries> = { breakfast: [], lunch: [], dinner: [] };
  for (const entry of entries) byMeal[entry.mealType].push(entry);

  const subtotal = (mealType: MealType) =>
    byMeal[mealType].reduce((sum, e) => sum + (e.calories || 0), 0);

  return (
    <div className="today-layout">
      <div className="ring-card">
        <TripleRing
          calories={totals.calories}
          caloriesGoal={goals.calories}
          carbs={totals.carbs_g}
          carbsGoal={goals.carbs_g}
          fat={totals.fat_g}
          fatGoal={goals.fat_g}
        />
        <div className="ring-cal-line">
          {Math.round(totals.calories).toLocaleString()} <span className="of">of {goals.calories.toLocaleString()} cal</span>
        </div>
        <MacroLegend protein={totals.protein_g} carbs={totals.carbs_g} fat={totals.fat_g} />
      </div>

      <div>
        {(["breakfast", "lunch", "dinner"] as MealType[]).map((mealType) => (
          <MealLogSection
            key={mealType}
            title={MEAL_LABELS[mealType]}
            entries={byMeal[mealType]}
            calorieSubtotal={subtotal(mealType)}
            onRemove={(entryId) => removeEntry(date, entryId)}
          />
        ))}
      </div>
    </div>
  );
}
