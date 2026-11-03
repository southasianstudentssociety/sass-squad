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

  // Linking a Google account from Settings comes back here too.
  if (url.searchParams.get("via") === "link") {
    const reason = url.searchParams.get("error_description") ?? "";
    const msg = ok
      ? "ok=" + encodeURIComponent("Google account linked. You can now log in with either.")
      : "error=" + encodeURIComponent(
          /already/i.test(reason)
            ? "That Google account already has its own SASS account. Log in with it, or ask a hub owner to merge them."
            : /manual linking/i.test(reason)
              ? "Linking Google accounts isn't switched on yet. Ask a hub owner."
              : "Couldn't link that Google account. Try again.",
        );
    return NextResponse.redirect(new URL(`/account?${msg}`, url.origin));
  }

  // First Google login with a Gmail the member/team lists pair with an existing
  // account: the new empty account is removed (so Google can be linked to the
  // real one) and they're asked to log in with their existing email instead.
  if (ok && url.searchParams.get("via") === "google") {
    const { data: existing } = await supabase.rpc("discard_new_duplicate_login");
    if (typeof existing === "string" && existing) {
      await supabase.auth.signOut().catch(() => undefined);
      return NextResponse.redirect(new URL(`/login?dup=${encodeURIComponent(existing)}&next=${encodeURIComponent(next)}`, url.origin));
    }
  }

  // OAuth providers (Google) come back with ?code=, or ?error= if the user cancelled.
  const failReason = url.searchParams.get("via") === "google" ? "google" : "link";
  const dest = ok ? `/onboarding?next=${encodeURIComponent(next)}` : `/login?error=${failReason}&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(dest, url.origin));
}
