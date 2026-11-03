import Link from "next/link";
import { FilterForm } from "@/components/filter-form";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayInHongKong } from "@/lib/format";
import { hoursAgoIso } from "@/lib/events";

export const metadata = { title: "Attendance" };

type T = { user_id: string | null; holder_name: string; holder_email: string | null; event_id: string; status: string; checked_in_at: string | null };
type E = { id: string; title: string; starts_at: string };
type M = { full_name: string; email: string; alt_email: string | null; valid_until: string };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: tData }, { data: eData }, { data: mData }] = await Promise.all([
    supabase.from("tickets").select("user_id, holder_name, holder_email, event_id, status, checked_in_at").neq("status", "cancelled").returns<T[]>(),
    supabase.from("events").select("id, title, starts_at").lt("starts_at", hoursAgoIso(0)).order("starts_at", { ascending: false }).returns<E[]>(),
    supabase.from("members").select("full_name, email, alt_email, valid_until").gte("valid_until", todayInHongKong()).returns<M[]>(),
  ]);
  const tickets = tData ?? [];
  const pastEvents = eData ?? [];
  const members = mData ?? [];
  const eventById = new Map(pastEvents.map((e) => [e.id, e]));

  // People, keyed by account (or email for door tickets)
  type P = { name: string; email: string | null; attended: number; booked: number; last: string | null };
  const people = new Map<string, P>();
  for (const t of tickets) {
    const key = t.user_id ?? t.holder_email?.toLowerCase() ?? `name:${t.holder_name.toLowerCase()}`;
    const p = people.get(key) ?? { name: t.holder_name, email: t.holder_email, attended: 0, booked: 0, last: null };
    p.booked++;
    if (t.checked_in_at) {
      p.attended++;
      const start = eventById.get(t.event_id)?.starts_at ?? t.checked_in_at;
      if (!p.last || start > p.last) p.last = start;
    }
    people.set(key, p);
  }
  const attendedEmails = new Set(tickets.filter((t) => t.checked_in_at && t.holder_email).map((t) => t.holder_email!.toLowerCase()));
  const neverCame = members.filter((m) => !attendedEmails.has(m.email.toLowerCase()) && !(m.alt_email && attendedEmails.has(m.alt_email.toLowerCase())));
  const q = (sp.q ?? "").trim().toLowerCase();
  const regulars = [...people.values()]
    .filter((p) => p.attended > 0 && (!q || p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q)))
    .sort((a, b) => b.attended - a.attended || (b.last ?? "").localeCompare(a.last ?? ""));

  const perEvent = pastEvents.map((e) => {
    const ts = tickets.filter((t) => t.event_id === e.id && t.status === "confirmed");
    const came = ts.filter((t) => t.checked_in_at).length;
    return { ...e, confirmed: ts.length, came, rate: ts.length ? Math.round((came / ts.length) * 100) : null };
  });
  const rated = perEvent.filter((e) => e.rate !== null);
  const avgRate = rated.length ? Math.round(rated.reduce((s, e) => s + e.rate!, 0) / rated.length) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Attendance</h1>
        <p className="text-sm text-muted">Who actually comes, worked out from check-ins at the door.</p>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <Tile label="People who've come" value={String([...people.values()].filter((p) => p.attended > 0).length)} />
        <Tile label="Turn-up rate" value={avgRate === null ? "-" : `${avgRate}%`} hint="checked in ÷ confirmed, past events" />
        <Tile label="Members yet to come" value={String(neverCame.length)} hint={`of ${members.length} active`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-medium">Regulars</h2>
            <FilterForm className="w-full sm:w-56"><input name="q" defaultValue={sp.q} placeholder="Search" className="input py-2 text-sm" /></FilterForm>
          </div>
          <ul className="card divide-y divide-line p-0 text-sm">
            {regulars.slice(0, 50).map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{p.email ?? "door ticket"}{p.last && ` · last ${formatDate(p.last)}`}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="text-lg font-semibold tabular-nums">{p.attended}</span>
                  <span className="text-xs text-muted"> / {p.booked}</span>
                </span>
              </li>
            ))}
            {regulars.length === 0 && <li className="px-4 py-6 text-center text-muted">Nobody has checked in yet.</li>}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Active members who haven&apos;t come yet ({neverCame.length})</h2>
          <p className="text-sm text-muted">Worth a personal invite to the next event.</p>
          <ul className="card max-h-96 divide-y divide-line overflow-y-auto p-0 text-sm">
            {neverCame.slice(0, 300).map((m) => (
              <li key={m.email} className="flex justify-between gap-3 px-4 py-2.5">
                <span className="truncate">{m.full_name}</span>
                <span className="shrink-0 truncate text-xs text-muted">{m.email}</span>
              </li>
            ))}
            {neverCame.length === 0 && <li className="px-4 py-6 text-center text-muted">Every active member has been to something.</li>}
          </ul>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">By event</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perEvent.map((e) => (
            <li key={e.id}>
              <Link href={`/admin/events/${e.id}/feedback`} className="card-link block space-y-2 p-4">
                <p className="font-medium">{e.title}</p>
                <p className="text-xs text-muted">{formatDate(e.starts_at)} · {e.came} of {e.confirmed} came</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden><div className="h-full rounded-full bg-ok" style={{ width: `${e.rate ?? 0}%` }} /></div>
                <p className="text-xs text-muted">{e.rate === null ? "No confirmed tickets" : `${e.rate}% turned up`} · see feedback →</p>
              </Link>
            </li>
          ))}
          {perEvent.length === 0 && <li className="text-sm text-muted">No past events yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
