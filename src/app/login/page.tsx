import { redirect } from "next/navigation";
import { getSession, safeNext } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  link: "That login link is invalid or expired. Request a new code below.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getSession()) redirect(next);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-3xl font-display font-normal">Log in or sign up</h1>
      <p className="mb-6 text-sm text-muted">No password needed. We&apos;ll email you a one-time code.</p>
      <div className="card">
        <LoginForm next={next} initialError={sp.error ? ERRORS[sp.error] ?? ERRORS.link : undefined} />
      </div>
    </div>
  );
}
