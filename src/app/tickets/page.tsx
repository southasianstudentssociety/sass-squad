import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPrice, TIME_ZONE } from "@/lib/format";
import { hoursAgoIso } from "@/lib/events";
import type { SassEvent, Ticket } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/illustrations";
import { Stagger, StaggerItem } from "@/components/motion";

export const metadata = { title: "My tickets" };

type Row = Ticket & { event: Pick<SassEvent, "title" | "slug" | "starts_at" | "venue"> };

export default async function TicketsPage() {
  const session = await requireUser("/tickets");
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets")
    .select("*, event:events(title, slug, starts_at, venue)")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  const cutoff = hoursAgoIso(12);
  const tickets = data ?? [];
  const upcoming = tickets.filter((t) => new Date(t.event.starts_at) > new Date(cutoff));
  const past = tickets.filter((t) => !upcoming.includes(t));

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{session.profile.full_name}</p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">My tickets</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {session.email}
            {session.isMember ? <span className="badge bg-accent text-accent-ink">Member</span> : <span className="badge bg-line text-muted">Not a member</span>}
          </p>
        </div>
        <Link href="/onboarding?edit=1&next=/tickets" className="btn-ghost">Edit my details</Link>
      </div>

      {tickets.length === 0 ? (
        <div className="card">
          <EmptyState illustration="tickets" title="No tickets yet" action={<Link href="/events" className="btn-primary">Browse events</Link>}>
            When you get a ticket it shows up here, with your QR code for the door.
          </EmptyState>
        </div>
      ) : (
        <>
          <TicketList title="Upcoming" tickets={upcoming} empty="No upcoming tickets." />
          {past.length > 0 && <TicketList title="Past" tickets={past} muted />}
        </>
      )}
    </div>
  );
}

function TicketList({ title, tickets, empty, muted }: { title: string; tickets: Row[]; empty?: string; muted?: boolean }) {
  return (
    <section>
      <h2 className="eyebrow mb-3">{title}</h2>
      {tickets.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <Stagger as="ul" className={`grid gap-3 sm:grid-cols-2 ${muted ? "opacity-70" : ""}`}>
          {tickets.map((t) => (
            <StaggerItem as="li" key={t.id}>
              <Link href={`/tickets/${t.id}`} className="card-link flex items-center gap-4 p-4">
                <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-page py-2 leading-none">
                  <span className="text-lg font-semibold tabular-nums">{dayOf(t.event.starts_at)}</span>
                  <span className="mt-1 text-[10px] font-medium tracking-wider text-muted uppercase">{monthOf(t.event.starts_at)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.event.title}</p>
                  <p className="truncate text-sm text-muted">{formatDateTime(t.event.starts_at)} · {formatPrice(t.price_cents)}</p>
                </div>
                <StatusBadge status={t.status} checkedIn={!!t.checked_in_at} />
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}

const dayOf = (iso: string) => new Intl.DateTimeFormat("en-HK", { timeZone: TIME_ZONE, day: "numeric" }).format(new Date(iso));
const monthOf = (iso: string) => new Intl.DateTimeFormat("en-HK", { timeZone: TIME_ZONE, month: "short" }).format(new Date(iso));
