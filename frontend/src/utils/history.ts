import type { LogEntry } from "../context/LogContext";
import { formatShortDate, formatWeekday, isoDaysAgo, mondayOf, todayISO } from "./date";

type LogByDate = Record<string, LogEntry[]>;

export interface DailyPoint {
  date: string;
  label: string;
  calories: number;
}

export interface WeeklyBar {
  weekStart: string;
  label: string;
  calories: number;
  isCurrent: boolean;
}

function totalCaloriesFor(logByDate: LogByDate, date: string): number {
  const entries = logByDate[date];
  if (!entries) return 0;
  return entries.reduce((sum, e) => sum + (e.calories || 0), 0);
}

/** One point per day for the last `days` days (including today), oldest first. */
export function getDailyTotals(logByDate: LogByDate, days: number): DailyPoint[] {
  const points: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = isoDaysAgo(i);
    points.push({ date, label: formatWeekday(date), calories: totalCaloriesFor(logByDate, date) });
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

    let total = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + d);
      total += totalCaloriesFor(logByDate, day.toISOString().slice(0, 10));
    }

    bars.push({
      weekStart: weekStartISO,
      label: formatShortDate(weekStartISO),
      calories: total,
      isCurrent: weekStartISO === currentWeekStart,
    });
  }

  return bars;
}

/** X-axis label thinning: every point at <=7, roughly every 5-7th otherwise. */
export function thinLabels<T extends { label: string }>(points: T[], keepEvery: number): T[] {
  return points.map((p, i) => (i % keepEvery === 0 || i === points.length - 1 ? p : { ...p, label: "" }));
}
