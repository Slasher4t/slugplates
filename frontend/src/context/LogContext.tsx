// The food log: what you've actually eaten, by real calendar date. This is
// what Today reads (today's date only) and History aggregates (every date).
//
// Every entry carries a full nutrition snapshot taken at the moment it was
// logged, not just a food id - so a later re-scrape that changes a recipe's
// numbers, or a food dropping off a future menu, never rewrites history.
//
// Log date is always the real "today" (see LogEntry.date) regardless of what
// hall/meal/date you're browsing on the Menu tab - confirmed product
// decision, so Menu's date picker stays a pure menu-preview control and never
// silently backdates your log.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { FoodItem, MealType } from "../api/types";
import { readJSON, writeJSON } from "../storage/keyValueStore";
import { todayISO } from "../utils/date";

export interface LogEntry {
  entryId: string;
  date: string; // YYYY-MM-DD, always real-today at creation time
  mealType: MealType;
  foodId: string;
  name: string;
  hallName: string;
  station: string | null;
  portion: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  loggedAt: string; // ISO timestamp, used for ordering + as part of the id
}

/** date (YYYY-MM-DD) -> that day's entries */
type LogByDate = Record<string, LogEntry[]>;

const STORAGE_KEY = "log.v1";

function makeEntry(item: FoodItem, mealType: MealType): LogEntry {
  const loggedAt = new Date().toISOString();
  return {
    entryId: `${loggedAt}-${Math.random().toString(36).slice(2, 8)}`,
    date: todayISO(),
    mealType,
    foodId: item.id,
    name: item.name,
    hallName: item.hall_name,
    station: item.station,
    portion: item.portion,
    calories: item.nutrition.calories,
    protein_g: item.nutrition.protein_g,
    carbs_g: item.nutrition.carbs_g,
    fat_g: item.nutrition.fat_g,
    loggedAt,
  };
}

export interface DayTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

function sumEntries(entries: LogEntry[]): DayTotals {
  const totals: DayTotals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const e of entries) {
    totals.calories += e.calories || 0;
    totals.protein_g += e.protein_g || 0;
    totals.carbs_g += e.carbs_g || 0;
    totals.fat_g += e.fat_g || 0;
  }
  return totals;
}

interface LogContextValue {
  logByDate: LogByDate;
  addEntry: (item: FoodItem, mealType: MealType) => void;
  removeEntry: (date: string, entryId: string) => void;
  entriesForDate: (date: string) => LogEntry[];
  totalsForDate: (date: string) => DayTotals;
  /** every date with at least one entry, ascending */
  loggedDates: string[];
}

const LogContext = createContext<LogContextValue | null>(null);

export function LogProvider({ children }: { children: ReactNode }) {
  const [logByDate, setLogByDate] = useState<LogByDate>(() => readJSON(STORAGE_KEY, {} as LogByDate));

  const addEntry = useCallback(
    (item: FoodItem, mealType: MealType) => {
      const entry = makeEntry(item, mealType);
      setLogByDate((prev) => {
        const next = { ...prev, [entry.date]: [...(prev[entry.date] || []), entry] };
        writeJSON(STORAGE_KEY, next);
        return next;
      });
    },
    []
  );

  const removeEntry = useCallback((date: string, entryId: string) => {
    setLogByDate((prev) => {
      const dayEntries = prev[date];
      if (!dayEntries) return prev;
      const next = { ...prev, [date]: dayEntries.filter((e) => e.entryId !== entryId) };
      writeJSON(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const entriesForDate = useCallback((date: string) => logByDate[date] || [], [logByDate]);
  const totalsForDate = useCallback((date: string) => sumEntries(logByDate[date] || []), [logByDate]);

  const loggedDates = useMemo(
    () => Object.keys(logByDate).filter((d) => logByDate[d]?.length > 0).sort(),
    [logByDate]
  );

  const value = useMemo(
    () => ({ logByDate, addEntry, removeEntry, entriesForDate, totalsForDate, loggedDates }),
    [logByDate, addEntry, removeEntry, entriesForDate, totalsForDate, loggedDates]
  );

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useLog(): LogContextValue {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error("useLog must be used within LogProvider");
  return ctx;
}

export { sumEntries };
