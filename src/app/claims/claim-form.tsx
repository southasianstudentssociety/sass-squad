"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PAYOUT_METHODS, RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@/lib/claims";
import type { PayoutMethod } from "@/lib/types";
import { reviseClaim, submitClaim } from "./actions";

const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", pdf: "application/pdf",
};

type EventOption = { id: string; title: string; date: string };
type Defaults = {
  claimId: string;
  eventId: string | null;
  amount: string;
  description: string;
  payoutMethod: PayoutMethod;
  payoutDetails: string;
  receiptPath: string;
};

export function ClaimForm({ userId, events, defaults }: { userId: string; events: EventOption[]; defaults?: Defaults }) {
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<PayoutMethod>(defaults?.payoutMethod ?? "fps");
  const [pending, startTransition] = useTransition();
  const revising = Boolean(defaults);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const file = formData.get("receipt");
      let path = defaults?.receiptPath ?? "";

      if (file instanceof File && file.size > 0) {
        if (file.size > RECEIPT_MAX_BYTES) return setError("That file is over 10 MB. Take a smaller photo or screenshot it.");
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
        // Some Android pickers leave the type empty; Storage would then reject the file.
        const contentType = file.type || EXT_TYPES[ext] || "";
        if (!RECEIPT_TYPES.includes(contentType)) return setError("Upload a photo (JPG, PNG, HEIC) or a PDF.");
        const newPath = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await createClient()
          .storage.from("receipts")
          .upload(newPath, file, { contentType, upsert: false });
        if (uploadError) return setError("Couldn't upload the receipt. Check your connection and try again.");
        path = newPath;
      }
      if (!path) return setError("Attach a photo or PDF of the receipt.");

      formData.delete("receipt");
      formData.set("receipt_path", path);
      const result = revising ? await reviseClaim(formData) : await submitClaim(formData);
      if (result?.error) setError(result.error);
    });
  }

  const detailsLabel = PAYOUT_METHODS[method].detailsLabel;

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      {defaults && <input type="hidden" name="claim_id" value={defaults.claimId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-amount">Amount (HK$)</label>
          <input id="c-amount" name="amount" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" placeholder="250.00"
            defaultValue={defaults?.amount} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="c-event">Event (optional)</label>
          <select id="c-event" name="event_id" defaultValue={defaults?.eventId ?? ""} className="input">
            <option value="">Not for a specific event</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} · {ev.date}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="c-desc">What did you buy, and what for?</label>
        <textarea id="c-desc" name="description" required minLength={3} maxLength={1000} rows={3}
          placeholder="e.g. 40 diyas from Mong Kok for the Diwali stage" defaultValue={defaults?.description} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="c-receipt">Receipt</label>
        <input id="c-receipt" name="receipt" type="file" accept="image/*,application/pdf" required={!revising} className="input" />
        <p className="hint">
          {revising ? "Leave empty to keep the current receipt. " : ""}A clear photo or PDF, up to 10 MB. It&apos;s only visible to you and Finance.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-method">Pay me by</label>
          <select id="c-method" name="payout_method" value={method} onChange={(e) => setMethod(e.target.value as PayoutMethod)} className="input">
            {(Object.keys(PAYOUT_METHODS) as PayoutMethod[]).map((m) => <option key={m} value={m}>{PAYOUT_METHODS[m].label}</option>)}
          </select>
        </div>
        {detailsLabel && (
          <div>
            <label className="label" htmlFor="c-details">{detailsLabel}</label>
            <input id="c-details" name="payout_details" required maxLength={200} defaultValue={defaults?.payoutDetails} className="input" />
          </div>
        )}
      </div>
      {revising && (
        <div>
          <label className="label" htmlFor="c-note">What changed? (optional)</label>
          <input id="c-note" name="note" maxLength={500} placeholder="e.g. Clearer photo of the receipt" className="input" />
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{error}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={pending}>
        {pending ? "Uploading…" : revising ? "Save and resubmit" : "Submit claim"}
      </button>
      {!revising && <p className="hint">Once submitted, a claim can&apos;t be edited. If Finance rejects it, you can submit a corrected version.</p>}
    </form>
  );
}
