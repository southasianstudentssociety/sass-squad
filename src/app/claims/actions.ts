"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinance, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dollarsToCents } from "@/lib/format";
import type { PayoutMethod } from "@/lib/types";

export type ClaimFormResult = { error: string } | undefined;

const METHODS: PayoutMethod[] = ["fps", "bank_transfer", "payme", "cash"];

function rpcError(e: { code?: string; message: string } | null, fallback: string) {
  return e?.code === "P0001" ? e.message : fallback;
}

function back(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

function claimFields(formData: FormData) {
  const method = String(formData.get("payout_method") ?? "");
  return {
    p_event_id: String(formData.get("event_id") ?? "") || null,
    p_amount_cents: dollarsToCents(formData.get("amount")),
    p_description: String(formData.get("description") ?? ""),
    p_payout_method: (METHODS as string[]).includes(method) ? method : null,
    p_payout_details: method === "cash" ? null : String(formData.get("payout_details") ?? "") || null,
    p_receipt_path: String(formData.get("receipt_path") ?? ""),
  };
}

function refreshClaims(id?: string) {
  revalidatePath("/claims");
  revalidatePath("/finance");
  if (id) revalidatePath(`/claims/${id}`);
}

// Called from the client form after the receipt has been uploaded to Storage.
export async function submitClaim(formData: FormData): Promise<ClaimFormResult> {
  await requireUser("/claims/new");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_claim", claimFields(formData));
  if (error || !data) return { error: rpcError(error, "Couldn't submit the claim. Try again.") };
  const claim = data as { id: string; reference: string };
  refreshClaims(claim.id);
  back(`/claims/${claim.id}`, { ok: `Submitted as ${claim.reference}. Finance will review it.` });
}

export async function reviseClaim(formData: FormData): Promise<ClaimFormResult> {
  const id = String(formData.get("claim_id") ?? "");
  await requireUser(`/claims/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("revise_claim", {
    p_claim_id: id,
    ...claimFields(formData),
    p_note: String(formData.get("note") ?? "") || null,
  });
  if (error) return { error: rpcError(error, "Couldn't save the change. Try again.") };
  refreshClaims(id);
  back(`/claims/${id}`, { ok: "Updated and sent back to Finance." });
}

export async function withdrawClaim(formData: FormData) {
  const id = String(formData.get("claim_id") ?? "");
  await requireUser(`/claims/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_claim", { p_claim_id: id });
  if (error) back(`/claims/${id}`, { error: rpcError(error, "Couldn't withdraw the claim.") });
  refreshClaims(id);
  back(`/claims/${id}`, { ok: "Claim withdrawn." });
}

export async function reviewClaim(formData: FormData) {
  const id = String(formData.get("claim_id") ?? "");
  await requireFinance(`/claims/${id}`);
  const approve = formData.get("decision") === "approve";
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_claim", {
    p_claim_id: id,
    p_revision: Number(formData.get("revision")),
    p_approve: approve,
    p_note: String(formData.get("note") ?? "") || null,
  });
  if (error) back(`/claims/${id}`, { error: rpcError(error, "Couldn't save the decision.") });
  refreshClaims(id);
  back(`/claims/${id}`, { ok: approve ? "Approved. Mark it paid once you've sent the money." : "Rejected. The claimant can fix it and resubmit." });
}

export async function markClaimPaid(formData: FormData) {
  const id = String(formData.get("claim_id") ?? "");
  await requireFinance(`/claims/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_claim_paid", {
    p_claim_id: id,
    p_reference: String(formData.get("reference") ?? "") || null,
  });
  if (error) back(`/claims/${id}`, { error: rpcError(error, "Couldn't mark it paid.") });
  refreshClaims(id);
  back(`/claims/${id}`, { ok: "Marked as paid." });
}
