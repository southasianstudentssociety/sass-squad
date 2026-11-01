import type { SassEvent } from "@/lib/types";

export const EVENT_COLUMNS =
  "id, slug, title, description, venue, starts_at, ends_at, cover_image_url, is_published, access, member_price_pence, public_price_pence, capacity, member_sales_open_at, public_sales_open_at, sales_close_at, payment_instructions";

export type SalesState =
  | { state: "open" }
  | { state: "not_yet"; opensAt: string }
  | { state: "closed" }
  | { state: "members_only" };

/** Mirrors the rules in claim_ticket() so the UI tells people the same thing the DB will. */
export function salesStateFor(event: SassEvent, isMember: boolean, now = new Date()): SalesState {
  if (event.access === "members_only" && !isMember) return { state: "members_only" };
  const opensAt = isMember ? (event.member_sales_open_at ?? event.public_sales_open_at) : event.public_sales_open_at;
  if (opensAt && now < new Date(opensAt)) return { state: "not_yet", opensAt };
  if (event.sales_close_at && now > new Date(event.sales_close_at)) return { state: "closed" };
  return { state: "open" };
}

export function priceFor(event: SassEvent, isMember: boolean): number {
  return isMember ? event.member_price_pence : event.public_price_pence;
}

export function eventIsOver(event: SassEvent, now = new Date()): boolean {
  const end = event.ends_at ? new Date(event.ends_at) : new Date(new Date(event.starts_at).getTime() + 6 * 3600_000);
  return now > end;
}

/** ISO timestamp `hours` ago. Used to keep events visible on the day they happen. */
export function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}
