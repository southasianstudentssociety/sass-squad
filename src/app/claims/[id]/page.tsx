import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { claimableEvents } from "@/lib/claim-data";
import { formatDateTime, formatPrice } from "@/lib/format";
import { CLAIM_STATUS, PAYOUT_METHODS } from "@/lib/claims";
import type { Claim, ClaimEvent, ClaimRevision } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { ClaimForm } from "../claim-form";
import { markClaimPaid, reviewClaim, withdrawClaim } from "../actions";

export const metadata = { title: "Claim" };

const VIEWABLE_IMAGE = /\.(jpe?g|png|webp)$/i;

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireUser(`/claims/${id}`);
  const supabase = await createClient();

  const { data: claim } = await supabase.from("claims").select("*").eq("id", id).maybeSingle<Claim>();
  if (!claim) notFound();

  const [{ data: revs }, { data: history }] = await Promise.all([
    supabase.from("claim_revisions").select("*").eq("claim_id", id).order("revision", { ascending: false }).returns<ClaimRevision[]>(),
    supabase.from("claim_events").select("*").eq("claim_id", id).order("created_at").returns<ClaimEvent[]>(),
  ]);
  const revisions = revs ?? [];
  const current = revisions.find((r) => r.revision === claim.current_revision);
  if (!current) notFound();

  // Names: Finance (ExCo) can read profiles; a claimant only sees their own, so others show as "Finance".
  const peopleIds = [...new Set([claim.claimant_id, ...(history ?? []).map((h) => h.actor_id).filter(Boolean)])] as string[];
  const [{ data: people }, { data: event }, signed] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").in("id", peopleIds).returns<{ id: string; full_name: string | null; email: string }[]>(),
    current.event_id
      ? supabase.from("events").select("title").eq("id", current.event_id).maybeSingle<{ title: string }>()
      : Promise.resolve({ data: null }),
    supabase.storage.from("receipts").createSignedUrls([...new Set(revisions.map((r) => r.receipt_path))], 600),
  ]);
  const nameOf = (uid: string | null) => {
    const p = (people ?? []).find((x) => x.id === uid);
    return p ? (p.full_name ?? p.email) : "Finance";
  };
  const urlOf = (path: string) => (signed.data ?? []).find((s) => s.path === path)?.signedUrl ?? null;

  const mine = claim.claimant_id === session.userId;
  const finance = session.access.isFinance;
  const canChange = mine && (claim.status === "submitted" || claim.status === "rejected");
  // The Finance ExCo (VP of Finance) may act on their own claim; it's recorded as self-approved.
  const selfOk = mine && session.access.isFinanceExco;
  const canReview = finance && (!mine || selfOk) && claim.status === "submitted";
  const canPay = finance && (!mine || selfOk) && claim.status === "approved";
  const st = CLAIM_STATUS[claim.status];
  const receiptUrl = urlOf(current.receipt_path);
  const lastRejection = [...(history ?? [])].reverse().find((h) => h.to_status === "rejected");

  if (sp.edit === "1" && canChange) {
    const events = await claimableEvents();
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Link href={`/claims/${id}`} className="text-xs text-muted underline">← Back to {claim.reference}</Link>
        <h1 className="text-3xl font-display font-normal">Change {claim.reference}</h1>
        <p className="text-sm text-muted">This saves a new version. Finance can still see the old one.</p>
        <ClaimForm
          userId={session.userId}
          events={events}
          defaults={{
            claimId: claim.id,
            eventId: current.event_id,
            amount: (current.amount_cents / 100).toFixed(2),
            description: current.description,
            payoutMethod: current.payout_method,
            payoutDetails: current.payout_details ?? "",
            receiptPath: current.receipt_path,
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={finance && !mine ? "/finance" : "/claims"} className="text-xs text-muted underline">
        ← {finance && !mine ? "Finance" : "My claims"}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-normal">{formatPrice(current.amount_cents)}</h1>
          <p className="text-sm text-muted">
            {claim.reference} · by {nameOf(claim.claimant_id)}{claim.current_revision > 1 && ` · version ${claim.current_revision}`}
          </p>
        </div>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />

      {claim.status === "rejected" && lastRejection?.note && (
        <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">
          <strong>Finance rejected this:</strong> {lastRejection.note}
        </p>
      )}

      <div className="card grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="label">Description</p>
          <p className="whitespace-pre-wrap">{current.description}</p>
        </div>
        <div>
          <p className="label">Event</p>
          <p>{event?.title ?? "Not for a specific event"}</p>
        </div>
        <div>
          <p className="label">Pay by</p>
          <p>{PAYOUT_METHODS[current.payout_method].label}{current.payout_details && `: ${current.payout_details}`}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="label">Receipt</p>
          {receiptUrl ? (
            <div className="space-y-2">
              {VIEWABLE_IMAGE.test(current.receipt_path) && (
                // Short-lived signed URL from a private bucket, so next/image optimisation doesn't apply.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receiptUrl} alt={`Receipt for ${claim.reference}`} className="max-h-[28rem] rounded-lg border border-line" />
              )}
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-sm underline">Open full size</a>
            </div>
          ) : (
            <p className="text-sm text-muted">Couldn&apos;t load the receipt.</p>
          )}
        </div>
      </div>

      {canChange && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/claims/${id}?edit=1`} className="btn-primary">{claim.status === "rejected" ? "Fix and resubmit" : "Change claim"}</Link>
          <form action={withdrawClaim}>
            <input type="hidden" name="claim_id" value={id} />
            <SubmitButton className="btn-danger" pendingText="Withdrawing…">Withdraw</SubmitButton>
          </form>
        </div>
      )}

      {finance && mine && !selfOk && (claim.status === "submitted" || claim.status === "approved") && (
        <p className="card text-sm text-muted">This is your own claim, so the Finance ExCo or another owner has to review and pay it.</p>
      )}
      {selfOk && (claim.status === "submitted" || claim.status === "approved") && (
        <p className="rounded-xl border border-warn/25 bg-warn/[0.06] px-3.5 py-2.5 text-sm text-warn">
          This is your own claim. You can approve and pay it as the Finance ExCo, but it&apos;s recorded as <strong>self-approved</strong> and
          shown to the hub owners and in the treasurer&apos;s export.
        </p>
      )}

      {canReview && (
        <div className="card space-y-4">
          <h2 className="font-bold">Review</h2>
          <form action={reviewClaim}>
            <input type="hidden" name="claim_id" value={id} />
            <input type="hidden" name="revision" value={claim.current_revision} />
            <input type="hidden" name="decision" value="approve" />
            <SubmitButton className="btn-primary" pendingText="Approving…">Approve {formatPrice(current.amount_cents)}</SubmitButton>
          </form>
          <form action={reviewClaim} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <input type="hidden" name="claim_id" value={id} />
            <input type="hidden" name="revision" value={claim.current_revision} />
            <input type="hidden" name="decision" value="reject" />
            <div className="min-w-60 flex-1">
              <label className="label" htmlFor="r-note">Reason for rejecting</label>
              <input id="r-note" name="note" required maxLength={500} placeholder="e.g. Receipt doesn't show the total" className="input" />
            </div>
            <SubmitButton className="btn-danger" pendingText="Rejecting…">Reject</SubmitButton>
          </form>
        </div>
      )}

      {canPay && (
        <form action={markClaimPaid} className="card flex flex-wrap items-end gap-2">
          <input type="hidden" name="claim_id" value={id} />
          <div className="min-w-60 flex-1">
            <label className="label" htmlFor="p-ref">Payment reference (optional)</label>
            <input id="p-ref" name="reference" maxLength={500} placeholder="FPS / bank reference" className="input" />
          </div>
          <SubmitButton pendingText="Saving…">Mark as paid</SubmitButton>
        </form>
      )}

      <section className="space-y-2">
        <h2 className="font-bold">History</h2>
        <ol className="card space-y-2 text-sm">
          {(history ?? []).map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-2">
              <span className="text-muted">{formatDateTime(h.created_at)}</span>
              <span>
                <strong>{CLAIM_STATUS[h.to_status].label}</strong> by {nameOf(h.actor_id)} (version {h.revision})
                {h.by_claimant && <span className="badge ml-1 bg-warn/10 text-warn">self-approved</span>}
                {h.note && <>: {h.note}</>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {revisions.length > 1 && (
        <section className="space-y-2">
          <h2 className="font-bold">Earlier versions</h2>
          <ul className="card space-y-2 text-sm">
            {revisions.filter((r) => r.revision !== claim.current_revision).map((r) => {
              const u = urlOf(r.receipt_path);
              return (
                <li key={r.revision}>
                  Version {r.revision}: {formatPrice(r.amount_cents)} · {r.description}
                  {u && <> · <a href={u} target="_blank" rel="noreferrer" className="underline">receipt</a></>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
