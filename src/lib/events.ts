import type { SassEvent } from "@/lib/types";

export const EVENT_COLUMNS =
  "id, slug, title, description, venue, starts_at, ends_at, cover_image_url, is_published, access, member_price_cents, public_price_cents, capacity, member_sales_open_at, public_sales_open_at, sales_close_at, payment_instructions, sold_out";

export type SalesState =
  | { state: "open" }
  | { state: "not_yet"; opensAt: string }
  | { state: "closed" }
  | { state: "sold_out" }
  | { state: "members_only" };

/** Mirrors the rules in claim_ticket() so the UI tells people the same thing the DB will. */
export function salesStateFor(event: SassEvent, isMember: boolean, now = new Date()): SalesState {
  if (event.access === "members_only" && !isMember) return { state: "members_only" };
  // Manual switch; enforced by a trigger on tickets (0026). Team places still go through.
  if (event.sold_out) return { state: "sold_out" };
  const opensAt = isMember ? (event.member_sales_open_at ?? event.public_sales_open_at) : event.public_sales_open_at;
  if (opensAt && now < new Date(opensAt)) return { state: "not_yet", opensAt };
  if (event.sales_close_at && now > new Date(event.sales_close_at)) return { state: "closed" };
  return { state: "open" };
}

export function priceFor(event: SassEvent, isMember: boolean): number {
  return isMember ? event.member_price_cents : event.public_price_cents;
}

export function eventIsOver(event: SassEvent, now = new Date()): boolean {
  const end = event.ends_at ? new Date(event.ends_at) : new Date(new Date(event.starts_at).getTime() + 6 * 3600_000);
  return now > end;
}

/** ISO timestamp `hours` ago. Used to keep events visible on the day they happen. */
export function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

/**
 * Door-staff access window. Mirrors private.event_in_scan_window() in the DB:
 * from 24h before start until 12h after end (end defaults to start + 12h).
 */
export function scanWindow(event: Pick<SassEvent, "starts_at" | "ends_at">, now = new Date()) {
  const start = new Date(event.starts_at).getTime();
  const end = event.ends_at ? new Date(event.ends_at).getTime() : start + 12 * 3600_000;
  const opensAt = new Date(start - 24 * 3600_000);
  const closesAt = new Date(end + 12 * 3600_000);
  return { open: now >= opensAt && now <= closesAt, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString(), upcoming: now < opensAt };
}
