// Bottom sheet on mobile, centered dialog on desktop - same underlying
// .sheet/.sheet-scrim pattern LocationSwitcherSheet already uses (see
// global.css's @media (min-width: 900px) override on .sheet for the
// dialog treatment). Always renders the real selected FoodItem - there is
// no placeholder/sample data path here.

import type { FoodItem } from "../../api/types";
import { CloseIcon } from "../icons";

interface Props {
  item: FoodItem;
  onClose: () => void;
  onAdd: (item: FoodItem) => void;
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="detail-stat">
      <div className="detail-stat-label">{label}</div>
      <div className="detail-stat-value">{value ?? "—"}</div>
    </div>
  );
}

export function FoodDetail({ item, onClose, onAdd }: Props) {
  const n = item.nutrition;
  const hasData = n.calories != null;

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <section className="sheet detail-sheet" aria-label={item.name}>
        <div className="sheet-grabber" />
        <button className="detail-close-x" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        <div className="sheet-body">
          <h2 className="detail-name">{item.name}</h2>
          <p className="detail-sub">
            {[item.station, item.hall_name].filter(Boolean).join(" · ")}
          </p>

          {n.pending ? (
            <p className="detail-status">Loading nutrition…</p>
          ) : !hasData ? (
            <p className="detail-status">Nutrition unavailable</p>
          ) : (
            <div className="detail-stats">
              <Stat label="Serving Size" value={n.serving_size ?? item.portion} />
              <Stat label="Calories" value={String(Math.round(n.calories!))} />
              <Stat label="Protein" value={n.protein_g != null ? `${Math.round(n.protein_g)}g` : null} />
              <Stat label="Carbs" value={n.carbs_g != null ? `${Math.round(n.carbs_g)}g` : null} />
              <Stat label="Fat" value={n.fat_g != null ? `${Math.round(n.fat_g)}g` : null} />
              <div className="detail-stat">
                <div className="detail-stat-label">Allergens</div>
                <div className="detail-stat-value detail-icons">
                  {item.icons.length ? item.icons.join(", ") : "None listed"}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="sheet-footer">
          <button
            className="pill-btn primary detail-add"
            onClick={() => onAdd(item)}
            disabled={n.pending}
          >
            {n.pending ? "Loading nutrition…" : "Add to Today"}
          </button>
        </div>
      </section>
    </>
  );
}
