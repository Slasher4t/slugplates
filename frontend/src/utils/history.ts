import type { LogEntry } from "../context/LogContext";
import { sumEntries, type DayTotals } from "../context/LogContext";
import { formatLongDate, formatShortDate, formatWeekday, isoDaysAgo, mondayOf, todayISO } from "./date";

type LogByDate = Record<string, LogEntry[]>;

export type HistoryMetric = "calories" | "protein_g" | "carbs_g" | "fat_g";

export const METRIC_OPTIONS: { value: HistoryMetric; label: string; unit: string }[] = [
  { value: "calories", label: "Calories", unit: "cal" },
  { value: "protein_g", label: "Protein", unit: "g" },
  { value: "carbs_g", label: "Carbs", unit: "g" },
  { value: "fat_g", label: "Fat", unit: "g" },
];

// Every day's full macro breakdown, not just whatever metric happens to be
// selected right now - the daily-entries list shows all four regardless of
// which one the chart is currently plotting.
export interface DailyPoint extends DayTotals {
  date: string;
  label: string;
}

export interface WeeklyBar extends DayTotals {
  weekStart: string;
  label: string;
  isCurrent: boolean;
}

function totalsFor(logByDate: LogByDate, date: string): DayTotals {
  return sumEntries(logByDate[date] || []);
}

/** One point per day for the last `days` days (including today), oldest first. */
export function getDailyTotals(logByDate: LogByDate, days: number): DailyPoint[] {
  const points: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = isoDaysAgo(i);
    points.push({ date, label: formatWeekday(date), ...totalsFor(logByDate, date) });
  }
  return points;
}

/** One bar per ISO week (Monday-start) for the last `weeks` weeks, oldest first. */
export function getWeeklyTotals(logByDate: LogByDate, weeks: number): WeeklyBar[] {
  const currentWeekStart = mondayOf(todayISO());
  const bars: WeeklyBar[] = [];

  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = new Date(`${currentWeekStart}T00:00:00`);
    weekStart.setDate(weekStart.getDate() - w * 7);
    const weekStartISO = weekStart.toISOString().slice(0, 10);

    let total: DayTotals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + d);
      const dayTotals = totalsFor(logByDate, day.toISOString().slice(0, 10));
      total = {
        calories: total.calories + dayTotals.calories,
        protein_g: total.protein_g + dayTotals.protein_g,
        carbs_g: total.carbs_g + dayTotals.carbs_g,
        fat_g: total.fat_g + dayTotals.fat_g,
      };
    }

    bars.push({
      weekStart: weekStartISO,
      label: formatShortDate(weekStartISO),
      isCurrent: weekStartISO === currentWeekStart,
      ...total,
    });
  }

  return bars;
}

/** X-axis label thinning: every point at <=7, roughly every 5-7th otherwise. */
export function thinLabels<T extends { label: string }>(points: T[], keepEvery: number): T[] {
  return points.map((p, i) => (i % keepEvery === 0 || i === points.length - 1 ? p : { ...p, label: "" }));
}

// The most-recent-first list shown below the chart - "Daily Logs"/"Daily
// Entries" in the design. Only real logged days, capped so it stays a quick
// scan rather than a second copy of the whole log.
export interface DailyLogSummary extends DayTotals {
  date: string;
  heading: string;
}

export function getDailyLogSummaries(logByDate: LogByDate, loggedDates: string[], limit = 14): DailyLogSummary[] {
  return [...loggedDates]
    .sort()
    .reverse()
    .slice(0, limit)
    .map((date) => ({ date, heading: formatLongDate(date), ...totalsFor(logByDate, date) }));
}
