import Link from "next/link";
import { BadgeCheck, KeyRound, Mail } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { DetailsForm, EmailChangeForm } from "./forms";
import { linkGoogle } from "./actions";

export const metadata = { title: "Settings" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await requireUser("/account");
  const supabase = await createClient();
  const [{ data: userData }, { data: memberUntil }, { data: suggestionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("my_membership"),
    supabase.rpc("my_link_nudge", { p_ignore_snooze: true }),
  ]);
  // Settings only spells out the list-based suggestions (with a specific email).
  const nudge = suggestionData as { kind: "google" | "login_email" | "add_google" | "add_ust"; email: string | null } | null;
  const suggestion = nudge && (nudge.kind === "google" || nudge.kind === "login_email") && nudge.email ? { kind: nudge.kind, email: nudge.email } : null;
  const user = userData.user;
  const google = (user?.identities ?? []).filter((i) => i.provider === "google").map((i) => String(i.identity_data?.email ?? "")).filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Settings</h1>
        <p className="text-sm text-muted">Your details, and the emails you can log in with.</p>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />

      <section className={`card flex items-center gap-3 ${session.isMember ? "" : "bg-page"}`}>
        <BadgeCheck className={`size-6 shrink-0 ${session.isMember ? "text-ok" : "text-muted"}`} aria-hidden />
        <p className="text-sm">
          {session.isMember
            ? <>You&apos;re a member{memberUntil && <> until <strong>{formatDate(memberUntil as string)}</strong></>}.</>
            : <>You&apos;re not a member. <Link href="/membership" className="text-brand underline-offset-4 hover:underline">See membership</Link></>}
        </p>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">Your details</h2>
        <DetailsForm
          fullName={session.profile.full_name ?? ""}
          phone={session.profile.phone ?? ""}
          food={session.profile.food_preference ?? ""}
          phoneRequired={session.isMember}
        />
      </section>

      <section id="login" className="card scroll-mt-24 space-y-4">
        <div>
          <h2 className="font-bold">How you log in</h2>
          <p className="text-sm text-muted">Link your UST email and your Gmail to this one account, so either way of logging in opens the same tickets, membership and team access.</p>
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          <li className="flex items-center gap-3 px-3.5 py-3">
            <Mail className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{session.email}</span><span className="text-xs text-muted">Login code by email</span></span>
          </li>
          {google.map((g) => (
            <li key={g} className="flex items-center gap-3 px-3.5 py-3">
              <KeyRound className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{g}</span><span className="text-xs text-muted">Continue with Google</span></span>
            </li>
          ))}
        </ul>

        {suggestion && (
          <p className="rounded-xl border border-sass-blue/20 bg-sass-blue/5 px-3.5 py-2.5 text-sm">
            {suggestion.kind === "google"
              ? <>Our lists say you also use <strong className="break-all">{suggestion.email}</strong>. Link it with the button below (pick that Google account).</>
              : <>Our lists say your UST email is <strong className="break-all">{suggestion.email}</strong>. Make it your login email below, then both your UST email and Google open this account.</>}
          </p>
        )}

        {google.length === 0 && (
          <form action={linkGoogle} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-muted">Use Gmail too? Link it, then &ldquo;Continue with Google&rdquo; opens this same account.</p>
            <SubmitButton className="btn-ghost" pendingText="Opening Google…">Link a Google account</SubmitButton>
          </form>
        )}

        <details className="border-t border-line pt-4" open={suggestion?.kind === "login_email" || nudge?.kind === "add_ust"}>
          <summary className="cursor-pointer text-sm font-medium">Change the email you get login codes at</summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted">
              For example, switch from your Gmail to your UST email (<strong>@connect.ust.hk</strong>), which is usually the one on the member list.
              We&apos;ll send a code to the new address to confirm it. {google.length > 0 && "Your linked Google account keeps working."}
            </p>
            <EmailChangeForm current={session.email} suggested={suggestion?.kind === "login_email" ? suggestion.email : undefined} />
          </div>
        </details>
      </section>
    </div>
  );
}
