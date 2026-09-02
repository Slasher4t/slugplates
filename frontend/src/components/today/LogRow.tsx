// Delete affordance: on desktop (hover-capable pointers) the delete button
// reveals on :hover via CSS alone. On touch, there's no hover, so tapping the
// row itself slides it left to reveal the same button underneath - a tap
// equivalent of iOS's swipe-to-delete rather than a real drag gesture, which
// would need a gesture library for not much extra clarity at this scale.

import { useState } from "react";
import type { LogEntry } from "../../context/LogContext";

interface Props {
  entry: LogEntry;
  onRemove: () => void;
}

export function LogRow({ entry, onRemove }: Props) {
  const [revealed, setRevealed] = useState(false);

  const metaParts: string[] = [];
  if (entry.calories != null) metaParts.push(`${Math.round(entry.calories)} cal`);
  if (entry.protein_g != null) metaParts.push(`${Math.round(entry.protein_g)}g protein`);

  return (
    <div className={`log-row-wrap${revealed ? " revealed" : ""}`}>
      <button className="log-row-delete" onClick={onRemove} aria-label={`Remove ${entry.name}`}>
        Remove
      </button>
      <div className="log-row" onClick={() => setRevealed((v) => !v)} role="button" tabIndex={0}>
        <span>
          <span className="log-row-name">{entry.name}</span>
          <span className="log-row-meta"> — {metaParts.join(" · ") || "no nutrition data"}</span>
        </span>
      </div>
    </div>
  );
}
