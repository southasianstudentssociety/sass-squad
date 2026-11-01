import Link from "next/link";
import { notFound } from "next/navigation";
import { Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/format";
import type { Ticket } from "@/lib/types";
import { AutoRefresh } from "@/components/auto-refresh";
import { ArrivalsChart } from "./arrivals-chart";

export const metadata = { title: "Door live" };

type Log = { id: number; ticket_id: string | null; scanned_by: string | null; result: string; created_at: string };

const BUCKET_MIN = 10;
const REJECT_LABEL: Record<string, string> = {
  already_used: "Already used (possible shared screenshot)",
  unpaid: "Not paid",
  cancelled: "Cancelled ticket",
  wrong_event: "Wrong event",
  invalid: "Not a SASS ticket",
};

export default async function LivePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [{ data: event }, { data: ticketData }, { data: logData }] = await Promise.all([
    supabase.from("events").select("id, title, starts_at, capacity").eq("id", id).maybeSingle<{ id: string; title: string; starts_at: string; capacity: number | null }>(),
    supabase.from("tickets").select("*").eq("event_id", id).returns<Ticket[]>(),
    supabase.from("scan_logs").select("id, ticket_id, scanned_by, result, created_at").eq("event_id", id).order("created_at", { ascending: false }).limit(500).returns<Log[]>(),
  ]);
  if (!event) notFound();

  const tickets = ticketData ?? [];
  const logs = logData ?? [];
  const confirmed = tickets.filter((t) => t.status === "confirmed");
  const arrived = confirmed.filter((t) => t.checked_in_at);
  const waiting = confirmed.filter((t) => !t.checked_in_at);
  const unpaid = tickets.filter((t) => t.status === "awaiting_payment").length;
  const pct = confirmed.length ? Math.round((arrived.length / confirmed.length) * 100) : 0;

  // "Now" = the newest moment we know about: render-time clock reads aren't allowed in server components' render,
  // and the newest check-in or scan is what matters on the night anyway.
  const times = [...arrived.map((t) => t.checked_in_at!), ...logs.map((l) => l.created_at)].map((s) => new Date(s).getTime());
  const latest = times.length ? Math.max(...times) : null;
  const last10 = latest ? arrived.filter((t) => new Date(t.checked_in_at!).getTime() > latest - 10 * 60_000).length : 0;

  // Arrivals per 10 minutes, from the first check-in to the latest.
  const buckets: { start: number; count: number }[] = [];
  if (arrived.length && latest) {
    const first = Math.min(...arrived.map((t) => new Date(t.checked_in_at!).getTime()));
    const startB = Math.floor(first / (BUCKET_MIN * 60_000)) * BUCKET_MIN * 60_000;
    for (let b = startB; b <= latest; b += BUCKET_MIN * 60_000) buckets.push({ start: b, count: 0 });
    for (const t of arrived) {
      const i = Math.floor((new Date(t.checked_in_at!).getTime() - startB) / (BUCKET_MIN * 60_000));
      if (buckets[i]) buckets[i].count++;
    }
  }
  const shown = buckets.slice(-18); // last 3 hours

  const rejections = Object.entries(
    logs.filter((l) => l.result in REJECT_LABEL).reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.result]: (acc[l.result] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);

  // Who scanned: names for the activity feed (admins can read profiles).
  const scannerIds = [...new Set([...logs.map((l) => l.scanned_by), ...arrived.map((t) => t.checked_in_by)].filter(Boolean))] as string[];
  const { data: people } = scannerIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", scannerIds).returns<{ id: string; full_name: string | null; email: string }[]>()
    : { data: [] };
  const who = (uid: string | null) => {
    const p = (people ?? []).find((x) => x.id === uid);
    return p ? (p.full_name ?? p.email).split(" ")[0] : "-";
  };
  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const feed = logs.slice(0, 15);

  const q = (sp.q ?? "").trim().toLowerCase();
  const waitingShown = waiting
    .filter((t) => !q || [t.holder_name, t.holder_email ?? "", t.payment_reference].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => a.holder_name.localeCompare(b.holder_name));

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/admin/events/${id}`} className="text-xs text-muted underline">← {event.title}</Link>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl">
            Door live
            <span className="relative flex size-2.5" aria-hidden><span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-ok" /></span>
          </h1>
          <p className="text-xs text-muted"><Radio className="mr-1 inline size-3" aria-hidden />Updates every 10 seconds while this screen is open</p>
        </div>
        <Link href={`/scan/${id}`} className="btn-primary">Open scanner</Link>
      </div>

      {/* Headline numbers */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card col-span-2 p-5 lg:col-span-2">
          <p className="text-xs text-muted">Arrived</p>
          <p className="mt-1 text-5xl font-semibold tabular-nums">{arrived.length}<span className="text-2xl text-muted">/{confirmed.length}</span></p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-ok transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{pct}% of confirmed tickets{event.capacity ? ` · capacity ${event.capacity}` : ""}</p>
        </div>
        <Tile label="Latest 10 min at the door" value={String(last10)} hint={last10 ? `about ${(last10 / 10).toFixed(1)} per minute` : "no check-ins yet"} />
        <Tile label="Still to arrive" value={String(waiting.length)} hint={unpaid ? `${unpaid} more haven't paid` : "everyone has paid"} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Arrivals chart */}
          <section className="card p-5">
            <h2 className="text-sm font-medium">Arrivals per {BUCKET_MIN} minutes</h2>
            <ArrivalsChart buckets={shown} minutes={BUCKET_MIN} />
          </section>

          {/* Not arrived */}
          <section className="card space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Not arrived yet ({waiting.length})</h2>
              <form className="w-full sm:w-64"><input name="q" defaultValue={sp.q} placeholder="Search name or reference" className="input py-2 text-sm" /></form>
            </div>
            <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">
              {waitingShown.slice(0, 200).map((t) => (
                <li key={t.id} className="flex justify-between gap-3 py-2">
                  <span className="truncate">{t.holder_name}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">{t.payment_reference}</span>
                </li>
              ))}
              {waitingShown.length === 0 && <li className="py-6 text-center text-muted">{waiting.length ? "No match." : "Everyone's in."}</li>}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          {/* Rejections */}
          <section className="card space-y-2 p-5">
            <h2 className="text-sm font-medium">Turned away at the scanner</h2>
            {rejections.length === 0 ? (
              <p className="text-sm text-muted">None so far.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {rejections.map(([r, n]) => (
                  <li key={r} className="flex justify-between gap-3">
                    <span className={r === "already_used" ? "font-medium text-bad" : ""}>{REJECT_LABEL[r]}</span>
                    <span className="tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Activity */}
          <section className="card space-y-2 p-5">
            <h2 className="text-sm font-medium">Latest at the door</h2>
            {feed.length === 0 ? (
              <p className="text-sm text-muted">Nothing scanned yet.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {feed.map((l) => {
                  const t = l.ticket_id ? ticketById.get(l.ticket_id) : undefined;
                  const ok = l.result === "ok" || l.result === "ok_door";
                  return (
                    <li key={l.id} className="flex items-start gap-2">
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${ok ? "bg-ok" : "bg-bad"}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{t?.holder_name ?? "Unknown ticket"}</span>
                        <span className="text-muted"> · {ok ? (l.result === "ok_door" ? "walk-in" : "checked in") : REJECT_LABEL[l.result] ?? l.result}</span>
                        <span className="block text-xs text-muted">{formatTime(l.created_at)} · by {who(l.scanned_by)}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
