import type { LocationGroups } from "../../api/types";
import { CheckIcon } from "../icons";

interface Props {
  locations: LocationGroups;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function LocationGroup({
  title,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  items: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (Object.keys(items).length === 0) return null;
  return (
    <>
      <div className="location-group-label">{title}</div>
      {Object.entries(items).map(([id, name]) => (
        <button
          key={id}
          className={`location-item${id === selectedId ? " selected" : ""}`}
          onClick={() => onSelect(id)}
        >
          {name}
          {id === selectedId && <CheckIcon className="check" />}
        </button>
      ))}
    </>
  );
}

export function LocationSwitcherSheet({ locations, selectedId, onSelect, onClose }: Props) {
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <section className="sheet" aria-label="Choose a location">
        <div className="sheet-grabber" />
        <div className="sheet-header">
          <h2>Locations</h2>
          <button className="text-btn" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sheet-body">
          <LocationGroup
            title="Dining halls"
            items={locations.dining_halls}
            selectedId={selectedId}
            onSelect={onSelect}
          />
          <LocationGroup
            title="Cafes & markets"
            items={locations.cafes_markets}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
      </section>
    </>
  );
}
