export type BudgetRow = {
  event_id: string | null;
  title: string;
  starts_at: string | null;
  tickets_confirmed: number;
  ticket_income: number;
  unpaid_income: number;
  expenses: number;
  reimbursements: number;
  pending_reimbursements: number;
  net: number;
};

export type Expense = {
  id: string;
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

export const EXPENSE_CATEGORIES = ["Venue", "Alcohol", "Food & drink", "Decor", "Equipment", "Printing", "Transport", "Performers", "Prizes", "Other"];

/** HK$ with sign, for nets that can be negative. */
export function money(cents: number): string {
  const v = new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD" }).format(Math.abs(cents) / 100);
  return cents < 0 ? `−${v}` : v;
}
