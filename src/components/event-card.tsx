import Link from "next/link";
import type { SassEvent } from "@/lib/types";
import { formatDateTime, formatPrice } from "@/lib/format";

export function EventCard({ event }: { event: SassEvent }) {
  return (
    <Link href={`/events/${event.slug}`} className="card group flex flex-col overflow-hidden p-0 transition hover:shadow-md">
      <div className="aspect-[16/9] w-full bg-brand-soft">
        {event.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.cover_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl font-extrabold text-brand/40">SASS</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-brand">
          {formatDateTime(event.starts_at)}
          {event.access === "members_only" && <span className="badge bg-accent text-accent-ink">Members only</span>}
        </div>
        <h3 className="text-lg font-bold group-hover:underline">{event.title}</h3>
        {event.venue && <p className="text-sm text-muted">{event.venue}</p>}
        <p className="mt-auto pt-2 text-sm">
          <span className="font-semibold">Members: {formatPrice(event.member_price_pence)}</span>
          {event.access === "everyone" && (
            <span className="text-muted"> · Non-members: {formatPrice(event.public_price_pence)}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
