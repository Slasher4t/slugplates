// What hall/meal/date the Menu tab is currently browsing. Separate from the
// food log's dates - browsing here never implicitly logs or backdates
// anything (see LogContext's header comment for why).

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { MealType } from "../api/types";
import { readJSON, writeJSON } from "../storage/keyValueStore";
import { defaultMealForNow, todayISO } from "../utils/date";

interface Selection {
  hallId: string | null; // null until /locations resolves and picks a default
  mealType: MealType;
  date: string;
}

const STORAGE_KEY = "menuSelection.v1";

interface MenuSelectionContextValue extends Selection {
  setHallId: (id: string) => void;
  setMealType: (m: MealType) => void;
  setDate: (d: string) => void;
}

const MenuSelectionContext = createContext<MenuSelectionContextValue | null>(null);

export function MenuSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(() =>
    readJSON(STORAGE_KEY, { hallId: null, mealType: defaultMealForNow(), date: todayISO() })
  );

  const update = useCallback((patch: Partial<Selection>) => {
    setSelection((prev) => {
      const next = { ...prev, ...patch };
      writeJSON(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const setHallId = useCallback((id: string) => update({ hallId: id }), [update]);
  const setMealType = useCallback((m: MealType) => update({ mealType: m }), [update]);
  const setDate = useCallback((d: string) => update({ date: d }), [update]);

  const value = useMemo(
    () => ({ ...selection, setHallId, setMealType, setDate }),
    [selection, setHallId, setMealType, setDate]
  );

  return <MenuSelectionContext.Provider value={value}>{children}</MenuSelectionContext.Provider>;
}

export function useMenuSelection(): MenuSelectionContextValue {
  const ctx = useContext(MenuSelectionContext);
  if (!ctx) throw new Error("useMenuSelection must be used within MenuSelectionProvider");
  return ctx;
}
