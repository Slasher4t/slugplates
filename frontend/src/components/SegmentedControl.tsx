// Generic sliding segmented control - used for meal period (Menu) and chart
// type (History). The thumb's position/width are computed from the selected
// index so it works with any option count without per-use math at call sites.

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel }: Props<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const widthPct = 100 / options.length;

  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={opt.value === value}
          className="segmented-option"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
      <span
        className="segmented-thumb"
        style={{ width: `calc(${widthPct}% - 2.66px)`, transform: `translateX(${index * 100}%)` }}
        aria-hidden="true"
      />
    </div>
  );
}
