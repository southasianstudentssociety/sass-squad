import { CalendarCheck, Sparkles, Ticket, type LucideIcon } from "lucide-react";

// What members get. PLACEHOLDER: replace with the benefits from the society's
// membership material (title + one line each). Icons are from lucide-react.
export const MEMBERSHIP_BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Ticket, title: "Member prices", text: "Lower prices on every event, applied automatically when you get your ticket." },
  { icon: CalendarCheck, title: "Early access", text: "Get your tickets before general sales open." },
  { icon: Sparkles, title: "Members-only nights", text: "Events only members can come to." },
];

/** Shown while sales are closed, e.g. "HK$150 for 2026–27". Null hides the line. */
export const LAST_PRICE_NOTE: string | null = null;

/** The academic year the next membership is for, shown while sales are closed. */
export const NEXT_MEMBERSHIP_YEAR = "2027–28";
