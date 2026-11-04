import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPrice, TIME_ZONE } from "@/lib/format";
import { hoursAgoIso } from "@/lib/events";
import type { SassEvent, Ticket } from "@/lib/types";
import { TicketStubs, type StubTicket } from "@/components/ticket-stub";
import { feedbackOpen } from "@/lib/feedback";
import { EmptyState } from "@/components/illustrations";

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

  const { data: rated } = await supabase.from("event_feedback").select("event_id").returns<{ event_id: string }[]>();
  const ratedEvents = new Set((rated ?? []).map((r) => r.event_id));
  const attended = (data ?? []).filter((t) => t.checked_in_at).length;

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
          {attended > 0 && <p className="mt-1 text-sm text-ink/80">You&apos;ve been to {attended} SASS event{attended === 1 ? "" : "s"}. Thanks for coming!</p>}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {session.email}
            {session.isMember ? <span className="badge bg-accent text-accent-ink">Member</span> : <span className="badge bg-line text-muted">Not a member</span>}
          </p>
        </div>
        <Link href="/account" className="btn-ghost">Settings</Link>
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
          {past.length > 0 && <TicketList title="Past" tickets={past} muted rateable={ratedEvents} />}
        </>
      )}
    </div>
  );
}

function TicketList({ title, tickets, empty, muted, rateable }: { title: string; tickets: Row[]; empty?: string; muted?: boolean; rateable?: Set<string> }) {
  const stubs: StubTicket[] = tickets.map((t) => ({
    id: t.id,
    title: t.event.title,
    day: dayOf(t.event.starts_at),
    month: monthOf(t.event.starts_at),
    when: formatDateTime(t.event.starts_at),
    venue: t.event.venue,
    price: formatPrice(t.price_cents),
    status: t.checked_in_at ? "used" : t.status === "awaiting_payment" ? "pending" : t.status,
    rate: !!rateable && !!t.checked_in_at && !rateable.has(t.event_id) && feedbackOpen(t.event.starts_at),
  }));
  return (
    <section>
      <h2 className="eyebrow mb-3">{title}</h2>
      {tickets.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className={muted ? "opacity-75" : ""}>
          <TicketStubs tickets={stubs} />
        </div>
      )}
    </section>
  );
}

const dayOf = (iso: string) => new Intl.DateTimeFormat("en-HK", { timeZone: TIME_ZONE, day: "numeric" }).format(new Date(iso));
const monthOf = (iso: string) => new Intl.DateTimeFormat("en-HK", { timeZone: TIME_ZONE, month: "short" }).format(new Date(iso));
