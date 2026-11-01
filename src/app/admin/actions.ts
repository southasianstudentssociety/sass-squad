"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { londonLocalToIso, poundsToPence, slugify } from "@/lib/format";
import { parseCsv, parseUkDate } from "@/lib/csv";

function back(path: string, params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`${path}${path.includes("?") ? "&" : "?"}${qs}`);
}

function rpcError(e: { code?: string; message: string } | null, fallback: string) {
  return e?.code === "P0001" ? e.message : fallback;
}

// ---------------------------------------------------------------- events
export async function saveEvent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const slug = slugify(String(formData.get("slug") ?? "") || title);
  const startsAt = londonLocalToIso(String(formData.get("starts_at") ?? ""));
  const returnTo = id ? `/admin/events/${id}/edit` : "/admin/events/new";

  if (!title) back(returnTo, { error: "Title is required." });
  if (!slug) back(returnTo, { error: "Slug is required." });
  if (!startsAt) back(returnTo, { error: "Start time is required." });

  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const row = {
    title,
    slug,
    description: String(formData.get("description") ?? "").trim() || null,
    venue: String(formData.get("venue") ?? "").trim() || null,
    starts_at: startsAt,
    ends_at: londonLocalToIso(String(formData.get("ends_at") ?? "")),
    cover_image_url: String(formData.get("cover_image_url") ?? "").trim() || null,
    is_published: formData.get("is_published") === "on",
    access: formData.get("access") === "members_only" ? "members_only" : "everyone",
    member_price_pence: poundsToPence(formData.get("member_price")),
    public_price_pence: poundsToPence(formData.get("public_price")),
    capacity: capacityRaw ? Math.max(1, parseInt(capacityRaw, 10) || 1) : null,
    member_sales_open_at: londonLocalToIso(String(formData.get("member_sales_open_at") ?? "")),
    public_sales_open_at: londonLocalToIso(String(formData.get("public_sales_open_at") ?? "")),
    sales_close_at: londonLocalToIso(String(formData.get("sales_close_at") ?? "")),
    payment_instructions: String(formData.get("payment_instructions") ?? "").trim() || null,
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("events").update(row).eq("id", id).select("id").single()
    : await supabase.from("events").insert(row).select("id").single();

  if (error || !data) {
    back(returnTo, { error: error?.code === "23505" ? "That slug is already used by another event." : "Couldn't save the event." });
  }
  revalidatePath("/", "layout");
  redirect(`/admin/events/${data.id}?ok=${encodeURIComponent("Event saved.")}`);
}

export async function deleteEvent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", id);
  if ((count ?? 0) > 0) back(`/admin/events/${id}/edit`, { error: "This event has tickets. Unpublish it instead of deleting." });
  await supabase.from("events").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/admin");
}

// ---------------------------------------------------------------- tickets
async function ticketRpc(fn: "confirm_payment" | "cancel_ticket" | "undo_check_in", formData: FormData, ok: string) {
  await requireAdmin();
  const ticketId = String(formData.get("ticket_id"));
  const eventId = String(formData.get("event_id"));
  const filter = String(formData.get("filter") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_ticket_id: ticketId });
  revalidatePath(`/admin/events/${eventId}`);
  const base = `/admin/events/${eventId}${filter ? `?filter=${filter}` : ""}`;
  if (error) back(base, { error: rpcError(error, "Action failed.") });
  back(base, { ok });
}

export async function confirmPayment(formData: FormData) {
  return ticketRpc("confirm_payment", formData, "Payment confirmed. Their QR code is now live.");
}
export async function cancelTicket(formData: FormData) {
  return ticketRpc("cancel_ticket", formData, "Ticket cancelled.");
}
export async function undoCheckIn(formData: FormData) {
  return ticketRpc("undo_check_in", formData, "Check-in undone.");
}

// ---------------------------------------------------------------- members
export async function saveMember(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const validUntil = parseUkDate(String(formData.get("valid_until") ?? ""));
  const row = {
    full_name: String(formData.get("full_name") ?? "").trim(),
    email,
    alt_email: String(formData.get("alt_email") ?? "").trim().toLowerCase() || null,
    student_id: String(formData.get("student_id") ?? "").trim() || null,
    purchased_at: parseUkDate(String(formData.get("purchased_at") ?? "")),
    valid_until: validUntil,
    notes: String(formData.get("notes") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (!row.full_name || !email || !validUntil) back("/admin/members", { error: "Name, email and valid-until date are required." });

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("members").update(row).eq("id", id)
    : await supabase.from("members").insert(row);
  if (error) back("/admin/members", { error: error.code === "23505" ? "That email is already on another membership." : "Couldn't save member." });
  revalidatePath("/admin/members");
  back("/admin/members", { ok: `${row.full_name} saved.` });
}

export async function deleteMember(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("members").delete().eq("id", String(formData.get("id")));
  revalidatePath("/admin/members");
  back("/admin/members", { ok: "Member removed." });
}

const HEADER_ALIASES: Record<string, string[]> = {
  full_name: ["name", "full name", "full_name", "member name"],
  email: ["email", "email address", "e-mail", "uni email", "university email"],
  alt_email: ["alt email", "alt_email", "personal email", "gmail", "secondary email", "other email"],
  student_id: ["student id", "student_id", "student number", "id"],
  purchased_at: ["purchased", "purchased_at", "date purchased", "purchase date", "bought", "date bought", "timestamp", "date"],
  valid_until: ["valid until", "valid_until", "expiry", "expires", "expiry date", "valid to", "end date"],
};

export async function importMembers(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  const defaultValid = parseUkDate(String(formData.get("default_valid_until") ?? ""));
  const text = file instanceof File && file.size > 0 ? await file.text() : String(formData.get("csv") ?? "");
  const rows = parseCsv(text);
  if (rows.length < 2) back("/admin/members", { error: "No rows found. Export the Google Sheet as CSV (File → Download → .csv) and upload it." });

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (key: string) => header.findIndex((h) => HEADER_ALIASES[key].includes(h));
  const idx = Object.fromEntries(Object.keys(HEADER_ALIASES).map((k) => [k, col(k)])) as Record<string, number>;
  if (idx.email < 0 || idx.full_name < 0) {
    back("/admin/members", { error: `Couldn't find "Name" and "Email" columns. Found: ${rows[0].join(", ")}` });
  }

  const skipped: string[] = [];
  const byEmail = new Map<string, Record<string, string | null>>();
  for (const [n, r] of rows.slice(1).entries()) {
    const get = (k: string) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
    const email = get("email").toLowerCase();
    const validUntil = parseUkDate(get("valid_until")) ?? defaultValid;
    if (!email || !email.includes("@")) { skipped.push(`row ${n + 2}: no email`); continue; }
    if (!validUntil) { skipped.push(`row ${n + 2}: no valid-until date`); continue; }
    byEmail.set(email, {
      full_name: get("full_name") || email,
      email,
      alt_email: get("alt_email").toLowerCase() || null,
      student_id: get("student_id") || null,
      purchased_at: parseUkDate(get("purchased_at")),
      valid_until: validUntil,
      updated_at: new Date().toISOString(),
    });
  }

  const records = [...byEmail.values()];
  if (records.length === 0) back("/admin/members", { error: `Nothing imported. ${skipped.slice(0, 5).join("; ")}` });

  const supabase = await createClient();
  const { error } = await supabase.from("members").upsert(records, { onConflict: "email" });
  if (error) back("/admin/members", { error: `Import failed: ${error.message}` });
  revalidatePath("/admin/members");
  back("/admin/members", {
    ok: `Imported ${records.length} members.${skipped.length ? ` Skipped ${skipped.length}: ${skipped.slice(0, 5).join("; ")}${skipped.length > 5 ? "…" : ""}` : ""}`,
  });
}

// ---------------------------------------------------------------- staff
export async function setRole(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role"));
  if (!["user", "staff", "admin"].includes(role)) back("/admin/staff", { error: "Invalid role." });
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_role", { p_email: email, p_role: role });
  if (error) back("/admin/staff", { error: rpcError(error, "Couldn't update role.") });
  revalidatePath("/admin/staff");
  back("/admin/staff", { ok: `${email} is now ${role}.` });
}
