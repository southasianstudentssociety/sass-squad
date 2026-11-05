"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

const meal = (fd: FormData) => String(fd.get("meal_option_id") ?? "").trim() || null;

export async function claimTicket(formData: FormData) {
  const eventId = String(formData.get("event_id"));
  const slug = String(formData.get("slug"));
  await requireUser(`/events/${slug}`);

  const supabase = await createClient();
  // The *_with_meal RPCs check the meal (when the event takes one) and then call
  // claim_ticket / claim_team_ticket unchanged.
  const { data, error } = await supabase.rpc("claim_ticket_with_meal", { p_event_id: eventId, p_meal_option_id: meal(formData) }).single<{ id: string }>();
  if (error || !data) {
    const msg = error?.code === "P0001" ? error.message : "Something went wrong. Try again.";
    redirect(`/events/${slug}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/tickets/${data.id}`);
}

export async function claimTeamTicket(formData: FormData) {
  const eventId = String(formData.get("event_id"));
  const slug = String(formData.get("slug"));
  await requireUser(`/events/${slug}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_team_ticket_with_meal", { p_event_id: eventId, p_meal_option_id: meal(formData) }).single<{ id: string }>();
  if (error || !data) {
    const msg = error?.code === "P0001" ? error.message : "Something went wrong. Try again.";
    redirect(`/events/${slug}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/tickets/${data.id}`);
}

export async function setTicketMeal(formData: FormData) {
  const ticketId = String(formData.get("ticket_id"));
  await requireUser(`/tickets/${ticketId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_ticket_meal", { p_ticket_id: ticketId, p_meal_option_id: meal(formData) });
  const msg = error ? (error.code === "P0001" ? error.message : "Couldn't save your meal. Try again.") : null;
  redirect(`/tickets/${ticketId}?${msg ? `error=${encodeURIComponent(msg)}` : `ok=${encodeURIComponent("Meal saved.")}`}`);
}
