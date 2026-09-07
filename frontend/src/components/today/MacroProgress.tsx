// Protein/Carbs/Fat as three equal progress bars (mockup: "Protein 112g /
// 160g" over a thin bar, repeated for Carbs and Fat) - replaces v1.1's
// dot+number-only MacroLegend, now that these read as real progress toward a
// goal rather than a legend for the old triple-ring.

interface MacroDatum {
  label: string;
  value: number;
  goal: number;
  colorVar: string; // e.g. "--rose"
}

interface Props {
  protein: number;
  proteinGoal: number;
  carbs: number;
  carbsGoal: number;
  fat: number;
  fatGoal: number;
}

function clampPct(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, (value / goal) * 100));
}

export function MacroProgress({ protein, proteinGoal, carbs, carbsGoal, fat, fatGoal }: Props) {
  const macros: MacroDatum[] = [
    { label: "Protein", value: protein, goal: proteinGoal, colorVar: "--rose" },
    { label: "Carbohydrates", value: carbs, goal: carbsGoal, colorVar: "--sage" },
    { label: "Fat", value: fat, goal: fatGoal, colorVar: "--accent" },
  ];

  return (
    <div className="macro-progress">
      {macros.map((m) => (
        <div className="macro-progress-row" key={m.label}>
          <div className="macro-progress-label">
            <span>{m.label}</span>
            <span className="macro-progress-value">
              {Math.round(m.value)}g <span className="of">/ {Math.round(m.goal)}g</span>
            </span>
          </div>
          <div className="macro-progress-track">
            <div
              className="macro-progress-fill"
              style={{ width: `${clampPct(m.value, m.goal)}%`, background: `var(${m.colorVar})` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
