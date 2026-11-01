"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import type { CheckInResponse, Ticket, TicketSource } from "@/lib/types";

export type Counts = { confirmed: number; checkedIn: number; awaiting: number };

async function counts(eventId: string): Promise<Counts> {
  const supabase = await createClient();
  const base = () => supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  const [c, i, a] = await Promise.all([
    base().eq("status", "confirmed"),
    base().eq("status", "confirmed").not("checked_in_at", "is", null),
    base().eq("status", "awaiting_payment"),
  ]);
  return { confirmed: c.count ?? 0, checkedIn: i.count ?? 0, awaiting: a.count ?? 0 };
}

export async function getCounts(eventId: string): Promise<Counts> {
  await requireStaff();
  return counts(eventId);
}

export async function checkInAction(
  eventId: string,
  input: { qr?: string; ticketId?: string },
): Promise<{ response?: CheckInResponse; error?: string; counts?: Counts }> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in", {
    p_event_id: eventId,
    p_qr: input.qr ?? null,
    p_ticket_id: input.ticketId ?? null,
  });
  if (error) return { error: error.code === "P0001" ? error.message : "Network or server error. Try again or use the printed list." };
  return { response: data as CheckInResponse, counts: await counts(eventId) };
}

export type SearchRow = Pick<
  Ticket,
  "id" | "holder_name" | "holder_email" | "is_member" | "status" | "checked_in_at" | "payment_reference" | "price_pence" | "source"
>;

export async function searchTickets(eventId: string, q: string): Promise<SearchRow[]> {
  await requireStaff();
  const term = q.trim().replace(/[%,()*]/g, " ").trim();
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets")
    .select("id, holder_name, holder_email, is_member, status, checked_in_at, payment_reference, price_pence, source")
    .eq("event_id", eventId)
    .neq("status", "cancelled")
    .or(`holder_name.ilike.%${term}%,holder_email.ilike.%${term}%,payment_reference.ilike.%${term}%`)
    .order("holder_name")
    .limit(25);
  return (data ?? []) as SearchRow[];
}

export async function createDoorTicketAction(
  eventId: string,
  form: { name: string; email: string; pounds: string; source: TicketSource; checkIn: boolean; notes: string },
): Promise<{ ok?: string; error?: string; counts?: Counts }> {
  await requireStaff();
  const pence = Math.round(Number(form.pounds.replace(/[£,\s]/g, "") || "0") * 100);
  if (!Number.isFinite(pence) || pence < 0) return { error: "Enter a valid amount." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_door_ticket", {
      p_event_id: eventId,
      p_name: form.name,
      p_email: form.email,
      p_price_pence: pence,
      p_source: form.source,
      p_check_in: form.checkIn,
      p_notes: form.notes || null,
    })
    .single<Ticket>();
  if (error || !data) return { error: error?.code === "P0001" ? error.message : "Couldn't create the ticket." };
  return {
    ok: `${data.holder_name} added${form.checkIn ? " and checked in" : ""}${data.is_member ? " (member)" : ""}.`,
    counts: await counts(eventId),
  };
}
