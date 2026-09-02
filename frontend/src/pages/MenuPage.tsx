import { useEffect, useState } from "react";
import { SegmentedControl } from "../components/SegmentedControl";
import { EmptyState, StatusBanner } from "../components/StatusBanner";
import { HamburgerIcon } from "../components/icons";
import { HallPicker } from "../components/menu/HallPicker";
import { LocationSwitcherSheet } from "../components/menu/LocationSwitcherSheet";
import { MenuList } from "../components/menu/MenuList";
import { useLog } from "../context/LogContext";
import { useMenuSelection } from "../context/MenuSelectionContext";
import { useLocations } from "../hooks/useLocations";
import { useMenu } from "../hooks/useMenu";
import type { FoodItem, MealType } from "../api/types";

const MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

export function MenuPage() {
  const { locations, loading: locationsLoading, error: locationsError } = useLocations();
  const { hallId, mealType, date, setHallId, setMealType, setDate } = useMenuSelection();
  const { addEntry } = useLog();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Pick a default hall once locations resolve and nothing is selected yet.
  useEffect(() => {
    if (locations && !hallId) {
      const firstHall = Object.keys(locations.dining_halls)[0];
      if (firstHall) setHallId(firstHall);
    }
  }, [locations, hallId, setHallId]);

  const { items, loading, error, elapsedSeconds } = useMenu(hallId, mealType, date);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  function handleAdd(item: FoodItem) {
    addEntry(item, mealType);
    setToast(`Added ${item.name}`);
  }

  const hallName = locations
    ? locations.dining_halls[hallId ?? ""] || locations.cafes_markets[hallId ?? ""]
    : null;

  return (
    <div>
      <div className="menu-top-row">
        {locations && <HallPicker halls={locations.dining_halls} selectedId={hallId} onSelect={setHallId} />}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="date"
            className="date-field"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className="icon-btn" onClick={() => setSheetOpen(true)} aria-label="All locations">
            <HamburgerIcon />
          </button>
        </div>
      </div>

      <div className="meal-tabs-row">
        <SegmentedControl options={MEAL_OPTIONS} value={mealType} onChange={setMealType} ariaLabel="Meal period" />
      </div>

      {locationsLoading && <StatusBanner text="Loading dining hall list…" spinner />}
      {locationsError && <StatusBanner text={`Couldn't reach the SlugEats API: ${locationsError}`} error />}

      {loading && (
        <StatusBanner
          text={
            elapsedSeconds >= 8
              ? `Still fetching ${hallName ?? "this hall"} from UCSC Dining (${elapsedSeconds}s)… first load of the day can take up to a minute.`
              : `Loading ${hallName ?? "menu"}…`
          }
          spinner
        />
      )}
      {error && <StatusBanner text={`Couldn't load the menu: ${error}`} error />}

      {!loading && !error && items.length === 0 && hallId && (
        <EmptyState
          emoji="🔒"
          title={`${hallName ?? "This location"} isn't serving ${mealType} on this date`}
          sub="Dining halls between quarters, or this meal period, sometimes have nothing published yet."
        />
      )}

      {!loading && items.length > 0 && <MenuList items={items} onAdd={handleAdd} />}

      {sheetOpen && locations && (
        <LocationSwitcherSheet
          locations={locations}
          selectedId={hallId}
          onSelect={(id) => {
            setHallId(id);
            setSheetOpen(false);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
