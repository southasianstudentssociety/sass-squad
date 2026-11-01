import { SITE } from "@/lib/site";

type CalEvent = { title: string; slug: string; starts_at: string; ends_at: string | null; venue: string | null; description: string | null };

const DEFAULT_HOURS = 4;
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20261121T110500Z
const endOf = (e: CalEvent) => e.ends_at ?? new Date(new Date(e.starts_at).getTime() + DEFAULT_HOURS * 3600_000).toISOString();

/** RFC 5545 text: escape \ ; , and newlines. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Fold long lines at 74 octets-ish (character count is close enough for our ASCII-heavy text). */
const fold = (line: string) => line.match(/.{1,74}/g)!.join("\r\n ");

export function eventUrl(slug: string) {
  return `${SITE.url}/events/${slug}`;
}

export function icsFor(e: CalEvent, generatedAt: string): string {
  const details = [e.description?.slice(0, 500), `Your ticket: ${SITE.url}/tickets`].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SASS//Hub//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.slug}@sass-hub`,
    `DTSTAMP:${stamp(generatedAt)}`,
    `DTSTART:${stamp(e.starts_at)}`,
    `DTEND:${stamp(endOf(e))}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.venue ? [`LOCATION:${esc(e.venue)}`] : []),
    `DESCRIPTION:${esc(details)}`,
    `URL:${eventUrl(e.slug)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`${e.title} starts in 2 hours`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(e: CalEvent): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(e.starts_at)}/${stamp(endOf(e))}`,
    details: `Your ticket: ${SITE.url}/tickets`,
    ...(e.venue ? { location: e.venue } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
