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

  // v1.1.0: distinguish "still being fetched, will resolve on its own" from
  // "FoodPro confirmed this has no label" - previously indistinguishable.
  // Branches on macros specifically (cal/protein), NOT on metaParts as a
  // whole - portion comes from the menu row itself and is populated from
  // the very first response regardless of enrichment state, so a "some
  // metaPart exists" check would show the plain portion instead of "Loading
  // nutrition..." for nearly every real pending item (portion is almost
  // never actually empty).
  const metaParts: string[] = [];
  if (cal != null) metaParts.push(`${Math.round(cal)} cal`);
  if (protein != null) metaParts.push(`${Math.round(protein)}g protein`);
  if (item.portion) metaParts.push(item.portion);

  let meta: string;
  if (cal != null || protein != null) {
    meta = metaParts.join(" · ");
  } else {
    const status = item.nutrition.pending ? "Loading nutrition…" : "No nutrition data";
    meta = item.portion ? `${status} · ${item.portion}` : status;
  }

  return (
    <div className="food-row">
      <div className="food-row-info">
        <div className="food-name">{item.name}</div>
        <div className="food-meta">{meta}</div>
      </div>
      <button
        className={`add-btn${justAdded ? " added" : ""}`}
        onClick={handleAdd}
        disabled={item.nutrition.pending}
        aria-label={item.nutrition.pending ? `Nutrition still loading for ${item.name}` : `Add ${item.name}`}
      >
        {justAdded ? <CheckIcon /> : <PlusIcon />}
      </button>
    </div>
  );
}
