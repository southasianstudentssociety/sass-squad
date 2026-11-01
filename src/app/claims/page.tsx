import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPrice } from "@/lib/format";
import { CLAIM_STATUS } from "@/lib/claims";
import type { Claim, ClaimRevision } from "@/lib/types";

export const metadata = { title: "My claims" };

type Row = Claim & { claim_revisions: Pick<ClaimRevision, "revision" | "amount_cents" | "description">[] };

export default async function ClaimsPage() {
  const session = await requireUser("/claims");
  const supabase = await createClient();
  // Filter by claimant explicitly: Finance can read everyone's claims, but this page is "mine".
  const { data } = await supabase
    .from("claims")
    .select("*, claim_revisions(revision, amount_cents, description)")
    .eq("claimant_id", session.userId)
    .order("created_at", { ascending: false })
    .returns<Row[]>();
  const claims = data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-normal">My claims</h1>
          <p className="text-sm text-muted">Reimbursements for things you paid for on behalf of SASS.</p>
        </div>
        {session.access.isTeam && <Link href="/claims/new" className="btn-primary">New claim</Link>}
      </div>

      {!session.access.isTeam && claims.length === 0 && (
        <p className="card text-sm text-muted">Only current team members can submit claims. Ask an ExCo to add you on the Team page.</p>
      )}
      {session.access.isTeam && claims.length === 0 && <p className="card text-sm text-muted">No claims yet.</p>}

      {claims.length > 0 && (
        <ul className="space-y-3">
          {claims.map((c) => {
            const rev = c.claim_revisions.find((r) => r.revision === c.current_revision);
            const st = CLAIM_STATUS[c.status];
            return (
              <li key={c.id}>
                <Link href={`/claims/${c.id}`} className="card flex items-center justify-between gap-3 hover:shadow-md">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{rev?.description ?? c.reference}</p>
                    <p className="text-xs text-muted">{c.reference} · {formatDate(c.created_at)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold">{rev ? formatPrice(rev.amount_cents) : ""}</p>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
