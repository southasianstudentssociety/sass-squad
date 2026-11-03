"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { FOOD_PREFERENCES, normalizePhone } from "@/lib/profile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function siteOrigin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL ?? h.get("origin") ?? `https://${h.get("host")}`;
}

export type DetailsState = { error?: string; ok?: string };

export async function saveDetails(_prev: DetailsState, formData: FormData): Promise<DetailsState> {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const fullName = String(formData.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const food = String(formData.get("food_preference") ?? "");
  if (fullName.length < 2 || fullName.length > 80) return { error: "Enter your full name (as it appears on your student ID)." };
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { error: "Enter your WhatsApp number with the country code, e.g. +852 12345678." };
  if (!phone && session.isMember) return { error: "Members need a WhatsApp number so we can add you to the members' group chat." };
  const foodPreference = FOOD_PREFERENCES.some((f) => f.value === food) ? food : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone, food_preference: foodPreference, onboarded: true })
    .eq("id", session.userId);
  if (error) return { error: "Couldn't save your details. Try again." };
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

/** Used by the members' phone pop-up: saves just the WhatsApp number. */
export async function savePhone(_prev: DetailsState, formData: FormData): Promise<DetailsState> {
  const session = await getSession();
  if (!session) return { error: "Log in first." };
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Enter your WhatsApp number with the country code, e.g. +852 12345678." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ phone }).eq("id", session.userId);
  if (error) return { error: "Couldn't save it. Try again." };
  revalidatePath("/", "layout");
  return { ok: "Thanks! We'll add you to the members' group chat." };
}

/** Link a Google account (e.g. a Gmail) to this account, so either way of logging in opens it. */
export async function linkGoogle() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const supabase = await createClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/confirm?via=link&next=/account`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data?.url) {
    const msg = /manual linking/i.test(error?.message ?? "")
      ? "Linking Google accounts isn't switched on yet. Ask a hub owner."
      : "Couldn't start linking. Try again.";
    redirect(`/account?error=${encodeURIComponent(msg)}`);
  }
  redirect(data.url);
}

/** step "code": waiting for the code sent to `codeFor` (first the new address, then, if Supabase also asks, the current one). */
export type EmailChangeState = { step: "email" | "code"; email?: string; current?: string; codeFor?: string; error?: string; info?: string };

/** Change the email you log in with by code (e.g. from your Gmail to your UST email). Sends a code to the new address. */
export async function startEmailChange(_prev: EmailChangeState, formData: FormData): Promise<EmailChangeState> {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { step: "email", error: "Enter a valid email address." };
  if (email === session.email.toLowerCase()) return { step: "email", error: "That's already your login email." };
  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${origin}/auth/confirm?next=/account` });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return {
      step: "email",
      email,
      error: taken
        ? "That email already has its own account. Log in with it and link your other email from there, or ask a hub owner to help."
        : /rate limit/i.test(error.message)
          ? "Too many emails just now. Wait a minute and try again."
          : "Couldn't send the code. Check the address and try again.",
    };
  }
  return { step: "code", email, current: session.email, codeFor: email, info: `We sent a 6-digit code to ${email}. Check your inbox and junk folder.` };
}

export async function verifyEmailChange(_prev: EmailChangeState, formData: FormData): Promise<EmailChangeState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase(); // the new address
  const current = String(formData.get("current") ?? "").trim().toLowerCase();
  const codeFor = String(formData.get("code_for") ?? email).trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  const keep = { step: "code" as const, email, current, codeFor };
  if (!/^\d{6,10}$/.test(token)) return { ...keep, error: "Enter the 6-digit code from the email." };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: codeFor, token, type: "email_change" });
  if (error) return { ...keep, error: `That code is wrong or has expired. Use the latest code sent to ${codeFor}, or start over.` };
  const { data } = await supabase.auth.getUser();
  revalidatePath("/", "layout");
  if (data.user?.email?.toLowerCase() === email) {
    redirect(`/account?ok=${encodeURIComponent(`Done. You now log in with ${email}.`)}`);
  }
  // Supabase also wants the code it sent to the other address (secure email change).
  const other = codeFor === email ? current : email;
  return {
    step: "code", email, current, codeFor: other,
    info: `${codeFor} confirmed. One more: enter the code we sent to ${other} (check junk too).`,
  };
}
