import Link from "next/link";
import { requireFinance } from "@/lib/auth";
import { financeClaims } from "@/lib/claim-data";
import { formatDate, formatPrice } from "@/lib/format";
import type { ClaimStatus } from "@/lib/types";
import { EmptyState } from "@/components/illustrations";

export const metadata = { title: "Finance" };

const TABS: { status: ClaimStatus; label: string }[] = [
  { status: "submitted", label: "To review" },
  { status: "approved", label: "To pay" },
  { status: "paid", label: "Paid" },
  { status: "rejected", label: "Rejected" },
  { status: "withdrawn", label: "Withdrawn" },
];

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireFinance("/finance");
  const sp = await searchParams;
  const status = (TABS.find((t) => t.status === sp.status)?.status ?? "submitted") as ClaimStatus;
  const all = await financeClaims();
  const count = (s: ClaimStatus) => all.filter((c) => c.status === s).length;
  const total = (s: ClaimStatus) => all.filter((c) => c.status === s).reduce((n, c) => n + c.current.amount_cents, 0);
  const rows = all.filter((c) => c.status === status);
  const selfApproved = (c: (typeof all)[number]) => c.claim_events.some((e) => e.by_claimant);
  const selfCount = all.filter(selfApproved).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-normal">Finance: claims</h1>
          <p className="text-sm text-muted">
            {formatPrice(total("submitted"))} waiting for review · {formatPrice(total("approved"))} approved, not paid yet
          </p>
        </div>
        <a href="/finance/export" className="btn-ghost">Download all (CSV)</a>
      </div>
      {session.access.isOwner && selfCount > 0 && (
        <p className="rounded-xl border border-warn/25 bg-warn/[0.06] px-3.5 py-2.5 text-sm text-warn">
          {selfCount} claim{selfCount === 1 ? " was" : "s were"} approved or paid by the person who submitted {selfCount === 1 ? "it" : "them"} (the Finance ExCo). They&apos;re marked &quot;self-approved&quot; below.
        </p>
      )}

      <nav className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link key={t.status} href={`/finance?status=${t.status}`}
            className={`rounded-md px-3 py-1.5 ${t.status === status ? "bg-brand text-brand-ink" : "btn-ghost"}`}>
            {t.label} ({count(t.status)})
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="card"><EmptyState illustration="allDone" title={status === "submitted" ? "All caught up" : "Nothing here"}>{status === "submitted" ? "No claims are waiting for review." : "No claims in this list."}</EmptyState></div>
      ) : (
        <>
        <ul className="space-y-3 sm:hidden">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/claims/${c.id}`} className="card-link block space-y-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium leading-snug">{c.current.description.slice(0, 80)}</p>
                  <p className="shrink-0 font-semibold tabular-nums">{formatPrice(c.current.amount_cents)}</p>
                </div>
                <p className="text-xs text-muted">
                  {c.claimant?.full_name ?? c.claimant?.email ?? "-"} · {c.reference} · {formatDate(c.updated_at)}
                  {c.current_revision > 1 && ` · version ${c.current_revision}`}
                  {c.claimant_id === session.userId && " · your own claim"}
                  {selfApproved(c) && " · self-approved"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="card hidden overflow-x-auto p-0 sm:block">
          <table className="table">
            <thead>
              <tr><th>Claim</th><th>By</th><th>Amount</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/claims/${c.id}`} className="font-semibold underline">{c.current.description.slice(0, 80)}</Link>
                    <span className="block text-xs text-muted">
                      {c.reference}{c.current_revision > 1 && ` · version ${c.current_revision}`}
                      {c.claimant_id === session.userId && " · your own claim"}
                    </span>
                    {selfApproved(c) && <span className="badge mt-1 bg-warn/10 text-warn">self-approved</span>}
                  </td>
                  <td>{c.claimant?.full_name ?? c.claimant?.email ?? "-"}</td>
                  <td className="whitespace-nowrap font-semibold">{formatPrice(c.current.amount_cents)}</td>
                  <td className="whitespace-nowrap text-sm">{formatDate(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
