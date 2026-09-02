// Apple-Fitness-style triple ring. Each ring tracks its own metric against
// its own goal independently (not a shared scale) - outer Calories (rose),
// middle Carbs (sage), inner Fat (accent - navy in light mode, sky in dark,
// via the --accent CSS var so it swaps automatically with the theme).
// Protein deliberately has no ring here (see MacroLegend) - matching Apple's
// own 3-ring cap for readability, per product decision.

interface RingDatum {
  value: number;
  goal: number;
  colorVar: string; // e.g. "--rose"
  trackVar: string; // e.g. "--rose-soft"
}

interface Props {
  calories: number;
  caloriesGoal: number;
  carbs: number;
  carbsGoal: number;
  fat: number;
  fatGoal: number;
}

const RADII = [88, 66, 44] as const; // outer -> inner
const STROKE = 13;

function clampPct(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, (value / goal) * 100));
}

function Ring({ radius, pct, colorVar, trackVar }: { radius: number; pct: number; colorVar: string; trackVar: string }) {
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return (
    <>
      <circle cx="100" cy="100" r={radius} fill="none" stroke={`var(${trackVar})`} strokeWidth={STROKE} />
      <circle
        cx="100"
        cy="100"
        r={radius}
        fill="none"
        stroke={`var(${colorVar})`}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 100 100)"
        style={{ transition: "stroke-dashoffset 0.5s cubic-bezier(0.25,1,0.5,1)" }}
      />
    </>
  );
}

export function TripleRing({ calories, caloriesGoal, carbs, carbsGoal, fat, fatGoal }: Props) {
  const rings: RingDatum[] = [
    { value: calories, goal: caloriesGoal, colorVar: "--rose", trackVar: "--rose-soft" },
    { value: carbs, goal: carbsGoal, colorVar: "--sage", trackVar: "--sage-soft" },
    { value: fat, goal: fatGoal, colorVar: "--accent", trackVar: "--accent-soft" },
  ];

  return (
    <svg className="ring-svg" viewBox="0 0 200 200" role="img" aria-label="Daily calories, carbs, and fat progress">
      {rings.map((ring, i) => (
        <Ring key={i} radius={RADII[i]} pct={clampPct(ring.value, ring.goal)} colorVar={ring.colorVar} trackVar={ring.trackVar} />
      ))}
    </svg>
  );
}
