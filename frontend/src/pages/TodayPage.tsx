import { CalorieRing } from "../components/today/CalorieRing";
import { MacroProgress } from "../components/today/MacroProgress";
import { MealLogSection } from "../components/today/MealLogSection";
import { useGoals } from "../context/GoalsContext";
import { useLog } from "../context/LogContext";
import type { MealType } from "../api/types";
import { formatLongDate, todayISO } from "../utils/date";

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

  const remainingCalories = Math.max(0, Math.round(goals.calories - totals.calories));
  const remainingProtein = Math.max(0, Math.round(goals.protein_g - totals.protein_g));
  const onTrack = totals.calories <= goals.calories;

  return (
    <div className="today-layout">
      <div>
        <h1 className="page-title today-title-mobile">Today</h1>
        <div className="today-date-heading">
          <h1 className="page-title">{formatLongDate(date)}</h1>
          <p className="page-subtitle">Daily nutrition summary</p>
        </div>

        <div className="ring-card">
          <CalorieRing value={totals.calories} goal={goals.calories} />
          <div className="ring-cal-line">
            <span className="ring-cal-value">{Math.round(totals.calories).toLocaleString()}</span>
            <span className="of"> / {goals.calories.toLocaleString()} CAL</span>
          </div>
          <p className={`ring-status${onTrack ? "" : " over"}`}>
            {onTrack ? "On track for today" : "Over today's calorie goal"}
          </p>

          <MacroProgress
            protein={totals.protein_g}
            proteinGoal={goals.protein_g}
            carbs={totals.carbs_g}
            carbsGoal={goals.carbs_g}
            fat={totals.fat_g}
            fatGoal={goals.fat_g}
          />
        </div>
      </div>

      <div>
        <div className="today-food-header">
          <span className="section-heading">Today's Food</span>
          <span className="today-remaining-inline">{remainingCalories.toLocaleString()} cal remaining</span>
        </div>

        {(["breakfast", "lunch", "dinner"] as MealType[]).map((mealType) => (
          <MealLogSection
            key={mealType}
            title={MEAL_LABELS[mealType]}
            entries={byMeal[mealType]}
            calorieSubtotal={subtotal(mealType)}
            onRemove={(entryId) => removeEntry(date, entryId)}
          />
        ))}

        <div className="remaining-card">
          <div className="remaining-label">Remaining</div>
          <div className="remaining-value">
            {remainingCalories.toLocaleString()} calories · {remainingProtein}g protein
          </div>
        </div>
      </div>
    </div>
  );
}
