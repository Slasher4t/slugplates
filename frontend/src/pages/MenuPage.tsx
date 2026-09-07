import { useEffect, useMemo, useState } from "react";
import { SegmentedControl } from "../components/SegmentedControl";
import { EmptyState, ErrorState, StatusBanner } from "../components/StatusBanner";
import { HamburgerIcon, SearchIcon } from "../components/icons";
import { FoodDetail } from "../components/menu/FoodDetail";
import { HallPicker } from "../components/menu/HallPicker";
import { LocationSwitcherSheet } from "../components/menu/LocationSwitcherSheet";
import { MenuList } from "../components/menu/MenuList";
import { SkeletonFoodRow } from "../components/menu/SkeletonFoodRow";
import { useLog } from "../context/LogContext";
import { useMenuSelection } from "../context/MenuSelectionContext";
import { usePreferences } from "../context/PreferencesContext";
import { useLocations } from "../hooks/useLocations";
import { useMenu } from "../hooks/useMenu";
import type { FoodItem, MealType } from "../api/types";

const MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

export function MenuPage() {
  const { locations, loading: locationsLoading, error: locationsError, refetch: refetchLocations } = useLocations();
  const { hallId, mealType, date, setHallId, setMealType, setDate } = useMenuSelection();
  const { addEntry } = useLog();
  const { showExtrasByDefault } = usePreferences();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [detailItem, setDetailItem] = useState<FoodItem | null>(null);

  // Pick a default hall once locations resolve and nothing is selected yet.
  useEffect(() => {
    if (locations && !hallId) {
      const firstHall = Object.keys(locations.dining_halls)[0];
      if (firstHall) setHallId(firstHall);
    }
  }, [locations, hallId, setHallId]);

  const { items, loading, error, elapsedSeconds, refetch } = useMenu(hallId, mealType, date);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  // Client-side filter over the already-fetched menu (per product decision -
  // no extra request, works instantly, no server-side search round trip for
  // what's fundamentally "filter what I already have on screen").
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  function handleAdd(item: FoodItem) {
    addEntry(item, mealType);
    setToast(`Added ${item.name}`);
  }

  function handleOpenDetail(item: FoodItem) {
    // Keep the sheet's own copy in sync with live enrichment: if this exact
    // item (same id) refreshes from pending -> resolved while the sheet is
    // open, re-render with the newer object next time items changes.
    setDetailItem(item);
  }

  // Keep an open detail sheet current if a follow-up enrichment fetch
  // resolves pending nutrition for the item it's showing.
  useEffect(() => {
    if (!detailItem) return;
    const fresh = items.find((i) => i.id === detailItem.id);
    if (fresh && fresh !== detailItem) setDetailItem(fresh);
  }, [items, detailItem]);

  const hallName = locations
    ? locations.dining_halls[hallId ?? ""] || locations.cafes_markets[hallId ?? ""]
    : null;

  return (
    <div>
      <div className="menu-controls">
        <div className="menu-top-row">
          {locations && <HallPicker halls={locations.dining_halls} selectedId={hallId} onSelect={setHallId} />}
          <div className="menu-top-actions">
            <input
              type="date"
              className="date-field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Menu date"
            />
            <button
              className={`icon-btn${searchOpen ? " active" : ""}`}
              onClick={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) setQuery("");
              }}
              aria-label="Search food"
              aria-pressed={searchOpen}
            >
              <SearchIcon />
            </button>
            <button className="icon-btn" onClick={() => setSheetOpen(true)} aria-label="All locations">
              <HamburgerIcon />
            </button>
          </div>
        </div>

        <div className="meal-tabs-row">
          <SegmentedControl options={MEAL_OPTIONS} value={mealType} onChange={setMealType} ariaLabel="Meal period" />
        </div>

        {searchOpen && (
          <div className="search-row">
            <SearchIcon />
            <input
              type="search"
              className="search-input"
              placeholder={`Search ${hallName ?? "menu"}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        )}
      </div>

      {locationsLoading && <StatusBanner text="Loading dining hall list…" spinner />}
      {locationsError && <ErrorState text="Couldn't reach the SlugEats API" onRetry={refetchLocations} />}

      {loading && (
        <>
          <StatusBanner
            text={
              elapsedSeconds >= 8
                ? `Still fetching ${hallName ?? "this hall"} from UCSC Dining (${elapsedSeconds}s)… first load of the day can take up to a minute.`
                : `Loading ${hallName ?? "menu"}…`
            }
            spinner
          />
          <div className="station-section">
            {Array.from({ length: 6 }, (_, i) => <SkeletonFoodRow key={i} />)}
          </div>
        </>
      )}
      {error && <ErrorState text="Couldn't load today's menu" onRetry={refetch} />}

      {!loading && !error && items.length === 0 && hallId && (
        <EmptyState
          emoji="🔒"
          title={`${hallName ?? "This location"} isn't serving ${mealType} on this date`}
          sub="Dining halls between quarters, or this meal period, sometimes have nothing published yet."
        />
      )}

      {!loading && !error && items.length > 0 && filteredItems.length === 0 && (
        <EmptyState emoji="🔍" title={`No matches for "${query}"`} sub="Try a different search term." />
      )}

      {!loading && filteredItems.length > 0 && (
        <MenuList
          items={filteredItems}
          onAdd={handleAdd}
          onOpenDetail={handleOpenDetail}
          extrasOpenByDefault={showExtrasByDefault}
        />
      )}

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

      {detailItem && (
        <FoodDetail
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onAdd={(item) => {
            handleAdd(item);
            setDetailItem(null);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
