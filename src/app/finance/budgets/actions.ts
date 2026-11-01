"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dollarsToCents } from "@/lib/format";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
function rpcError(e: { code?: string; message: string } | null, fallback: string) {
  return e?.code === "P0001" ? e.message : fallback;
}

export type ExpenseResult = { error: string } | undefined;

// Called from the client form after an optional receipt upload.
export async function addExpense(formData: FormData): Promise<ExpenseResult> {
  const back = str(formData, "back") || "general";
  await requireFinance(`/finance/budgets/${back}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_expense", {
    p_event_id: back === "general" ? null : back,
    p_category: str(formData, "category"),
    p_description: str(formData, "description"),
    p_amount_cents: dollarsToCents(formData.get("amount")),
    p_paid_on: DATE_RE.test(str(formData, "paid_on")) ? str(formData, "paid_on") : null,
    p_payee: str(formData, "payee") || null,
    p_receipt_path: str(formData, "receipt_path") || null,
  });
  if (error) return { error: rpcError(error, "Couldn't save the expense.") };
  revalidatePath("/finance/budgets");
  redirect(`/finance/budgets/${back}?ok=${encodeURIComponent("Expense added.")}`);
}

export async function voidExpense(formData: FormData) {
  const back = str(formData, "back") || "general";
  await requireFinance(`/finance/budgets/${back}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_expense", { p_id: str(formData, "id"), p_reason: str(formData, "reason") });
  const qs = error ? `error=${encodeURIComponent(rpcError(error, "Couldn't void it."))}` : `ok=${encodeURIComponent("Expense voided. It stays in the record.")}`;
  revalidatePath("/finance/budgets");
  redirect(`/finance/budgets/${back}?${qs}`);
}
