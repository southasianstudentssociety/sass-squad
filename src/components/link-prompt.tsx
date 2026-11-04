"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Link2, X } from "lucide-react";
import { linkGoogle, snoozeLinkNudge } from "@/app/account/actions";
import { SubmitButton } from "@/components/submit-button";

export type LinkSuggestion = {
  kind: "google" | "login_email" | "add_google" | "add_ust";
  email: string | null;
};

/**
 * Blue banner under the header so people end up with ONE account for their
 * UST email and Gmail:
 *   google / login_email: the member or team list knows their other email.
 *   add_google: only a UST (or other) email login so far: link Gmail.
 *   add_ust:    only Google so far, no HKUST email: add it (or say they're not at HKUST).
 * X hides it for 14 days; "I'm not at HKUST" / "I don't use Gmail" hides it
 * for good. Both are saved on the account (my_link_nudge / snooze_link_nudge),
 * so it holds on every device. Hidden on Settings, login and onboarding.
 */
export function LinkPrompt({ suggestion }: { suggestion: LinkSuggestion }) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();

  if (hidden || pathname.startsWith("/account") || pathname.startsWith("/onboarding") || pathname.startsWith("/login")) return null;

  const snooze = (forever: boolean) => {
    setHidden(true);
    startTransition(() => { void snoozeLinkNudge(forever); });
  };

  const { kind, email } = suggestion;
  const forever = kind === "add_ust" ? "I'm not at HKUST" : kind === "add_google" ? "I don't use Gmail" : null;

  return (
    <div className="border-b border-sass-blue/15 bg-sass-blue/[0.06] print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm sm:px-5">
        <Link2 className="size-4 shrink-0 text-sass-blue" aria-hidden />
        <p className="min-w-0 flex-1">
          {kind === "google" && <>Do you also log in with <strong className="break-words">{email}</strong>? Link it so both open this one account.</>}
          {kind === "login_email" && <>Make <strong className="break-words">{email}</strong> your login email so your UST email and Google open this one account.</>}
          {kind === "add_google" && <>Use Gmail too? Link your Google account so &ldquo;Continue with Google&rdquo; opens this same account, with the same tickets.</>}
          {kind === "add_ust" && <>At HKUST? Add your UST email so it opens this same account and your membership is recognised.</>}
        </p>
        <div className="ml-8 flex w-full flex-wrap items-center gap-2 sm:ml-0 sm:w-auto">
          {kind === "google" || kind === "add_google" ? (
            <form action={linkGoogle}>
              <SubmitButton className="btn-blue px-3 py-1.5" pendingText="Opening Google…">Link Google</SubmitButton>
            </form>
          ) : (
            <Link href="/account#login" className="btn-blue px-3 py-1.5">{kind === "add_ust" ? "Add UST email" : "Go to Settings"}</Link>
          )}
          {forever && (
            <button type="button" onClick={() => snooze(true)} className="rounded-lg px-2 py-1.5 text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
              {forever}
            </button>
          )}
          <button type="button" onClick={() => snooze(false)} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-ink/5 hover:text-ink sm:ml-0" aria-label="Not now">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
