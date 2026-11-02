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

/** Where to go after saving: a page under /finance/budgets, without old messages. */
function backPath(f: FormData): string {
  const raw = str(f, "back");
  const path = raw.startsWith("/finance/budgets") && !raw.startsWith("//") ? raw : "/finance/budgets";
  const url = new URL(path, "http://x");
  url.searchParams.delete("ok");
  url.searchParams.delete("error");
  return `${url.pathname}${url.search}`;
}
function withMessage(path: string, key: "ok" | "error", msg: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;
}

export type EntryResult = { error: string } | { to: string };

// Called from the client form after an optional receipt upload.
export async function addEntry(formData: FormData): Promise<EntryResult> {
  const back = backPath(formData);
  await requireFinance(back);
  const kind = str(formData, "kind") === "income" ? "income" : "expense";
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_finance_entry", {
    p_kind: kind,
    p_event_id: str(formData, "event_id") || null,
    p_category: str(formData, "category"),
    p_description: str(formData, "description"),
    p_amount_cents: dollarsToCents(formData.get("amount")),
    p_entry_date: DATE_RE.test(str(formData, "entry_date")) ? str(formData, "entry_date") : null,
    p_party: str(formData, "party") || null,
    p_receipt_path: str(formData, "receipt_path") || null,
  });
  if (error) return { error: rpcError(error, `Couldn't save the ${kind}.`) };
  revalidatePath("/finance/budgets", "layout");
  // The form navigates itself, so it can close its pop-up first.
  return { to: withMessage(back, "ok", kind === "income" ? "Income added." : "Expense added.") };
}

export async function voidExpense(formData: FormData) {
  const back = backPath(formData);
  await requireFinance(back);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_expense", { p_id: str(formData, "id"), p_reason: str(formData, "reason") });
  revalidatePath("/finance/budgets", "layout");
  redirect(error ? withMessage(back, "error", rpcError(error, "Couldn't void it.")) : withMessage(back, "ok", "Entry voided. It stays in the record."));
}

export async function setOpeningBalance(formData: FormData) {
  const back = backPath(formData);
  await requireFinance(back);
  const year = parseInt(str(formData, "year"), 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_opening_balance", {
    p_year_start: Number.isFinite(year) ? year : null,
    p_opening_cents: str(formData, "opening") === "" ? null : dollarsToCents(formData.get("opening")),
    p_note: str(formData, "note") || null,
  });
  revalidatePath("/finance/budgets", "layout");
  redirect(error ? withMessage(back, "error", rpcError(error, "Couldn't save the balance.")) : withMessage(back, "ok", "Opening balance saved."));
}
