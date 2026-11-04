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
  /** The email is someone's linked Google login: no code was sent, use Google instead. */
  useGoogle?: boolean;
};

export type DuplicateLogin = { existing: string; use_google: boolean };

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
  // A Gmail that's already an account's "Continue with Google" login would get a
  // brand-new second account from a code (Supabase only matches main emails).
  const { data: hint } = await supabase.rpc("login_email_hint", { p_email: email });
  if (hint === "google") {
    return {
      step: "email",
      email,
      useGoogle: true,
      error: "This Gmail is already linked to a SASS account. Tap “Continue with Google” above to log in. No code needed.",
    };
  }

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
  return { step: "code", email, info: `We sent a login code to ${email}.` };
}

export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = safeNext(formData.get("next"));
  if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "Enter the code from the email." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "That code is wrong or has expired. Try again or request a new one." };

  // A brand-new empty account that duplicates an existing one (linked Gmail, or
  // the member/team lists pair the emails) is removed: see the RPC.
  const { data: dup } = await supabase.rpc("discard_duplicate_login");
  const existing = (dup as DuplicateLogin | null)?.existing;
  if (existing) {
    await supabase.auth.signOut().catch(() => undefined);
    redirect(`/login?dup=${encodeURIComponent(existing)}${(dup as DuplicateLogin).use_google ? "&g=1" : ""}&next=${encodeURIComponent(next)}`);
  }

  redirect(`/onboarding?next=${encodeURIComponent(next)}`);
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/confirm?via=google&next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect(`/login?error=google&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}
