"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Link2, X } from "lucide-react";
import { linkGoogle } from "@/app/account/actions";
import { SubmitButton } from "@/components/submit-button";

export type LinkSuggestion = { kind: "google" | "login_email"; email: string };

const KEY = "sass-link-prompt-dismissed";
const QUIET_DAYS = 7;

/**
 * Banner under the header for people the member/team lists say have another
 * email that isn't on their account yet. One tap links Google (Gmail), or
 * takes them to Settings to switch their login email to UST. "Not now" hides
 * it for a week. Hidden on Settings, which shows the same suggestion itself.
 */
export function LinkPrompt({ suggestion }: { suggestion: LinkSuggestion }) {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let until = 0;
    try { until = Number(localStorage.getItem(KEY) ?? 0); } catch { /* storage blocked: show it */ }
    if (until > Date.now()) return;
    const t = setTimeout(() => setShow(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!show || pathname.startsWith("/account") || pathname.startsWith("/onboarding") || pathname.startsWith("/login")) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, String(Date.now() + QUIET_DAYS * 86_400_000)); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div className="border-b border-sass-blue/15 bg-sass-blue/[0.06] print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm sm:px-5">
        <Link2 className="size-4 shrink-0 text-sass-blue" aria-hidden />
        <p className="min-w-0 flex-1">
          {suggestion.kind === "google" ? (
            <>Do you also log in with <strong className="break-words">{suggestion.email}</strong>? Link it so both open this one account.</>
          ) : (
            <>Make <strong className="break-words">{suggestion.email}</strong> your login email so your UST email and Google open this one account.</>
          )}
        </p>
        <div className="ml-8 flex w-full items-center gap-2 sm:ml-0 sm:w-auto">
          {suggestion.kind === "google" ? (
            <form action={linkGoogle}>
              <SubmitButton className="btn-blue px-3 py-1.5" pendingText="Opening Google…">Link Google</SubmitButton>
            </form>
          ) : (
            <Link href="/account#login" className="btn-blue px-3 py-1.5">Go to Settings</Link>
          )}
          <button type="button" onClick={dismiss} className="rounded-lg p-1.5 text-muted hover:bg-ink/5 hover:text-ink" aria-label="Not now">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
