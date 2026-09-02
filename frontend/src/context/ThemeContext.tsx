// 'auto' follows prefers-color-scheme (handled entirely in CSS - see
// styles/tokens.css); 'light'/'dark' pin data-theme on <html> to override it.
// Persisted so a manual choice survives a reload.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { readJSON, writeJSON } from "../storage/keyValueStore";

export type ThemeMode = "auto" | "light" | "dark";

const STORAGE_KEY = "theme.v1";

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => readJSON(STORAGE_KEY, "auto" as ThemeMode));

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    writeJSON(STORAGE_KEY, mode);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
