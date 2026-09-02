import type { LogEntry } from "../../context/LogContext";
import { LogRow } from "./LogRow";

interface Props {
  title: string;
  entries: LogEntry[];
  calorieSubtotal: number;
  onRemove: (entryId: string) => void;
}

export function MealLogSection({ title, entries, calorieSubtotal, onRemove }: Props) {
  return (
    <div className="meal-section">
      <div className="meal-section-header">
        <span className="meal-section-title">{title}</span>
        <span className="meal-section-cal">{entries.length ? `${Math.round(calorieSubtotal)} cal` : "—"}</span>
      </div>
      {entries.length === 0 ? (
        <div className="empty-line">Nothing logged yet</div>
      ) : (
        entries.map((entry) => <LogRow key={entry.entryId} entry={entry} onRemove={() => onRemove(entry.entryId)} />)
      )}
    </div>
  );
}
