import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPrice } from "@/lib/format";
import { hoursAgoIso } from "@/lib/events";
import type { SassEvent, Ticket } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-normal">My tickets</h1>
          <p className="text-sm text-muted">
            {session.profile.full_name} · {session.email}{" "}
            {session.isMember ? <span className="badge bg-accent text-accent-ink">Member</span> : <span className="badge bg-line text-muted">Not a member</span>}
          </p>
        </div>
        <Link href="/onboarding?edit=1&next=/tickets" className="text-sm underline">Edit my details</Link>
      </div>

      <TicketList title="Upcoming" tickets={upcoming} empty={<>No tickets yet. <Link href="/events" className="underline">Browse events</Link>.</>} />
      {past.length > 0 && <TicketList title="Past" tickets={past} />}
    </div>
  );
}

function TicketList({ title, tickets, empty }: { title: string; tickets: Row[]; empty?: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {tickets.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/tickets/${t.id}`} className="card flex items-center justify-between gap-3 hover:shadow-md">
                <div>
                  <p className="font-bold">{t.event.title}</p>
                  <p className="text-sm text-muted">{formatDateTime(t.event.starts_at)} · {formatPrice(t.price_pence)}</p>
                </div>
                <StatusBadge status={t.status} checkedIn={!!t.checked_in_at} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
