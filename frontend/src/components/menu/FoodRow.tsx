import { useState } from "react";
import type { FoodItem } from "../../api/types";
import { CheckIcon, PlusIcon } from "../icons";

interface Props {
  item: FoodItem;
  onAdd: (item: FoodItem) => void;
}

export function FoodRow({ item, onAdd }: Props) {
  const [justAdded, setJustAdded] = useState(false);
  const cal = item.nutrition.calories;
  const protein = item.nutrition.protein_g;

  function handleAdd() {
    onAdd(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }

  const metaParts: string[] = [];
  if (cal != null) metaParts.push(`${Math.round(cal)} cal`);
  if (protein != null) metaParts.push(`${Math.round(protein)}g protein`);
  if (item.portion) metaParts.push(item.portion);
  const meta = metaParts.length ? metaParts.join(" · ") : "No nutrition data";

  return (
    <div className="food-row">
      <div className="food-row-info">
        <div className="food-name">{item.name}</div>
        <div className="food-meta">{meta}</div>
      </div>
      <button className={`add-btn${justAdded ? " added" : ""}`} onClick={handleAdd} aria-label={`Add ${item.name}`}>
        {justAdded ? <CheckIcon /> : <PlusIcon />}
      </button>
    </div>
  );
}
