import Link from "next/link";
import { notFound } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { requireFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayInHongKong } from "@/lib/format";
import { academicYear, money, statement, yearLabel, type Expense, type FinanceLine } from "@/lib/budgets";
import { cn } from "@/lib/utils";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Modal } from "@/components/modal";
import { EntryForm } from "../entry-form";
import { StatementTable } from "../statement-table";
import { voidExpense } from "../actions";

export const metadata = { title: "Event accounts" };

type ClaimLine = { id: string; reference: string; status: string; created_at: string; claim_revisions: { revision: number; amount_cents: number; description: string; event_id: string | null }[]; current_revision: number };

export default async function EventAccountsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; ok?: string; error?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await requireFinance(`/finance/budgets/${id}`);
  const general = id === "general";
  if (!general && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const today = todayInHongKong();

  const { data: event } = general
    ? { data: null }
    : await supabase.from("events").select("id, title, starts_at").eq("id", id).maybeSingle<{ id: string; title: string; starts_at: string }>();
  if (!general && !event) notFound();

  const year = general ? (Number.isInteger(Number(sp.year)) && sp.year ? Number(sp.year) : academicYear(today)) : academicYear(todayInHongKong(new Date(event!.starts_at)));
  const here = general ? `/finance/budgets/general?year=${year}` : `/finance/budgets/${id}`;

  const entryQ = supabase.from("event_expenses").select("*").order("paid_on", { ascending: false });
  const [{ data: lineData }, { data: entryData }, { data: claimData }] = await Promise.all([
    supabase.rpc("finance_lines", { p_year_start: year }),
    general ? entryQ.is("event_id", null).returns<Expense[]>() : entryQ.eq("event_id", id).returns<Expense[]>(),
    supabase.from("claims").select("id, reference, status, created_at, current_revision, claim_revisions(revision, amount_cents, description, event_id)").in("status", ["submitted", "approved", "paid"]).returns<ClaimLine[]>(),
  ]);
  const lines = ((lineData ?? []) as FinanceLine[]).filter((l) => (general ? l.event_id === null : l.event_id === id));
  const st = statement(lines);

  // General entries belong to the year of their date; event entries all belong to the event.
  const inScope = (entryData ?? []).filter((e) => !general || academicYear(e.paid_on) === year);
  const live = inScope.filter((e) => !e.voided_at);
  const voided = inScope.filter((e) => e.voided_at);
  const claims = (claimData ?? [])
    .map((c) => ({ ...c, cur: c.claim_revisions.find((r) => r.revision === c.current_revision) }))
    .filter((c) => c.cur && (general ? c.cur.event_id === null && academicYear(todayInHongKong(new Date(c.created_at))) === year : c.cur.event_id === id));

  const receiptPaths = live.map((e) => e.receipt_path).filter(Boolean) as string[];
  const { data: signed } = receiptPaths.length ? await supabase.storage.from("receipts").createSignedUrls(receiptPaths, 600) : { data: [] };
  const receiptUrl = (p: string | null) => (p ? (signed ?? []).find((s) => s.path === p)?.signedUrl ?? undefined : undefined);
  const fixedEvent = general ? "" : id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/finance/budgets?year=${year}`} className="text-xs text-muted underline">← Accounts {yearLabel(year)}</Link>
          <h1 className="mt-1 font-display text-3xl">{general ? "General" : event!.title}</h1>
          <p className="text-sm text-muted">{general ? `Money not tied to one event, ${yearLabel(year)}` : formatDate(event!.starts_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Modal label="Add expense" title={`Add an expense${general ? "" : ` for ${event!.title}`}`} description="Money the society paid directly. Things a member paid for and wants back go through Claims instead." icon={<Minus className="size-4" aria-hidden />}>
            <EntryForm kind="expense" back={here} userId={session.userId} today={today} events={[]} eventId={fixedEvent} />
          </Modal>
          <Modal label="Add income" title={`Add income${general ? "" : ` for ${event!.title}`}`} description={general ? "Grants, sponsorship, donations. Memberships sold in the app are added automatically." : "Sponsorship, cash at the door, anything the hub doesn't already know about. Ticket sales are added automatically."} triggerClassName="btn-blue" icon={<Plus className="size-4" aria-hidden />}>
            <EntryForm kind="income" back={here} userId={session.userId} today={today} events={[]} eventId={fixedEvent} />
          </Modal>
        </div>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />

      <section className="space-y-2">
        <h2 className="eyebrow">Income statement</h2>
        <StatementTable st={st} />
        {(st.unpaidIncome > 0 || st.pendingClaims > 0) && (
          <p className="text-xs text-muted">
            Not counted yet: {[st.unpaidIncome > 0 && `${money(st.unpaidIncome)} not paid to us yet`, st.pendingClaims > 0 && `${money(st.pendingClaims)} in claims waiting for review`].filter(Boolean).join(" · ")}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="eyebrow">Entries ({live.length})</h2>
        {live.length === 0 ? (
          <p className="text-sm text-muted">Nothing entered yet. Use <strong>Add expense</strong> or <strong>Add income</strong> above.</p>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="sheet min-w-[44rem]">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Category</th><th>What for</th><th>From / to</th><th className="text-right">Amount</th><th /></tr>
              </thead>
              <tbody>
                {live.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap tabular-nums">{formatDate(e.paid_on)}</td>
                    <td><span className={cn("badge", e.kind === "income" ? "bg-sass-blue/10 text-sass-blue" : "bg-brand/10 text-brand")}>{e.kind === "income" ? "Income" : "Expense"}</span></td>
                    <td className="whitespace-nowrap">{e.category}</td>
                    <td>
                      {e.description}
                      {receiptUrl(e.receipt_path) && <> · <a href={receiptUrl(e.receipt_path)} target="_blank" rel="noreferrer" className="text-xs underline">file</a></>}
                    </td>
                    <td className="whitespace-nowrap">{e.payee ?? <span className="text-muted">-</span>}</td>
                    <td className={cn("text-right font-medium tabular-nums", e.kind === "income" ? "text-ok" : undefined)}>{money(e.kind === "income" ? e.amount_cents : -e.amount_cents)}</td>
                    <td>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-xs text-muted">Void</summary>
                        <form action={voidExpense} className="mt-2 flex gap-2">
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="back" value={here} />
                          <input name="reason" required maxLength={300} placeholder="Why (e.g. entered twice)" className="input w-48 py-1.5 text-sm" />
                          <SubmitButton className="btn-danger px-3 py-1.5" pendingText="Voiding…">Void</SubmitButton>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {claims.length > 0 && (
        <section className="space-y-2">
          <h2 className="eyebrow">Reimbursement claims</h2>
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
            {voided.map((e) => <li key={e.id}><span className="line-through">{e.kind === "income" ? "Income" : "Expense"}: {e.description} · {money(e.amount_cents)}</span> — {e.void_reason}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
