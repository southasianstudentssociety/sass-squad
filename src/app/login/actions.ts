"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";

export type LoginState = {
  step: "email" | "code";
  email?: string;
  error?: string;
  info?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function siteOrigin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL ?? h.get("origin") ?? `https://${h.get("host")}`;
}

export async function sendCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(formData.get("next"));
  if (!EMAIL_RE.test(email)) return { step: "email", error: "Enter a valid email address." };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    const rateLimited = error.status === 429 || /rate limit/i.test(error.message);
    return {
      step: "email",
      email,
      error: rateLimited
        ? "Too many login emails just now. Wait a minute and try again."
        : "Couldn't send the email. Check the address and try again.",
    };
  }
  return { step: "code", email, info: `We sent a code and a login link to ${email}.` };
}

export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = safeNext(formData.get("next"));
  if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "Enter the code from the email." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "That code is wrong or has expired. Try again or request a new one." };

  redirect(`/onboarding?next=${encodeURIComponent(next)}`);
}
