import { useEffect, useState } from "react";
import { GoalRow } from "../components/GoalRow";
import { LocationSwitcherSheet } from "../components/menu/LocationSwitcherSheet";
import { ThemeToggle } from "../components/ThemeToggle";
import { useGoals, type Goals } from "../context/GoalsContext";
import { useMenuSelection } from "../context/MenuSelectionContext";
import { usePreferences } from "../context/PreferencesContext";
import { useLocations } from "../hooks/useLocations";
import { shortHallName } from "../utils/hallName";

const FIELDS: { key: keyof Goals; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbohydrates", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
];

export function GoalsPage() {
  const { goals, setGoals } = useGoals();
  const { locations } = useLocations();
  const { hallId, setHallId } = useMenuSelection();
  const { showExtrasByDefault, setShowExtrasByDefault } = usePreferences();
  const [hallSheetOpen, setHallSheetOpen] = useState(false);

  // Local draft so keystrokes don't thrash context/localStorage on every char.
  const [draft, setDraft] = useState<Record<keyof Goals, string>>({
    calories: String(goals.calories),
    protein_g: String(goals.protein_g),
    carbs_g: String(goals.carbs_g),
    fat_g: String(goals.fat_g),
  });

  useEffect(() => {
    setDraft({
      calories: String(goals.calories),
      protein_g: String(goals.protein_g),
      carbs_g: String(goals.carbs_g),
      fat_g: String(goals.fat_g),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit() {
    setGoals({
      calories: Number(draft.calories) || 0,
      protein_g: Number(draft.protein_g) || 0,
      carbs_g: Number(draft.carbs_g) || 0,
      fat_g: Number(draft.fat_g) || 0,
    });
  }

  const hallName = locations
    ? locations.dining_halls[hallId ?? ""] || locations.cafes_markets[hallId ?? ""]
    : null;

  return (
    <div className="goals-page">
      <h1 className="page-title">Goals</h1>

      <div className="group-label">Daily Targets</div>
      <div className="grouped-card">
        {FIELDS.map(({ key, label, unit }) => (
          <GoalRow
            key={key}
            label={label}
            unit={unit}
            value={draft[key]}
            onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
            onBlur={commit}
          />
        ))}
      </div>
      <p className="field-note">Your goals are used to calculate daily progress on the Today and History screens.</p>

      <div className="group-label">Preferences</div>
      <div className="grouped-card">
        <div className="pref-row">
          <span>Show Extras by default</span>
          <button
            role="switch"
            aria-checked={showExtrasByDefault}
            className={`switch${showExtrasByDefault ? " on" : ""}`}
            onClick={() => setShowExtrasByDefault(!showExtrasByDefault)}
          >
            <span className="switch-thumb" />
          </button>
        </div>
        <button className="pref-row pref-row-nav" onClick={() => setHallSheetOpen(true)}>
          <span>Preferred Dining Hall</span>
          <span className="pref-row-value">{hallName ? shortHallName(hallName) : "Choose"}</span>
        </button>
      </div>

      <div className="group-label">Appearance</div>
      <div className="grouped-card grouped-card-pad">
        <ThemeToggle />
      </div>

      {hallSheetOpen && locations && (
        <LocationSwitcherSheet
          locations={locations}
          selectedId={hallId}
          onSelect={(id) => {
            setHallId(id);
            setHallSheetOpen(false);
          }}
          onClose={() => setHallSheetOpen(false)}
        />
      )}
    </div>
  );
}
