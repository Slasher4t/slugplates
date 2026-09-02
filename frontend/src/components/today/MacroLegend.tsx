// Protein has no ring (see TripleRing's header comment), so it lives here
// instead, alongside Carbs/Fat restated as plain numbers. Dot colors
// deliberately mirror the ring colors positionally (Protein reuses the rose
// that the Calories ring uses, Carbs/Fat match their own rings) rather than
// inventing a fourth accent color - same three-color palette throughout.

interface Props {
  protein: number;
  carbs: number;
  fat: number;
}

export function MacroLegend({ protein, carbs, fat }: Props) {
  const items = [
    { label: "Protein", value: protein, colorVar: "--rose" },
    { label: "Carbs", value: carbs, colorVar: "--sage" },
    { label: "Fat", value: fat, colorVar: "--accent" },
  ];
  return (
    <div className="macro-legend">
      {items.map((item) => (
        <div className="macro-legend-item" key={item.label}>
          <span className="macro-legend-dot" style={{ background: `var(${item.colorVar})` }} />
          <span className="macro-legend-val">{Math.round(item.value)}g</span>
          <span className="macro-legend-lbl">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
