// Loads one hall's menu for a meal/date. As of v1.1.0 the backend returns the
// menu fast even cold (menu rows + a small time-boxed batch of nutrition,
// see app/foodpro_scraper.py's scrape_day) and keeps enriching the rest of
// the nutrition in the background, so most items resolve within a handful of
// seconds of the *first* response rather than making the caller wait for all
// of it up front. `elapsedSeconds` is still exposed for the (now much rarer,
// but still possible - e.g. FoodPro itself being slow) case where even the
// fast path takes a while, so the UI isn't left on a bare spinner.
//
// A single bounded follow-up fetch (not a poll loop) picks up nutrition that
// landed in the backend's cache after the initial response, for whatever was
// still marked `pending`. If it's still pending after that one retry, it
// stays showing "Loading nutrition..." until the next real navigation
// re-fetches - deliberately not a longer or repeating retry loop.

import { useCallback, useEffect, useRef, useState } from "react";
import { getHallMenu } from "../api/client";
import type { FoodItem, MealType } from "../api/types";

const ENRICHMENT_FOLLOWUP_DELAY_MS = 8000;

interface State {
  items: FoodItem[];
  loading: boolean;
  error: string | null;
  elapsedSeconds: number;
  refetch: () => void;
}

export function useMenu(hallId: string | null, mealType: MealType, date: string): State {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const tokenRef = useRef(0);
  const refetch = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!hallId) return;
    const token = ++tokenRef.current;
    let followupTimer: ReturnType<typeof setTimeout> | undefined;

    setLoading(true);
    setError(null);
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const tick = setInterval(() => {
      if (tokenRef.current === token) setElapsedSeconds(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);

    getHallMenu(hallId, mealType, date)
      .then((result) => {
        if (tokenRef.current !== token) return;
        setItems(result);
        setLoading(false);

        // One bounded follow-up, only if something was actually left pending -
        // not scheduled at all for an already-fully-resolved menu.
        if (result.some((item) => item.nutrition.pending)) {
          followupTimer = setTimeout(() => {
            if (tokenRef.current !== token) return;
            getHallMenu(hallId, mealType, date)
              .then((refreshed) => {
                if (tokenRef.current === token) setItems(refreshed);
              })
              .catch(() => {
                // Silent - this is a background nicety, not the primary load.
                // The items we already have (some still pending) stay shown.
              });
          }, ENRICHMENT_FOLLOWUP_DELAY_MS);
        }
      })
      .catch((err) => {
        if (tokenRef.current !== token) return;
        setError(err.message || "Failed to load menu");
        setLoading(false);
      })
      .finally(() => clearInterval(tick));

    return () => {
      clearInterval(tick);
      clearTimeout(followupTimer);
    };
  }, [hallId, mealType, date, attempt]);

  return { items, loading, error, elapsedSeconds, refetch };
}
