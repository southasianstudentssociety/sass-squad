"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireTeam } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const CONDITIONS = ["new", "good", "worn", "damaged"];

function back(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}
function rpcError(e: { code?: string; message: string } | null, fallback: string) {
  return e?.code === "P0001" ? e.message : fallback;
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optional = (f: FormData, k: string) => str(f, k) || null;
const int = (f: FormData, k: string) => {
  const n = parseInt(str(f, k), 10);
  return Number.isFinite(n) ? n : null;
};
const condition = (f: FormData, k = "condition") => (CONDITIONS.includes(str(f, k)) ? str(f, k) : null);

function refresh(id?: string) {
  revalidatePath("/inventory");
  if (id) revalidatePath(`/inventory/${id}`);
}

export async function createItem(formData: FormData) {
  await requireAdmin("/inventory");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_inventory_item", {
    p_name: str(formData, "name"),
    p_category: optional(formData, "category"),
    p_location: optional(formData, "location"),
    p_condition: condition(formData) ?? "good",
    p_quantity: int(formData, "quantity") ?? 1,
    p_notes: optional(formData, "notes"),
  });
  if (error || !data) back("/inventory", { error: rpcError(error, "Couldn't add the item.") });
  refresh();
  back(`/inventory/${(data as { id: string }).id}`, { ok: "Item added." });
}

export async function updateItem(formData: FormData) {
  const id = str(formData, "item_id");
  await requireAdmin(`/inventory/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_inventory_item", {
    p_item_id: id,
    p_name: str(formData, "name"),
    p_category: optional(formData, "category"),
    p_location: optional(formData, "location"),
    p_condition: condition(formData),
    p_notes: optional(formData, "notes"),
  });
  if (error) back(`/inventory/${id}`, { error: rpcError(error, "Couldn't save the item.") });
  refresh(id);
  back(`/inventory/${id}`, { ok: "Saved." });
}

export async function adjustItem(formData: FormData) {
  const id = str(formData, "item_id");
  await requireAdmin(`/inventory/${id}`);
  const amount = int(formData, "amount") ?? 0;
  const delta = str(formData, "direction") === "remove" ? -Math.abs(amount) : Math.abs(amount);
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_inventory", { p_item_id: id, p_delta: delta, p_reason: str(formData, "reason") });
  if (error) back(`/inventory/${id}`, { error: rpcError(error, "Couldn't change the count.") });
  refresh(id);
  back(`/inventory/${id}`, { ok: `Count ${delta > 0 ? "increased" : "reduced"} by ${Math.abs(delta)}.` });
}

export async function retireItem(formData: FormData) {
  const id = str(formData, "item_id");
  await requireAdmin(`/inventory/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_inventory_item", { p_item_id: id, p_reason: str(formData, "reason") });
  if (error) back(`/inventory/${id}`, { error: rpcError(error, "Couldn't retire the item.") });
  refresh(id);
  back(`/inventory/${id}`, { ok: "Item retired. It stays in the history." });
}

export async function checkOut(formData: FormData) {
  const id = str(formData, "item_id");
  await requireTeam(`/inventory/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("check_out_item", {
    p_item_id: id,
    p_borrower_id: str(formData, "borrower_id"),
    p_quantity: int(formData, "quantity"),
    p_event_id: optional(formData, "event_id"),
    p_due_on: optional(formData, "due_on"),
    p_note: optional(formData, "note"),
  });
  if (error) back(`/inventory/${id}`, { error: rpcError(error, "Couldn't check it out.") });
  refresh(id);
  back(`/inventory/${id}`, { ok: "Checked out." });
}

export async function returnLoan(formData: FormData) {
  const id = str(formData, "item_id");
  await requireTeam(`/inventory/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("return_item", {
    p_loan_id: str(formData, "loan_id"),
    p_returned_quantity: int(formData, "returned_quantity"),
    p_condition: condition(formData),
    p_note: optional(formData, "note"),
  });
  if (error) back(`/inventory/${id}`, { error: rpcError(error, "Couldn't record the return.") });
  refresh(id);
  back(`/inventory/${id}`, { ok: "Return recorded." });
}
