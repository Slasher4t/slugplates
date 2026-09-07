// One grouped-list row for a single numeric goal (Calories/Protein/Carbs/
// Fat) - label on the left, an inline-editable number + unit on the right,
// styled to read as one row of a settings list rather than a separate form
// field with its own border.

interface Props {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

export function GoalRow({ label, unit, value, onChange, onBlur }: Props) {
  return (
    <label className="goal-row">
      <span className="goal-row-label">{label}</span>
      <span className="goal-row-input">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-label={`${label} goal`}
        />
        <span className="goal-row-unit">{unit}</span>
      </span>
    </label>
  );
}
