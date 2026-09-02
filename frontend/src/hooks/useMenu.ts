// Loads one hall's menu for a meal/date. A cold hall scrape can take up to
// ~90s (see backend README), so `elapsedSeconds` is exposed for an explicit
// "still fetching...(Ns)" message rather than leaving the UI on a bare
// spinner with no indication anything is happening.

import { useEffect, useRef, useState } from "react";
import { getHallMenu } from "../api/client";
import type { FoodItem, MealType } from "../api/types";

interface State {
  items: FoodItem[];
  loading: boolean;
  error: string | null;
  elapsedSeconds: number;
}

export function useMenu(hallId: string | null, mealType: MealType, date: string): State {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!hallId) return;
    const token = ++tokenRef.current;

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
      })
      .catch((err) => {
        if (tokenRef.current !== token) return;
        setError(err.message || "Failed to load menu");
        setLoading(false);
      })
      .finally(() => clearInterval(tick));

    return () => clearInterval(tick);
  }, [hallId, mealType, date]);

  return { items, loading, error, elapsedSeconds };
}
