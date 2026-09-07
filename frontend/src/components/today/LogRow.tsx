// v2.0: a persistent, always-visible remove affordance (matches the
// mockup's small circular minus icon) instead of v1.1's hover/swipe-reveal
// pattern - simpler and more discoverable, same underlying onRemove
// capability either way.

import type { LogEntry } from "../../context/LogContext";
import { MinusCircleIcon } from "../icons";

interface Props {
  entry: LogEntry;
  onRemove: () => void;
}

export function LogRow({ entry, onRemove }: Props) {
  const metaParts: string[] = [];
  if (entry.calories != null) metaParts.push(`${Math.round(entry.calories)} cal`);
  if (entry.protein_g != null) metaParts.push(`${Math.round(entry.protein_g)}g protein`);

  return (
    <div className="log-row">
      <div className="log-row-info">
        <div className="log-row-name">{entry.name}</div>
        <div className="log-row-meta">{metaParts.join(" · ") || "Nutrition unavailable"}</div>
      </div>
      <button className="log-row-remove" onClick={onRemove} aria-label={`Remove ${entry.name}`}>
        <MinusCircleIcon />
      </button>
    </div>
  );
}
