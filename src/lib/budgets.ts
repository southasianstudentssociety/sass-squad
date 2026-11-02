export type BudgetRow = {
  event_id: string | null;
  title: string;
  starts_at: string | null;
  tickets_confirmed: number;
  ticket_income: number;
  membership_income: number;
  other_income: number;
  unpaid_income: number;
  expenses: number;
  reimbursements: number;
  pending_reimbursements: number;
  net: number;
};

export type Expense = {
  id: string;
  kind: EntryKind;
  event_id: string | null;
  category: string;
  description: string;
  payee: string | null;
  amount_cents: number;
  paid_on: string;
  receipt_path: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

export const EXPENSE_CATEGORIES = ["Venue", "Alcohol", "Food & drink", "Decor", "Equipment", "Printing", "Transport", "Performers", "Prizes", "Students' Union fee", "Bank charges", "Other"];
export const INCOME_CATEGORIES = ["Sponsorship", "Students' Union grant", "Donations", "Merchandise", "Cash at the door", "Other"];

export type EntryKind = "expense" | "income";

/** One statement line from finance_lines(): automatic (tickets, memberships, claims) or entered by Finance (manual). */
export type FinanceLine = {
  event_id: string | null;
  year_start: number;
  kind: EntryKind;
  category: string;
  source: "tickets" | "memberships" | "claims" | "manual";
  amount_cents: number;
  pending_cents: number;
  owed_cents: number;
};

export type StatementGroup = { category: string; auto: boolean; cents: number };
export type Statement = {
  income: StatementGroup[];
  expenses: StatementGroup[];
  totalIncome: number;
  totalExpenses: number;
  net: number;
  /** Not counted yet: unpaid tickets and memberships. */
  unpaidIncome: number;
  /** Not counted yet: claims waiting for review. */
  pendingClaims: number;
  /** Counted, but not paid out yet: approved claims. */
  owedClaims: number;
};

/** Bundle lines into an income statement: one row per category, automatic rows first. */
export function statement(lines: FinanceLine[]): Statement {
  const group = (kind: EntryKind) => {
    const map = new Map<string, StatementGroup>();
    for (const l of lines.filter((x) => x.kind === kind && x.amount_cents !== 0)) {
      const auto = l.source !== "manual";
      const key = `${auto ? 0 : 1}:${l.category}`;
      const g = map.get(key) ?? { category: l.category, auto, cents: 0 };
      g.cents += Number(l.amount_cents);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => Number(b.auto) - Number(a.auto) || b.cents - a.cents);
  };
  const income = group("income");
  const expenses = group("expense");
  const sum = (gs: StatementGroup[]) => gs.reduce((a, g) => a + g.cents, 0);
  const totalIncome = sum(income);
  const totalExpenses = sum(expenses);
  const add = (pick: (l: FinanceLine) => number, kind: EntryKind) => lines.filter((l) => l.kind === kind).reduce((a, l) => a + Number(pick(l)), 0);
  return {
    income,
    expenses,
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    unpaidIncome: add((l) => l.pending_cents, "income"),
    pendingClaims: add((l) => l.pending_cents, "expense"),
    owedClaims: add((l) => l.owed_cents, "expense"),
  };
}

/** Academic year (1 Sep to 31 Aug) that a YYYY-MM-DD date falls in, by its starting year. */
export function academicYear(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return m >= 9 ? y : y - 1;
}

/** 2026 -> "2026/27" */
export function yearLabel(y: number): string {
  return `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
}

/** HK$ with sign, for nets that can be negative. */
export function money(cents: number): string {
  const v = new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD" }).format(Math.abs(cents) / 100);
  return cents < 0 ? `−${v}` : v;
}
