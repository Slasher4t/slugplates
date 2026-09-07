import type { FoodItem } from "../../api/types";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { FoodRow } from "./FoodRow";

interface Props {
  items: FoodItem[];
  onAdd: (item: FoodItem) => void;
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
const HEADER_WEIGHT = 28; // .station-label + its margin
const ROW_WEIGHT = 58; // one .food-row, incl. margin-bottom
const SECTION_GAP_WEIGHT = 18; // .station-section's own margin-bottom

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
 * This is the fix for the desktop "giant gap" bug: the previous layout was a
 * plain 2-column CSS Grid (`grid-template-columns: 1fr 1fr`), which places
 * items into shared row *tracks* - every item in the same grid row shares
 * that row's height, sized to the tallest item in it. So a short category
 * next to a long one would sit in an artificially tall row, leaving a large
 * empty gap below its own (short) content before the next category could
 * start - a textbook CSS Grid "not actually masonry" trap. (`align-items:
 * start` only stopped each *item's own box* from stretching to fill that
 * tall row; it did nothing about the row itself being that tall, which is
 * what pushed the next item down.)
 *
 * The fix here is structural, not a CSS trick: split stations into two
 * genuinely independent arrays and render them as two separate vertical
 * flows (plain block/flex columns, no shared grid row tracks), so a tall
 * category in one column literally cannot affect layout in the other.
 * (`column-count` was avoided per design guidance - it reads in column-major
 * DOM/visual order, which reads oddly for a station-ordered menu, and won't
 * reliably keep a station's rows from breaking across the column boundary
 * without extra care beyond `break-inside`, which already turned out to be
 * a no-op here since it's a Multi-column Layout property and this wasn't
 * using CSS multicol.)
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

function StationSection({ station, items, onAdd }: { station: string; items: FoodItem[]; onAdd: (item: FoodItem) => void }) {
  return (
    <div className="station-section">
      <p className="station-label">{station}</p>
      {items.map((item) => (
        <FoodRow key={item.id} item={item} onAdd={onAdd} />
      ))}
    </div>
  );
}

export function MenuList({ items, onAdd }: Props) {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const stations = groupByStation(items);

  // Mobile: the original flat single-column flow, stations in menu order -
  // unchanged from before this fix, and deliberately not masonry.
  if (!isDesktop) {
    return (
      <div className="menu-grid">
        {stations.map(([station, stationItems]) => (
          <StationSection key={station} station={station} items={stationItems} onAdd={onAdd} />
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
            <StationSection key={station} station={station} items={stationItems} onAdd={onAdd} />
          ))}
        </div>
      ))}
    </div>
  );
}
