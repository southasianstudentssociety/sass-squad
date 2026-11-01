import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { claimableEvents } from "@/lib/claim-data";
import { ClaimForm } from "../claim-form";

export const metadata = { title: "New claim" };

export default async function NewClaimPage() {
  const session = await requireUser("/claims/new");
  if (!session.access.isTeam) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-3xl font-display font-normal">New claim</h1>
        <p className="card text-sm text-muted">Only current team members can submit claims. Ask an ExCo to add you on the Team page.</p>
      </div>
    );
  }
  const events = await claimableEvents();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/claims" className="text-xs text-muted underline">← My claims</Link>
      <h1 className="text-3xl font-display font-normal">New claim</h1>
      <ClaimForm userId={session.userId} events={events} />
    </div>
  );
}
