import { TIME_ZONE } from "@/lib/format";

export const MONTHS_AHEAD = 6;

export type EventRow = { id: string; title: string; slug: string; starts_at: string; ends_at: string | null; venue: string | null; is_published: boolean };
export type SP = { month?: string; day?: string; mine?: string; department?: string };

// All dates are Hong Kong calendar days, "YYYY-MM-DD".
export const hkDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(iso));
export const monthKey = (day: string) => day.slice(0, 7);
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const weekdayIndex = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
export const label = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-HK", { timeZone: "UTC", ...opts }).format(new Date(`${day}T00:00:00Z`));
