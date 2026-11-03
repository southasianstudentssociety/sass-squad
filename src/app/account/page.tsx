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
  const [{ data: userData }, { data: memberUntil }] = await Promise.all([supabase.auth.getUser(), supabase.rpc("my_membership")]);
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

      <section className="card space-y-4">
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

        {google.length === 0 && (
          <form action={linkGoogle} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-muted">Use Gmail too? Link it, then &ldquo;Continue with Google&rdquo; opens this same account.</p>
            <SubmitButton className="btn-ghost" pendingText="Opening Google…">Link a Google account</SubmitButton>
          </form>
        )}

        <details className="border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-medium">Change the email you get login codes at</summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted">
              For example, switch from your Gmail to your UST email (<strong>@connect.ust.hk</strong>), which is usually the one on the member list.
              We&apos;ll send a code to the new address to confirm it. {google.length > 0 && "Your linked Google account keeps working."}
            </p>
            <EmailChangeForm current={session.email} />
          </div>
        </details>
      </section>
    </div>
  );
}
