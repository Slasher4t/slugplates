import { useEffect, useState } from "react";
import { getLocations } from "../api/client";
import type { LocationGroups } from "../api/types";

interface State {
  locations: LocationGroups | null;
  loading: boolean;
  error: string | null;
}

export function useLocations(): State {
  const [state, setState] = useState<State>({ locations: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  return state;
}
