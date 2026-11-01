// Calendar days are plain 'YYYY-MM-DD' strings. All arithmetic runs in UTC, so a
// day never shifts with the viewer's time zone or daylight saving.

export const WEEK_START = 0; // Sunday

const DAY_MS = 86_400_000;
const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const format = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, days: number) => format(parse(iso) + days * DAY_MS);
export const daysBetween = (from: string, to: string) => Math.round((parse(to) - parse(from)) / DAY_MS);
export const weekday = (iso: string) => new Date(parse(iso)).getUTCDay();

export function today(now = new Date()) {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export const startOfWeek = (iso: string) => addDays(iso, -((weekday(iso) - WEEK_START + 7) % 7));
export const startOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;

export function addMonths(iso: string, months: number) {
  const date = new Date(parse(startOfMonth(iso)));
  date.setUTCMonth(date.getUTCMonth() + months);
  return format(date.getTime());
}

/** Week start dates that cover the month containing `iso`. */
export function monthWeeks(iso: string): string[] {
  const first = startOfMonth(iso);
  const nextMonth = addMonths(first, 1);
  const weeks: string[] = [];
  for (let w = startOfWeek(first); w < nextMonth; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

const fmt = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { timeZone: "UTC", ...options }).format(new Date(parse(iso)));

export const monthName = (iso: string) => fmt(iso, { month: "long" });
export const year = (iso: string) => iso.slice(0, 4);
export const shortDate = (iso: string) => fmt(iso, { month: "short", day: "numeric" });
export const longDate = (iso: string) => fmt(iso, { weekday: "long", month: "long", day: "numeric" });
export const weekdayShort = (iso: string) => fmt(iso, { weekday: "short" });

export function formatTime(time: string | null) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

export function dateRangeLabel(start: string | null, end: string | null) {
  if (!start) return "No date";
  return !end || start === end ? shortDate(start) : `${shortDate(start)} to ${shortDate(end)}`;
}
