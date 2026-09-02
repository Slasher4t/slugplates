import type { FoodItem } from "../../api/types";
import { FoodRow } from "./FoodRow";

interface Props {
  items: FoodItem[];
  onAdd: (item: FoodItem) => void;
}

export function MenuList({ items, onAdd }: Props) {
  const byStation = new Map<string, FoodItem[]>();
  for (const item of items) {
    const key = item.station || "Other";
    if (!byStation.has(key)) byStation.set(key, []);
    byStation.get(key)!.push(item);
  }

  return (
    <div className="menu-grid">
      {[...byStation.entries()].map(([station, rows]) => (
        <div className="station-section" key={station}>
          <p className="station-label">{station}</p>
          {rows.map((item) => (
            <FoodRow key={item.id} item={item} onAdd={onAdd} />
          ))}
        </div>
      ))}
    </div>
  );
}
