// Small, v2.0-scoped display preferences that don't fit GoalsContext's four
// macro numbers. "Preferred Dining Hall" (shown alongside this on the Goals
// page) deliberately isn't duplicated here - it reads/writes
// MenuSelectionContext's existing persisted hallId directly, so there's one
// source of truth for "which hall," not two that could drift apart.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { readJSON, writeJSON } from "../storage/keyValueStore";

export interface Preferences {
  showExtrasByDefault: boolean;
}

const DEFAULT_PREFERENCES: Preferences = { showExtrasByDefault: false };
const STORAGE_KEY = "preferences.v1";

interface PreferencesContextValue extends Preferences {
  setShowExtrasByDefault: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(() => readJSON(STORAGE_KEY, DEFAULT_PREFERENCES));

  const setShowExtrasByDefault = useCallback((value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, showExtrasByDefault: value };
      writeJSON(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...prefs, setShowExtrasByDefault }), [prefs, setShowExtrasByDefault]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
