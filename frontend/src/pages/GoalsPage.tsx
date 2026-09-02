import { useEffect, useState } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import { useGoals, type Goals } from "../context/GoalsContext";

const FIELDS: { key: keyof Goals; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "cal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
];

export function GoalsPage() {
  const { goals, setGoals } = useGoals();
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

  return (
    <div>
      <div className="goals-form">
        {FIELDS.map(({ key, label, unit }) => (
          <div className="field-group" key={key}>
            <div className="field-label">{label}</div>
            <div className="field-input-row">
              <input
                type="number"
                inputMode="numeric"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                onBlur={commit}
              />
              <span className="field-unit">{unit}</span>
            </div>
          </div>
        ))}
        <div className="field-note">
          These four numbers drive your Today ring and legend targets. Nothing else is tracked here — no
          weight, activity level, or bulk/cut framing.
        </div>
      </div>

      <div className="field-group" style={{ marginTop: 28, maxWidth: 420 }}>
        <div className="field-label">Appearance</div>
        <ThemeToggle />
      </div>
    </div>
  );
}
