// v2.0: single calorie-progress ring, replacing v1.1's Apple-Fitness-style
// triple ring (calories/carbs/fat rings + protein legend). The new design
// puts all three macros as equal, legible progress bars underneath instead
// (see MacroProgress) - one ring for the one number that's the primary
// at-a-glance signal, matching the mockups exactly.

interface Props {
  value: number;
  goal: number;
}

const RADIUS = 88;
const STROKE = 12;

function clampPct(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, (value / goal) * 100));
}

export function CalorieRing({ value, goal }: Props) {
  const pct = clampPct(value, goal);
  const circumference = 2 * Math.PI * RADIUS;
  const offset = circumference * (1 - pct / 100);

  return (
    <svg className="ring-svg" viewBox="0 0 200 200" role="img" aria-label="Daily calorie progress">
      <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--surface-sunken)" strokeWidth={STROKE} />
      <circle
        cx="100"
        cy="100"
        r={RADIUS}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 100 100)"
        style={{ transition: "stroke-dashoffset 0.5s cubic-bezier(0.25,1,0.5,1)" }}
      />
    </svg>
  );
}
