"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export async function claimTicket(formData: FormData) {
  const eventId = String(formData.get("event_id"));
  const slug = String(formData.get("slug"));
  await requireUser(`/events/${slug}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_ticket", { p_event_id: eventId }).single<{ id: string }>();
  if (error || !data) {
    const msg = error?.code === "P0001" ? error.message : "Something went wrong. Try again.";
    redirect(`/events/${slug}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/tickets/${data.id}`);
}
