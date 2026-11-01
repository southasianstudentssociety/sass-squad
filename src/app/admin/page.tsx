import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { hoursAgoIso } from "@/lib/events";
import { EmptyState } from "@/components/illustrations";
import { Stagger, StaggerItem } from "@/components/motion";

export const metadata = { title: "Admin" };

type Row = {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
  is_published: boolean;
  capacity: number | null;
  tickets: { status: string; checked_in_at: string | null }[];
};

export default async function AdminHome() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at, venue, is_published, capacity, tickets(status, checked_in_at)")
    .order("starts_at", { ascending: false })
    .returns<Row[]>();
  const events = data ?? [];
  const cutoff = new Date(hoursAgoIso(12)).getTime();
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() > cutoff).reverse();
  const past = events.filter((e) => !upcoming.includes(e));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Events</h1>
        <Link href="/admin/events/new" className="btn-primary"><Plus className="size-4" aria-hidden />New event</Link>
      </div>

      {events.length === 0 ? (
        <div className="card">
          <EmptyState illustration="events" title="No events yet" action={<Link href="/admin/events/new" className="btn-primary">Create the first one</Link>} />
        </div>
      ) : (
        <>
          <EventGrid title="Upcoming" events={upcoming} />
          {past.length > 0 && <EventGrid title="Past" events={past} muted />}
        </>
      )}
    </div>
  );
}

function EventGrid({ title, events, muted }: { title: string; events: Row[]; muted?: boolean }) {
  if (events.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="eyebrow">{title}</h2>
      <Stagger className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${muted ? "opacity-75" : ""}`}>
        {events.map((e) => <StaggerItem key={e.id}><AdminEventCard e={e} /></StaggerItem>)}
      </Stagger>
    </section>
  );
}

function AdminEventCard({ e }: { e: Row }) {
  const confirmed = e.tickets.filter((t) => t.status === "confirmed").length;
  const unpaid = e.tickets.filter((t) => t.status === "awaiting_payment").length;
  const checkedIn = e.tickets.filter((t) => t.checked_in_at).length;
  const pct = confirmed ? Math.round((checkedIn / confirmed) * 100) : 0;

  return (
    <Link href={`/admin/events/${e.id}`} className="card-link group flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium">{e.title}</p>
          <p className="truncate text-sm text-muted">{formatDateTime(e.starts_at)}{e.venue && ` · ${e.venue}`}</p>
        </div>
        {!e.is_published && <span className="badge shrink-0 bg-warn/10 text-warn">Draft</span>}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Confirmed" value={`${confirmed}${e.capacity ? `/${e.capacity}` : ""}`} />
        <Stat label="Unpaid" value={String(unpaid)} warn={unpaid > 0} />
        <Stat label="Checked in" value={String(checkedIn)} />
      </dl>

      <div className="space-y-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full rounded-full bg-ok transition-[width] duration-700 ease-[var(--ease-out-soft)]" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted">{confirmed ? `${pct}% checked in` : "No confirmed tickets yet"}</p>
      </div>

      <span className="btn-ghost mt-auto w-full justify-between group-hover:border-ink/15">
        Manage
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2.5 ${warn ? "bg-warn/10" : "bg-page"}`}>
      <dd className={`text-lg font-semibold tabular-nums ${warn ? "text-warn" : "text-ink"}`}>{value}</dd>
      <dt className="text-[11px] text-muted">{label}</dt>
    </div>
  );
}
