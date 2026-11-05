import { Trophy } from "lucide-react";

export type ReferralRow = { id: string; name: string; paid: number; total: number };

/**
 * Who referred the most: paid (confirmed) first, then everything not cancelled.
 * `entries` are [referrerId, name, confirmed?] per ticket or application.
 */
export function tallyReferrals(entries: { referrerId: string; name: string; confirmed: boolean }[]): ReferralRow[] {
  const by = new Map<string, ReferralRow>();
  for (const e of entries) {
    const row = by.get(e.referrerId) ?? { id: e.referrerId, name: e.name, paid: 0, total: 0 };
    row.total += 1;
    if (e.confirmed) row.paid += 1;
    by.set(e.referrerId, row);
  }
  return [...by.values()].sort((a, b) => b.paid - a.paid || b.total - a.total || a.name.localeCompare(b.name));
}

export function ReferralBoard({ title, rows, unreferred }: { title: string; rows: ReferralRow[]; unreferred: number }) {
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="size-4 text-sass-yellow [filter:drop-shadow(0_0_1px_rgb(0_0_0/0.4))]" aria-hidden />{title}</h2>
        <p className="text-xs text-muted">{unreferred} with no referral</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No referrals yet.</p>
      ) : (
        <ol className="divide-y divide-line text-sm">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${i === 0 ? "bg-sass-yellow text-ink" : i === 1 ? "bg-line text-ink" : i === 2 ? "bg-accent text-accent-ink" : "text-muted"}`}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
              <span className="tabular-nums"><strong>{r.paid}</strong> <span className="text-xs text-muted">paid</span></span>
              <span className="w-16 text-right tabular-nums text-muted">{r.total} <span className="text-xs">total</span></span>
            </li>
          ))}
        </ol>
      )}
      <p className="hint">Paid = confirmed. Total also counts ones still waiting for payment. Cancelled ones don&apos;t count.</p>
    </section>
  );
}
