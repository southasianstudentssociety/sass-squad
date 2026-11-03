"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, safeNext } from "@/lib/auth";
import { normalizePhone } from "@/lib/profile";

export type OnboardingState = { error?: string };

export async function saveProfile(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const fullName = String(formData.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const phone = String(formData.get("phone") ?? "").trim();
  const next = safeNext(formData.get("next"));

  if (fullName.length < 2 || fullName.length > 80) return { error: "Enter your full name (as it appears on your student ID)." };
  const normalized = phone ? normalizePhone(phone) : null;
  if (phone && !normalized) return { error: "Enter your WhatsApp number with the country code, e.g. +852 12345678." };
  if (!normalized && session.isMember) return { error: "Members need a WhatsApp number so we can add you to the members' group chat (e.g. +852 12345678)." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: normalized, onboarded: true })
    .eq("id", session.userId);
  if (error) return { error: "Couldn't save your details. Try again." };

  redirect(next);
}
