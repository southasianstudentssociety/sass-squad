// Membership page content, from the society's 2026–27 membership posts.
// Edit here; the page lays it out. Prices for buying are set as offers on
// Admin → Memberships; PRICE_TIERS below is what's advertised.

export type Tone = "brand" | "yellow" | "turquoise" | "purple" | "pink" | "blue";

export const MEMBERSHIP_BENEFITS: { icon: "door" | "food" | "henna" | "ticket"; title: string; text: string; tone: Tone }[] = [
  { icon: "door", title: "Free entry", text: "To all SASS members-only events.", tone: "purple" },
  { icon: "food", title: "Free food & drinks", text: "At members-only events.", tone: "yellow" },
  { icon: "henna", title: "Free mehendi", text: "Get your henna done on us.", tone: "pink" },
  { icon: "ticket", title: "Much cheaper tickets", text: "Member prices on every SASS event, applied automatically.", tone: "turquoise" },
];

/** The advertised options. `best` marks the best-value badge. */
export const PRICE_TIERS: { years: number; price: number; best?: boolean }[] = [
  { years: 1, price: 100 },
  { years: 2, price: 180 },
  { years: 3, price: 250 },
  { years: 4, price: 300, best: true },
];

/** Academic year the advertised prices are for, and the next one (shown while sales are closed). */
export const PRICES_YEAR = "2026–27";
export const NEXT_MEMBERSHIP_YEAR = "2027–28";

/** How many flagship events earn the fee back. */
export const PAYBACK_EVENTS = 2;
