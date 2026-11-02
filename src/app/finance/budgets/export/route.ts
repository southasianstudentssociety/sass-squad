import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { todayInHongKong } from "@/lib/format";
import { academicYear, statement, yearLabel, type Expense, type FinanceLine } from "@/lib/budgets";

// Treasurer's record for one academic year: the income statement, each event's
// totals, then every entry Finance made (voided ones marked).
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.access.isFinance) return new NextResponse("Forbidden", { status: 403 });
  const asked = Number(request.nextUrl.searchParams.get("year"));
  const year = Number.isInteger(asked) && asked > 2000 ? asked : academicYear(todayInHongKong());
  const supabase = await createClient();
  const [{ data: lineData }, { data: events }, { data: entries }] = await Promise.all([
    supabase.rpc("finance_lines", { p_year_start: year }),
    supabase.from("events").select("id, title, starts_at").order("starts_at").returns<{ id: string; title: string; starts_at: string }[]>(),
    supabase.from("event_expenses").select("*").order("paid_on").returns<Expense[]>(),
  ]);
  const lines = (lineData ?? []) as FinanceLine[];
  const evs = (events ?? []).filter((e) => academicYear(todayInHongKong(new Date(e.starts_at))) === year);
  const title = new Map(evs.map((e) => [e.id, e.title]));
  const hk = (c: number) => (c / 100).toFixed(2);
  const st = statement(lines);
  const yearEntries = (entries ?? []).filter((e) => (e.event_id ? title.has(e.event_id) : academicYear(e.paid_on) === year));

  const csv = toCsv([
    [`INCOME STATEMENT ${yearLabel(year)}`],
    ["Section", "Category", "Source", "Amount (HK$)"],
    ...st.income.map((g) => ["Income", g.category, g.auto ? "automatic" : "entered", hk(g.cents)]),
    ["Income", "Total income", "", hk(st.totalIncome)],
    ...st.expenses.map((g) => ["Expenses", g.category, g.auto ? "automatic" : "entered", hk(g.cents)]),
    ["Expenses", "Total expenses", "", hk(st.totalExpenses)],
    ["", "Net", "", hk(st.net)],
    ["", "Not counted: unpaid tickets and memberships", "", hk(st.unpaidIncome)],
    ["", "Not counted: claims waiting for review", "", hk(st.pendingClaims)],
    ["", "Approved claims not paid out yet", "", hk(st.owedClaims)],
    [],
    ["BY EVENT"],
    ["Event", "Date", "Income (HK$)", "Expenses (HK$)", "Net (HK$)"],
    ...[...evs.map((e) => ({ id: e.id as string | null, name: e.title, date: e.starts_at.slice(0, 10) })), { id: null, name: "General", date: "" }].map((e) => {
      const s = statement(lines.filter((l) => l.event_id === e.id));
      return [e.name, e.date, hk(s.totalIncome), hk(s.totalExpenses), hk(s.net)];
    }),
    [],
    ["ENTRIES"],
    ["Date", "Type", "Event", "Category", "Description", "From / to", "Amount (HK$)", "Voided", "Void reason"],
    ...yearEntries.map((e) => [e.paid_on, e.kind, e.event_id ? (title.get(e.event_id) ?? "") : "General", e.category, e.description, e.payee ?? "", hk(e.amount_cents), e.voided_at ? "yes" : "", e.void_reason ?? ""]),
  ]);
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sass-accounts-${year}-${todayInHongKong()}.csv"` },
  });
}
