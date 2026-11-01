import { redirect } from "next/navigation";
import { getSession, safeNext } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { GoogleButton } from "./google-button";
import { Illustration } from "@/components/illustrations";

export const metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  link: "That login link is invalid or expired. Request a new code below.",
  google: "Google sign-in didn't work. Try again, or use your email below.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getSession()) redirect(next);

  return (
    <div className="mx-auto max-w-sm pt-2 sm:pt-8">
      <div className="mb-8 text-center">
        <p className="font-brand text-4xl text-brand">SASS</p>
        <h1 className="mt-4 font-display text-3xl">Log in or sign up</h1>
        <p className="mt-2 text-sm text-muted">No password needed. Use Google, or we&apos;ll email you a code.</p>
      </div>
      <div className="animate-fade-up space-y-5 rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow-lift)]">
        <GoogleButton next={next} />
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" /> or any email, incl. HKUST <span className="h-px flex-1 bg-line" />
        </div>
        <LoginForm
          next={next}
          initialError={sp.error ? ERRORS[sp.error] ?? ERRORS.link : undefined}
          codeArt={<Illustration name="mailSent" className="mx-auto w-28" />}
        />
      </div>
      <p className="mt-6 text-center text-xs text-muted">Use the email your membership is under so we recognise you as a member.</p>
    </div>
  );
}
