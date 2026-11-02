import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayInHongKong } from "@/lib/format";
import { money, type BudgetRow, type Expense } from "@/lib/budgets";
import { cn } from "@/lib/utils";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { ExpenseForm } from "./expense-form";
import { voidExpense } from "../actions";

export const metadata = { title: "Event budget" };

type ClaimLine = { id: string; reference: string; status: string; claim_revisions: { revision: number; amount_cents: number; description: string; event_id: string | null }[]; current_revision: number };

export default async function BudgetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await requireFinance(`/finance/budgets/${id}`);
  const general = id === "general";
  if (!general && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const expenseQ = supabase.from("event_expenses").select("*").order("paid_on", { ascending: false });
  const [{ data: summary }, { data: expenseData }, { data: claimData }] = await Promise.all([
    supabase.rpc("event_finance_summary"),
    general ? expenseQ.is("event_id", null).returns<Expense[]>() : expenseQ.eq("event_id", id).returns<Expense[]>(),
    supabase.from("claims").select("id, reference, status, current_revision, claim_revisions(revision, amount_cents, description, event_id)").in("status", ["submitted", "approved", "paid"]).returns<ClaimLine[]>(),
  ]);
  const row = ((summary ?? []) as BudgetRow[]).find((r) => (general ? r.event_id === null : r.event_id === id));
  if (!row) notFound();

  const expenses = expenseData ?? [];
  const live = expenses.filter((e) => !e.voided_at);
  const voided = expenses.filter((e) => e.voided_at);
  const byCategory = Object.entries(live.reduce<Record<string, number>>((a, e) => ({ ...a, [e.category]: (a[e.category] ?? 0) + e.amount_cents }), {})).sort((a, b) => b[1] - a[1]);
  const claims = (claimData ?? [])
    .map((c) => ({ ...c, cur: c.claim_revisions.find((r) => r.revision === c.current_revision) }))
    .filter((c) => c.cur && (general ? c.cur.event_id === null : c.cur.event_id === id));

  const receiptPaths = live.map((e) => e.receipt_path).filter(Boolean) as string[];
  const { data: signed } = receiptPaths.length ? await supabase.storage.from("receipts").createSignedUrls(receiptPaths, 600) : { data: [] };
  const receiptUrl = (p: string | null) => (p ? (signed ?? []).find((s) => s.path === p)?.signedUrl ?? undefined : undefined);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/finance/budgets" className="text-xs text-muted underline">← Event budgets</Link>
        <h1 className="mt-1 font-display text-3xl">{row.title}</h1>
        {row.starts_at && <p className="text-sm text-muted">{formatDate(row.starts_at)}</p>}
      </div>
      <FormMessage error={sp.error} success={sp.ok} />

      <section className="card space-y-2 p-5 text-sm">
        {general ? <Row label="Memberships sold in the app" value={money(row.membership_income)} /> : <Row label={`Tickets (${row.tickets_confirmed} confirmed)`} value={money(row.ticket_income)} />}
        {byCategory.map(([cat, cents]) => <Row key={cat} label={cat} value={money(-cents)} muted />)}
        {row.reimbursements > 0 && <Row label="Reimbursements (approved / paid claims)" value={money(-row.reimbursements)} muted />}
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-medium">Net</span>
          <span className={cn("text-2xl font-semibold tabular-nums", row.net >= 0 ? "text-ok" : "text-bad")}>{money(row.net)}</span>
        </div>
        {(row.unpaid_income > 0 || row.pending_reimbursements > 0) && (
          <p className="text-xs text-muted">
            Not counted yet: {[row.unpaid_income > 0 && `${money(row.unpaid_income)} not paid yet`, row.pending_reimbursements > 0 && `${money(row.pending_reimbursements)} in claims waiting for review`].filter(Boolean).join(" · ")}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Add an expense</h2>
        <p className="text-sm text-muted">Money the society paid directly: venue, alcohol, food, decor, performers. Things a member paid for and wants back go through Claims instead.</p>
        <ExpenseForm back={id} userId={session.userId} today={todayInHongKong()} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Expenses ({live.length})</h2>
        {live.length === 0 ? <p className="text-sm text-muted">None recorded yet.</p> : (
          <ul className="space-y-3">
            {live.map((e) => (
              <li key={e.id} className="card space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="badge bg-ink/[0.06] text-ink">{e.category}</span>
                    <p className="mt-1.5 font-medium">{e.description}</p>
                    <p className="text-xs text-muted">{formatDate(e.paid_on)}{e.payee && ` · to ${e.payee}`}{receiptUrl(e.receipt_path) && <> · <a href={receiptUrl(e.receipt_path)} target="_blank" rel="noreferrer" className="underline">receipt</a></>}</p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{money(e.amount_cents)}</p>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted">Void this expense</summary>
                  <form action={voidExpense} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="back" value={id} />
                    <input name="reason" required maxLength={300} placeholder="Why (e.g. entered twice)" className="input min-w-48 flex-1 py-2 text-sm" />
                    <SubmitButton className="btn-danger" pendingText="Voiding…">Void</SubmitButton>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {claims.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Reimbursement claims</h2>
          <ul className="card divide-y divide-line p-0 text-sm">
            {claims.map((c) => (
              <li key={c.id}>
                <Link href={`/claims/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-page">
                  <span className="min-w-0 truncate">{c.cur!.description} <span className="text-xs text-muted">· {c.reference} · {c.status === "submitted" ? "waiting for review" : c.status}</span></span>
                  <span className={cn("shrink-0 tabular-nums", c.status === "submitted" && "text-muted")}>{money(c.cur!.amount_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {voided.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Voided ({voided.length})</h2>
          <ul className="space-y-1 text-xs text-muted">
            {voided.map((e) => <li key={e.id}><span className="line-through">{e.description} · {money(e.amount_cents)}</span> — {e.void_reason}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={muted ? "text-muted" : ""}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
