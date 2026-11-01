import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { Claim, ClaimEvent, ClaimRevision } from "@/lib/types";

/** Events a claim can be attached to: the last 6 months and anything upcoming. */
export async function claimableEvents() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 183 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at")
    .gte("starts_at", since)
    .order("starts_at", { ascending: false })
    .returns<{ id: string; title: string; starts_at: string }[]>();
  return (data ?? []).map((e) => ({ id: e.id, title: e.title, date: formatDate(e.starts_at) }));
}

export type FinanceRow = Claim & {
  claimant: { full_name: string | null; email: string } | null;
  claim_revisions: ClaimRevision[];
  claim_events: ClaimEvent[];
  current: ClaimRevision;
};

/** Every claim Finance can see, with the current revision and full history. */
export async function financeClaims(): Promise<FinanceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("claims")
    .select("*, claimant:profiles!claims_claimant_id_fkey(full_name, email), claim_revisions(*), claim_events(*)")
    .order("updated_at", { ascending: false })
    .returns<Omit<FinanceRow, "current">[]>();
  return (data ?? []).flatMap((c) => {
    const current = c.claim_revisions.find((r) => r.revision === c.current_revision);
    return current ? [{ ...c, current }] : [];
  });
}
