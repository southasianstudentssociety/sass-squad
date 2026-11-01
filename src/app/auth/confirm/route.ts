import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";

// Handles email login links and the Google sign-in callback. Supports the token_hash template
// (works across devices) and the default PKCE ?code= link (same browser only).
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  // OAuth providers (Google) come back with ?code=, or ?error= if the user cancelled.
  const failReason = url.searchParams.get("via") === "google" ? "google" : "link";
  const dest = ok ? `/onboarding?next=${encodeURIComponent(next)}` : `/login?error=${failReason}&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(dest, url.origin));
}
