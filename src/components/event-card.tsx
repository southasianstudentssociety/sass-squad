import Link from "next/link";
import type { SassEvent } from "@/lib/types";
import { formatPrice, TIME_ZONE } from "@/lib/format";

const day = (iso: string) => new Intl.DateTimeFormat("en-HK", { timeZone: TIME_ZONE, day: "numeric" }).format(new Date(iso));
const year = (iso: string) => new Intl.DateTimeFormat("en-HK", { timeZone: TIME_ZONE, year: "numeric" }).format(new Date(iso));
const month = (iso: string) => new Intl.DateTimeFormat("en-HK", { timeZone: TIME_ZONE, month: "short" }).format(new Date(iso));
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-HK", { timeZone: TIME_ZONE, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** `past`: for Previous events. Shows the year and no prices, and is a little quieter. */
export function EventCard({ event, past = false }: { event: SassEvent; past?: boolean }) {
  return (
    <Link href={`/events/${event.slug}`} className="card-link group flex h-full flex-col overflow-hidden p-0">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-brand-soft">
        {event.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.cover_image_url} alt="" loading={past ? "lazy" : undefined} className={`h-full w-full object-cover transition-[transform,filter] duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.03] ${past ? "saturate-[0.8] group-hover:saturate-100" : ""}`} />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,var(--sass-pink)_0%,transparent_55%),radial-gradient(100%_90%_at_100%_100%,var(--accent)_0%,transparent_60%)] opacity-70" />
        )}
        <div className="absolute left-3 top-3 flex flex-col items-center rounded-xl bg-surface/90 px-2.5 py-1.5 leading-none shadow-[var(--shadow-soft)] backdrop-blur">
          <span className="text-lg font-semibold tabular-nums text-ink">{day(event.starts_at)}</span>
          <span className="mt-0.5 text-[10px] font-medium tracking-wider text-muted uppercase">{month(event.starts_at)}</span>
          {past && <span className="mt-0.5 text-[10px] tabular-nums text-muted">{year(event.starts_at)}</span>}
        </div>
        {!past && event.access === "members_only" && (
          <span className="badge absolute right-3 top-3 bg-surface/90 text-ink backdrop-blur">Members only</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-[15px] font-medium leading-snug text-ink">{event.title}</h3>
        <p className="text-sm text-muted">{when(event.starts_at)}{event.venue && ` · ${event.venue}`}</p>
        {past ? (
          <p className="mt-auto pt-3 text-sm text-muted">See details{" "}<span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span></p>
        ) : (
          <p className="mt-auto pt-3 text-sm text-ink">
            {formatPrice(event.member_price_cents)} <span className="text-muted">members</span>
            {event.access === "everyone" && <span className="text-muted"> · {formatPrice(event.public_price_cents)} others</span>}
          </p>
        )}
      </div>
    </Link>
  );
}
