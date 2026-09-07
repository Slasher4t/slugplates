import { useCallback, useEffect, useState } from "react";
import { getLocations } from "../api/client";
import type { LocationGroups } from "../api/types";

interface State {
  locations: LocationGroups | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLocations(): State {
  const [state, setState] = useState<Omit<State, "refetch">>({ locations: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    getLocations()
      .then((locations) => {
        if (!cancelled) setState({ locations, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ locations: null, loading: false, error: err.message || "Failed to load" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refetch = useCallback(() => setAttempt((a) => a + 1), []);

  return { ...state, refetch };
}
