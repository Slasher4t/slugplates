// The four numbers the whole app is built around. Deliberately just these
// four - no body weight, activity level, or bulk/cut framing (explicit
// product decision, not an oversight).

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { readJSON, writeJSON } from "../storage/keyValueStore";

export interface Goals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const DEFAULT_GOALS: Goals = { calories: 2200, protein_g: 150, carbs_g: 220, fat_g: 70 };
const STORAGE_KEY = "goals.v1";

interface GoalsContextValue {
  goals: Goals;
  setGoals: (goals: Goals) => void;
}

const GoalsContext = createContext<GoalsContextValue | null>(null);

export function GoalsProvider({ children }: { children: ReactNode }) {
  const [goals, setGoalsState] = useState<Goals>(() => readJSON(STORAGE_KEY, DEFAULT_GOALS));

  const setGoals = useCallback((next: Goals) => {
    setGoalsState(next);
    writeJSON(STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ goals, setGoals }), [goals, setGoals]);
  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>;
}

export function useGoals(): GoalsContextValue {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error("useGoals must be used within GoalsProvider");
  return ctx;
}
