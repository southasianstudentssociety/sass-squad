import { redirect } from "next/navigation";
import { getSession, safeNext } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";
import { Illustration } from "@/components/illustrations";

export const metadata = { title: "Your details" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string; edit?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  const editing = sp.edit === "1";
  if (session.profile.onboarded && !editing) redirect(next);

  return (
    <div className="mx-auto max-w-sm pt-2 sm:pt-6">
      <div className="mb-8 text-center">
        {!editing && <Illustration name="welcome" className="mx-auto mb-6 w-40 animate-scale-in" />}
        <h1 className="font-display text-3xl">{editing ? "Your details" : "Welcome to SASS"}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {session.isMember
            ? "You're on our member list, so member pricing and early access are unlocked."
            : "We couldn't find a membership under this email. You can still get tickets at the non-member price. If you're a member, ask a committee member to add this email to your membership."}
        </p>
        {session.isMember && <span className="badge mt-3 bg-accent text-accent-ink">Member</span>}
      </div>
      <div className="animate-fade-up rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow-lift)]">
        <OnboardingForm
          next={next}
          editing={editing}
          email={session.email}
          fullName={session.profile.full_name ?? session.providerName ?? ""}
          phone={session.profile.phone ?? ""}
        />
      </div>
    </div>
  );
}
