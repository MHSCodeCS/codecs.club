/**
 * Date formatting in the school's time zone, matching the design's style
 * ("Thu Oct 15", "Sep 17", "4:00 pm", "Thu Oct 29, 11:59 pm").
 */
function parts(ts: number, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(new Date(ts));
}

/** "Thu Oct 15" */
export function formatWeekdayDate(ts: number, timeZone: string): string {
  return parts(ts, timeZone, { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
}

/** "Sep 17" */
export function formatShortDate(ts: number, timeZone: string): string {
  return parts(ts, timeZone, { month: "short", day: "numeric" });
}

/** "9/17" */
export function formatNumericDate(ts: number, timeZone: string): string {
  return parts(ts, timeZone, { month: "numeric", day: "numeric" });
}

/** "4:00 pm" */
export function formatTime(ts: number, timeZone: string): string {
  return parts(ts, timeZone, { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M/, (_, ap: string) => ` ${ap.toLowerCase()}m`);
}

/** "Thu Oct 29, 11:59 pm" */
export function formatWeekdayDateTime(ts: number, timeZone: string): string {
  return `${formatWeekdayDate(ts, timeZone)}, ${formatTime(ts, timeZone)}`;
}

/** Calendar date key in the time zone, e.g. "2026-10-15". */
export function dateKey(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

export function isSameDay(a: number, b: number, timeZone: string): boolean {
  return dateKey(a, timeZone) === dateKey(b, timeZone);
}

/** "2026-27" -> "2026–27" for display. */
export function formatYear(year: string): string {
  return year.replace("-", "–");
}

/** "just now", "12s ago", "2 min ago", "3 h ago", or a date. */
export function formatRelative(ts: number, now: number, timeZone: string): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 12) return `${hours} h ago`;
  return isSameDay(ts, now, timeZone) ? "today" : formatShortDate(ts, timeZone);
}

/** Local wall-clock time key in the time zone, e.g. "16:00". */
export function timeKey(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ts));
}

/** "America/Los_Angeles" -> "Pacific time" (falls back to the zone id). */
export function timeZoneLabel(timeZone: string): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longGeneric" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;
  return name ? name.replace(/ Time$/, " time") : timeZone;
}

/** School years around `year` ("2026-27" -> ["2025-26", "2026-27", "2027-28"]). */
export function adjacentYears(year: string): string[] {
  const start = Number(year.slice(0, 4));
  if (!Number.isFinite(start)) return [year];
  return [start - 1, start, start + 1].map((y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`);
}
