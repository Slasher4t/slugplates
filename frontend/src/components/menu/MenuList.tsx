import { useState } from "react";
import type { FoodItem } from "../../api/types";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { isExtra } from "../../utils/extras";
import { ChevronDownIcon } from "../icons";
import { FoodRow } from "./FoodRow";

interface Props {
  items: FoodItem[];
  onAdd: (item: FoodItem) => void;
  onOpenDetail: (item: FoodItem) => void;
  /** Seeds the Extras section's initial open/closed state (Goals ->
   * Preferences -> "Show Extras by default"). Purely an initial value - the
   * user can still toggle it for this visit regardless of the preference. */
  extrasOpenByDefault: boolean;
}

type Station = [name: string, items: FoodItem[]];

// Must match the breakpoint in global.css's `.menu-columns` media query -
// this is what decides whether MenuList renders the balanced 2-column
// desktop layout at all (see the big comment below for why that decision
// can't be made in CSS alone).
const DESKTOP_BREAKPOINT = "(min-width: 900px)";

// Rough per-row/header height estimate, in the same unit (doesn't need to be
// pixel-exact - this only has to be good enough to greedily balance two
// columns' total height, not lay anything out itself; the browser still does
// all real layout). See station-label/food-row/station-section in
// global.css for where these come from.
const HEADER_WEIGHT = 24; // .station-label + its margin
const ROW_WEIGHT = 46; // one .food-row, incl. divider
const SECTION_GAP_WEIGHT = 16; // .station-section's own margin-bottom

/**
 * Splits real food from Extras (condiments/sauces/small toppings - see
 * utils/extras.ts) BEFORE stations are grouped, so an all-condiments station
 * (a real "Condiments" station is common) simply disappears from the normal
 * list rather than showing up as an empty section, and a station that's a
 * mix of both keeps its real items under its own label while its condiments
 * join the single unified Extras section instead of staying scattered.
 */
function splitExtras(items: FoodItem[]): { food: FoodItem[]; extras: FoodItem[] } {
  const food: FoodItem[] = [];
  const extras: FoodItem[] = [];
  for (const item of items) (isExtra(item) ? extras : food).push(item);
  return { food, extras };
}

function groupByStation(items: FoodItem[]): Station[] {
  const byStation = new Map<string, FoodItem[]>();
  for (const item of items) {
    const key = item.station || "Other";
    if (!byStation.has(key)) byStation.set(key, []);
    byStation.get(key)!.push(item);
  }
  return [...byStation.entries()];
}

/**
 * Greedily distributes whole stations across `columnCount` columns, always
 * adding the next station (in original menu order) to whichever column
 * currently has the smallest estimated total height.
 *
 * This is the fix for the desktop "giant gap" bug: a plain 2-column CSS
 * Grid (`grid-template-columns: 1fr 1fr`) places items into shared row
 * *tracks* - every item in the same grid row shares that row's height,
 * sized to the tallest item in it. So a short category next to a long one
 * would sit in an artificially tall row, leaving a large empty gap below its
 * own (short) content before the next category could start - a textbook CSS
 * Grid "not actually masonry" trap.
 *
 * The fix here is structural, not a CSS trick: split stations into two
 * genuinely independent arrays and render them as two separate vertical
 * flows (plain block/flex columns, no shared grid row tracks), so a tall
 * category in one column literally cannot affect layout in the other.
 * PRESERVED EXACTLY from v1.1 - do not reintroduce a shared-grid-row layout.
 */
function distributeColumns(stations: Station[], columnCount: number): Station[][] {
  const columns: Station[][] = Array.from({ length: columnCount }, () => []);
  const weights = new Array(columnCount).fill(0);

  for (const station of stations) {
    const [, stationItems] = station;
    const weight = HEADER_WEIGHT + stationItems.length * ROW_WEIGHT + SECTION_GAP_WEIGHT;

    let targetIndex = 0;
    for (let i = 1; i < columnCount; i++) {
      if (weights[i] < weights[targetIndex]) targetIndex = i;
    }

    columns[targetIndex].push(station);
    weights[targetIndex] += weight;
  }

  return columns;
}

interface RowListProps {
  items: FoodItem[];
  onAdd: (item: FoodItem) => void;
  onOpenDetail: (item: FoodItem) => void;
}

function StationSection({ station, items, onAdd, onOpenDetail }: { station: string } & RowListProps) {
  return (
    <div className="station-section">
      <p className="station-label">{station}</p>
      {items.map((item) => (
        <FoodRow key={item.id} item={item} onAdd={onAdd} onOpenDetail={onOpenDetail} />
      ))}
    </div>
  );
}

function FoodColumns({ items, onAdd, onOpenDetail }: RowListProps) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const stations = groupByStation(items);

  // Mobile: the original flat single-column flow, stations in menu order -
  // deliberately not masonry.
  if (!isDesktop) {
    return (
      <div className="menu-grid">
        {stations.map(([station, stationItems]) => (
          <StationSection key={station} station={station} items={stationItems} onAdd={onAdd} onOpenDetail={onOpenDetail} />
        ))}
      </div>
    );
  }

  // Desktop: two independent vertical stacks, height-balanced by the greedy
  // distribution above - see its docstring for the actual bug/fix.
  const columns = distributeColumns(stations, 2);
  return (
    <div className="menu-columns">
      {columns.map((column, i) => (
        <div className="menu-column" key={i}>
          {column.map(([station, stationItems]) => (
            <StationSection key={station} station={station} items={stationItems} onAdd={onAdd} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function MenuList({ items, onAdd, onOpenDetail, extrasOpenByDefault }: Props) {
  const [extrasOpen, setExtrasOpen] = useState(extrasOpenByDefault);
  const { food, extras } = splitExtras(items);

  return (
    <div>
      <FoodColumns items={food} onAdd={onAdd} onOpenDetail={onOpenDetail} />

      {extras.length > 0 && (
        <div className="extras-section">
          <button className="extras-toggle" onClick={() => setExtrasOpen((v) => !v)} aria-expanded={extrasOpen}>
            <span>Extras</span>
            <span className="extras-count">{extras.length}</span>
            <ChevronDownIcon className={`extras-chevron${extrasOpen ? " open" : ""}`} />
          </button>
          {extrasOpen && (
            <div className="extras-body">
              {extras.map((item) => (
                <FoodRow key={item.id} item={item} onAdd={onAdd} onOpenDetail={onOpenDetail} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
