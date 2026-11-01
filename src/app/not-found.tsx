import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <p className="font-display text-6xl text-brand">404</p>
      <h1 className="mt-2 text-xl font-bold">This page doesn&apos;t exist</h1>
      <p className="mt-2 text-sm text-muted">
        If you got here from a login email, go back and type the code from the email instead.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/login" className="btn-primary">Log in</Link>
        <Link href="/events" className="btn-ghost">Events</Link>
      </div>
    </div>
  );
}
