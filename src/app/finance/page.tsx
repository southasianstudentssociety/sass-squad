import Link from "next/link";
import { requireFinance } from "@/lib/auth";
import { financeClaims } from "@/lib/claim-data";
import { formatDate, formatPrice } from "@/lib/format";
import type { ClaimStatus } from "@/lib/types";

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

      <nav className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link key={t.status} href={`/finance?status=${t.status}`}
            className={`rounded-md px-3 py-1.5 ${t.status === status ? "bg-brand text-brand-ink" : "btn-ghost"}`}>
            {t.label} ({count(t.status)})
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="card text-sm text-muted">Nothing here.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
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
                  </td>
                  <td>{c.claimant?.full_name ?? c.claimant?.email ?? "-"}</td>
                  <td className="whitespace-nowrap font-semibold">{formatPrice(c.current.amount_cents)}</td>
                  <td className="whitespace-nowrap text-sm">{formatDate(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
