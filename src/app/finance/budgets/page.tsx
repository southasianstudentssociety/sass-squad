import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { money, type BudgetRow } from "@/lib/budgets";
import { cn } from "@/lib/utils";
import { Stagger, StaggerItem } from "@/components/motion";

export const metadata = { title: "Event budgets" };

export default async function BudgetsPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("event_finance_summary");
  const rows = (data ?? []) as BudgetRow[];
  const total = rows.reduce(
    (a, r) => ({ income: a.income + r.ticket_income, costs: a.costs + r.expenses + r.reimbursements, net: a.net + r.net }),
    { income: 0, costs: 0, net: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Event budgets</h1>
          <p className="text-sm text-muted">Ticket income against what each event cost: your recorded expenses plus approved reimbursements.</p>
        </div>
        {/* A file download from a route handler, not a page, so a plain link is right. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/finance/budgets/export" className="btn-ghost"><Download className="size-4" aria-hidden />Download (CSV)</a>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <Total label="Income" value={money(total.income)} />
        <Total label="Costs" value={money(total.costs)} />
        <Total label="Net" value={money(total.net)} tone={total.net >= 0 ? "ok" : "bad"} />
      </section>

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <StaggerItem key={r.event_id ?? "general"}>
            <Link href={`/finance/budgets/${r.event_id ?? "general"}`} className="card-link flex h-full flex-col gap-4 p-5">
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-sm text-muted">{r.starts_at ? formatDate(r.starts_at) : "Running costs and claims without an event"}</p>
              </div>
              <dl className="space-y-1.5 text-sm">
                <Line label={`Tickets (${r.tickets_confirmed})`} value={money(r.ticket_income)} />
                <Line label="Expenses" value={money(-r.expenses)} />
                <Line label="Reimbursements" value={money(-r.reimbursements)} />
              </dl>
              <div className="mt-auto flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-sm text-muted">Net</span>
                <span className={cn("text-xl font-semibold tabular-nums", r.net >= 0 ? "text-ok" : "text-bad")}>{money(r.net)}</span>
              </div>
              {(r.unpaid_income > 0 || r.pending_reimbursements > 0) && (
                <p className="-mt-2 text-xs text-muted">
                  Not counted yet: {[r.unpaid_income > 0 && `${money(r.unpaid_income)} unpaid tickets`, r.pending_reimbursements > 0 && `${money(r.pending_reimbursements)} claims to review`].filter(Boolean).join(" · ")}
                </p>
              )}
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums sm:text-2xl", tone === "ok" && "text-ok", tone === "bad" && "text-bad")}>{value}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
