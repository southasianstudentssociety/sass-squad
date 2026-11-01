export const TIME_ZONE = "Asia/Hong_Kong";

export function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD" }).format(cents / 100);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-HK", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-HK", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-HK", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** Offset (ms) of TIME_ZONE from UTC at the given instant. */
function tzOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-HK", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - at.getTime();
}

/** "2026-11-08T19:00" (Hong Kong wall-clock, from <input type="datetime-local">) -> ISO UTC. */
export function localToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const naiveUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = naiveUtc - tzOffsetMs(new Date(naiveUtc));
  guess = naiveUtc - tzOffsetMs(new Date(guess));
  return new Date(guess).toISOString();
}

/** ISO UTC -> "YYYY-MM-DDTHH:mm" in Hong Kong time, for datetime-local inputs. */
export function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() + tzOffsetMs(d));
  return local.toISOString().slice(0, 16);
}

export function dollarsToCents(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "0").replace(/[HK$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Today's date in Hong Kong as YYYY-MM-DD (matches the database's term dates). */
export function todayInHongKong(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
