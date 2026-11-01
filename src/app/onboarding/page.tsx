import { redirect } from "next/navigation";
import { getSession, safeNext } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Your details" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string; edit?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  const editing = sp.edit === "1";
  if (session.profile.onboarded && !editing) redirect(next);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-bold">{editing ? "Your details" : "Welcome to SASS 👋"}</h1>
      <p className="mb-6 text-sm text-muted">
        {session.isMember
          ? "You're on our member list, so member pricing and early access are unlocked."
          : "We couldn't find a membership under this email. You can still get tickets at the non-member price. If you're a member, ask a committee member to add this email to your membership."}
      </p>
      <div className="card">
        <OnboardingForm
          next={next}
          editing={editing}
          email={session.email}
          fullName={session.profile.full_name ?? ""}
          phone={session.profile.phone ?? ""}
        />
      </div>
    </div>
  );
}
