"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function submitFeedback(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_feedback", {
    p_event_id: String(formData.get("event_id") ?? ""),
    p_rating: Number(formData.get("rating")),
    p_comment: String(formData.get("comment") ?? "").trim() || null,
    p_anonymous: formData.get("anonymous") === "on",
  });
  if (error) return { error: error.code === "P0001" ? error.message : "Couldn't save that. Try again." };
  revalidatePath("/tickets");
  return { ok: true };
}
