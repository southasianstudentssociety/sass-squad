import Link from "next/link";
import { Illustration } from "@/components/illustrations";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-sm py-10 text-center">
      <Illustration name="notFound" className="mx-auto mb-8 w-56 animate-scale-in" />
      <h1 className="font-display text-3xl">This page doesn&apos;t exist</h1>
      <p className="mt-3 text-sm text-muted">If you got here from a login email, go back and type the code from the email instead.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/events" className="btn-primary">See events</Link>
        <Link href="/login" className="btn-ghost">Log in</Link>
      </div>
    </div>
  );
}
