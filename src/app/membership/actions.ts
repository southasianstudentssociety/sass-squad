"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dollarsToCents } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
function rpcError(e: { code?: string; message: string } | null, fallback: string) {
  return e?.code === "P0001" ? e.message : fallback;
}
function go(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}
function refresh() {
  revalidatePath("/membership");
  revalidatePath("/admin/memberships");
  revalidatePath("/", "layout");
}

// ---- members ----
export async function applyForMembership(formData: FormData) {
  await requireUser("/membership");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_for_membership", { p_offer_id: str(formData, "offer_id"), p_student_id: str(formData, "student_id") || null });
  if (error) go("/membership", { error: rpcError(error, "Couldn't start your membership. Try again.") });
  refresh();
  const done = (data as { status: string }).status === "confirmed";
  go("/membership", { ok: done ? "You're a member. Member prices now apply." : "Almost there: pay by FPS with the reference below." });
}

export async function cancelMyApplication(formData: FormData) {
  await requireUser("/membership");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_membership_application", { p_app_id: str(formData, "id") });
  if (error) go("/membership", { error: rpcError(error, "Couldn't cancel it.") });
  refresh();
  go("/membership", { ok: "Cancelled." });
}

// ---- ExCo ----
const ADMIN = "/admin/memberships";

export async function saveOffer(formData: FormData) {
  await requireAdmin(ADMIN);
  const id = str(formData, "id");
  const row = {
    name: str(formData, "name"),
    description: str(formData, "description") || null,
    price_cents: dollarsToCents(formData.get("price")),
    valid_until: str(formData, "valid_until"),
    is_open: formData.get("is_open") === "on",
    team_only: formData.get("team_only") === "on",
    payment_instructions: str(formData, "payment_instructions") || null,
    updated_at: new Date().toISOString(),
  };
  if (!row.name || !/^\d{4}-\d{2}-\d{2}$/.test(row.valid_until)) go(ADMIN, { error: "Name and valid-until date are required." });
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("membership_offers").update(row).eq("id", id)
    : await supabase.from("membership_offers").insert(row);
  if (error) go(ADMIN, { error: "Couldn't save the offer. Check the lengths and the price." });
  refresh();
  go(ADMIN, { ok: id ? "Offer saved." : "Offer created." });
}

export async function confirmMembership(formData: FormData) {
  await requireAdmin(ADMIN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_membership_payment", { p_app_id: str(formData, "id") });
  if (error) go(ADMIN, { error: rpcError(error, "Couldn't confirm it.") });
  refresh();
  go(ADMIN, { ok: `${(data as { full_name: string }).full_name} is now a member.` });
}

export async function cancelApplication(formData: FormData) {
  await requireAdmin(ADMIN);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_membership_application", { p_app_id: str(formData, "id") });
  if (error) go(ADMIN, { error: rpcError(error, "Couldn't cancel it.") });
  refresh();
  go(ADMIN, { ok: "Application cancelled." });
}
