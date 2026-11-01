import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS } from "@/lib/events";
import { formatDateTime, formatPrice, formatTime } from "@/lib/format";
import type { SassEvent, Ticket } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { cancelTicket, confirmPayment, undoCheckIn } from "../../actions";

export const metadata = { title: "Manage event" };

const FILTERS = {
  all: "All",
  awaiting_payment: "Awaiting payment",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  cancelled: "Cancelled",
} as const;
type Filter = keyof typeof FILTERS;

export default async function ManageEvent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; ok?: string; error?: string; q?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const filter: Filter = (sp.filter && sp.filter in FILTERS ? sp.filter : "all") as Filter;
  const supabase = await createClient();

  const { data: event } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle<SassEvent>();
  if (!event) notFound();

  const { data } = await supabase
    .from("tickets")
    .select("*")
    .eq("event_id", id)
    .order("created_at", { ascending: true })
    .returns<Ticket[]>();
  const all = data ?? [];

  const q = (sp.q ?? "").trim().toLowerCase();
  const tickets = all.filter((t) => {
    if (filter === "checked_in" && !t.checked_in_at) return false;
    if (filter !== "all" && filter !== "checked_in" && t.status !== filter) return false;
    if (q && ![t.holder_name, t.holder_email ?? "", t.payment_reference].some((s) => s.toLowerCase().includes(q))) return false;
    return true;
  });

  const confirmed = all.filter((t) => t.status === "confirmed");
  const revenue = confirmed.reduce((s, t) => s + t.price_pence, 0);
  const owed = all.filter((t) => t.status === "awaiting_payment").reduce((s, t) => s + t.price_pence, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{event.title}</h1>
          <p className="text-sm text-muted">{formatDateTime(event.starts_at)}{event.venue && ` · ${event.venue}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/events/${event.slug}`} className="btn-ghost">View page</Link>
          <Link href={`/admin/events/${id}/edit`} className="btn-ghost">Edit</Link>
          <Link href={`/scan/${id}`} className="btn-primary">Open scanner</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Confirmed" value={`${confirmed.length}${event.capacity ? ` / ${event.capacity}` : ""}`} />
        <Stat label="Checked in" value={String(all.filter((t) => t.checked_in_at).length)} />
        <Stat label="Confirmed revenue" value={formatPrice(revenue).replace("Free", "£0.00")} />
        <Stat label="Awaiting payment" value={formatPrice(owed).replace("Free", "£0.00")} warn={owed > 0} />
      </div>

      <FormMessage error={sp.error} success={sp.ok} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <Link
            key={f}
            href={`/admin/events/${id}?filter=${f}`}
            className={`rounded-full px-3 py-1 ${filter === f ? "bg-brand text-brand-ink" : "bg-surface border border-line"}`}
          >
            {FILTERS[f]}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="filter" value={filter} />
          <input name="q" defaultValue={sp.q} placeholder="Search name / email / ref" className="input py-1.5 text-sm" />
        </form>
      </div>

      <div className="flex gap-3 text-sm">
        <a href={`/admin/events/${id}/export`} className="underline">Download CSV</a>
        <Link href={`/admin/events/${id}/print`} className="underline">Printable guest list</Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Reference</th><th>Type</th><th>Price</th><th>Status</th><th>Booked</th><th></th></tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td>
                  <p className="font-semibold">{t.holder_name}</p>
                  <p className="text-xs text-muted">{t.holder_email}</p>
                  {t.notes && <p className="text-xs text-muted">📝 {t.notes}</p>}
                </td>
                <td className="font-mono text-xs">{t.payment_reference}</td>
                <td className="whitespace-nowrap text-xs">
                  {t.is_member ? "Member" : "Non-member"}
                  {t.source !== "online" && <><br />{t.source === "comp" ? "Comp" : "Walk-in"}</>}
                </td>
                <td>{formatPrice(t.price_pence)}</td>
                <td className="whitespace-nowrap">
                  <StatusBadge status={t.status} checkedIn={!!t.checked_in_at} />
                  {t.checked_in_at && <p className="text-xs text-muted">{formatTime(t.checked_in_at)}</p>}
                </td>
                <td className="whitespace-nowrap text-xs text-muted">{formatDateTime(t.created_at)}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    {t.status === "awaiting_payment" && (
                      <RowAction action={confirmPayment} ticketId={t.id} eventId={id} filter={filter} label="Mark paid" className="btn-primary px-3 py-1.5" />
                    )}
                    {t.checked_in_at && (
                      <RowAction action={undoCheckIn} ticketId={t.id} eventId={id} filter={filter} label="Undo check-in" className="btn-ghost px-3 py-1.5" />
                    )}
                    {t.status !== "cancelled" && !t.checked_in_at && (
                      <RowAction action={cancelTicket} ticketId={t.id} eventId={id} filter={filter} label="Cancel" className="btn-danger px-3 py-1.5" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {tickets.length === 0 && <tr><td colSpan={7} className="text-muted">No tickets.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl font-extrabold ${warn ? "text-warn" : ""}`}>{value}</p>
    </div>
  );
}

function RowAction(props: { action: (fd: FormData) => Promise<void>; ticketId: string; eventId: string; filter: string; label: string; className: string }) {
  return (
    <form action={props.action}>
      <input type="hidden" name="ticket_id" value={props.ticketId} />
      <input type="hidden" name="event_id" value={props.eventId} />
      <input type="hidden" name="filter" value={props.filter} />
      <SubmitButton className={`${props.className} whitespace-nowrap`} pendingText="…">{props.label}</SubmitButton>
    </form>
  );
}
