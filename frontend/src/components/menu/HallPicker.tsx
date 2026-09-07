// The quick picker: click the current hall's name to drop down just the four
// dining halls (not cafes/markets - that fuller list lives in the hamburger's
// LocationSwitcherSheet instead).

import { useEffect, useRef, useState } from "react";
import { shortHallName } from "../../utils/hallName";
import { CheckIcon } from "../icons";

interface Props {
  halls: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function HallPicker({ halls, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const currentName = selectedId ? halls[selectedId] : "Choose a hall";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className={`hall-picker-btn${open ? " open" : ""}`} onClick={() => setOpen((v) => !v)}>
        <span className="hall-picker-name">{currentName ? shortHallName(currentName) : "Choose a hall"}</span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="hall-dropdown">
          {Object.entries(halls).map(([id, name]) => (
            <button
              key={id}
              className={`hall-dropdown-item${id === selectedId ? " selected" : ""}`}
              onClick={() => {
                onSelect(id);
                setOpen(false);
              }}
            >
              {name}
              {id === selectedId && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
