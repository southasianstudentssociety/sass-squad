import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { todayInHongKong } from "@/lib/format";
import type { BudgetRow, Expense } from "@/lib/budgets";

// Treasurer's record: one summary row per event, then every expense (voided ones marked).
export async function GET() {
  const session = await getSession();
  if (!session?.access.isFinance) return new NextResponse("Forbidden", { status: 403 });
  const supabase = await createClient();
  const [{ data: summary }, { data: expenses }] = await Promise.all([
    supabase.rpc("event_finance_summary"),
    supabase.from("event_expenses").select("*").order("paid_on").returns<Expense[]>(),
  ]);
  const rows = (summary ?? []) as BudgetRow[];
  const title = new Map(rows.map((r) => [r.event_id ?? "general", r.title]));
  const hk = (c: number) => (c / 100).toFixed(2);

  const csv = toCsv([
    ["EVENT SUMMARY"],
    ["Event", "Date", "Confirmed tickets", "Ticket income (HK$)", "Membership income (HK$)", "Expenses (HK$)", "Reimbursements (HK$)", "Net (HK$)", "Unpaid tickets (HK$)", "Claims to review (HK$)"],
    ...rows.map((r) => [r.title, r.starts_at?.slice(0, 10) ?? "", r.tickets_confirmed, hk(r.ticket_income), hk(r.membership_income), hk(r.expenses), hk(r.reimbursements), hk(r.net), hk(r.unpaid_income), hk(r.pending_reimbursements)]),
    [],
    ["EXPENSES"],
    ["Paid on", "Event", "Category", "Description", "Paid to", "Amount (HK$)", "Voided", "Void reason"],
    ...(expenses ?? []).map((e) => [e.paid_on, title.get(e.event_id ?? "general") ?? "", e.category, e.description, e.payee ?? "", hk(e.amount_cents), e.voided_at ? "yes" : "", e.void_reason ?? ""]),
  ]);
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sass-budgets-${todayInHongKong()}.csv"` },
  });
}
