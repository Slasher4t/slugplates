export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/** Monday of the week containing the given ISO date, as an ISO date. */
export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function defaultMealForNow(): "breakfast" | "lunch" | "dinner" {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  return "dinner";
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatWeekday(isoDate: string): string {
  return WEEKDAY_SHORT[new Date(`${isoDate}T00:00:00`).getDay()];
}

export function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}
