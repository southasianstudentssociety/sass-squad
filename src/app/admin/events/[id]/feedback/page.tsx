import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { FEEDBACK_DAYS } from "@/lib/feedback";

export const metadata = { title: "Feedback" };

type Row = { rating: number; comment: string | null; name: string | null; created_at: string };

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: event }, { data, error }, { count: attended }] = await Promise.all([
    supabase.from("events").select("title").eq("id", id).maybeSingle<{ title: string }>(),
    supabase.rpc("event_feedback_report", { p_event_id: id }),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", id).not("checked_in_at", "is", null),
  ]);
  if (!event) notFound();
  const rows = (error ? [] : data ?? []) as Row[];
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: rows.filter((r) => r.rating === n).length }));
  const most = Math.max(1, ...dist.map((d) => d.count));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/admin/events/${id}`} className="text-xs text-muted underline">← {event.title}</Link>
        <h1 className="mt-1 font-display text-3xl">Feedback</h1>
        <p className="text-sm text-muted">
          {rows.length} of {attended ?? 0} people who came rated it. Rating stays open for {FEEDBACK_DAYS} days after the event; people can choose to be anonymous.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="card py-10 text-center text-sm text-muted">No feedback yet. People who checked in see a &quot;How was it?&quot; card on their ticket.</p>
      ) : (
        <>
          <section className="card grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="text-center sm:pr-6">
              <p className="text-5xl font-semibold tabular-nums">{avg.toFixed(1)}</p>
              <p className="mt-1 flex justify-center gap-0.5" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`size-4 ${avg >= n - 0.25 ? "fill-accent text-accent" : "text-line"}`} />)}
              </p>
              <p className="mt-1 text-xs text-muted">average of {rows.length}</p>
            </div>
            {/* Single series, so no legend; each bar is labelled with its count. */}
            <ul className="space-y-1.5" aria-label="Ratings breakdown">
              {dist.map((d) => (
                <li key={d.n} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-2 text-sm">
                  <span className="text-muted">{d.n} ★</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-line">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(d.count / most) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{d.count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">Comments</h2>
            <ul className="space-y-3">
              {rows.filter((r) => r.comment).map((r, i) => (
                <li key={i} className="card space-y-2 p-4">
                  <p className="whitespace-pre-line text-sm leading-relaxed">{r.comment}</p>
                  <p className="text-xs text-muted">{"★".repeat(r.rating)} · {r.name ?? "Anonymous"} · {formatDateTime(r.created_at)}</p>
                </li>
              ))}
              {rows.every((r) => !r.comment) && <p className="text-sm text-muted">Ratings only, no comments yet.</p>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
