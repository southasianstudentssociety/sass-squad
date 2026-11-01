"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@/lib/claims";
import { EXPENSE_CATEGORIES } from "@/lib/budgets";
import { addExpense } from "../actions";

const EXT_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", pdf: "application/pdf" };

export function ExpenseForm({ back, userId, today }: { back: string; userId: string; today: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const file = fd.get("receipt");
      fd.delete("receipt");
      if (file instanceof File && file.size > 0) {
        if (file.size > RECEIPT_MAX_BYTES) return setError("That file is over 10 MB.");
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
        const contentType = file.type || EXT_TYPES[ext] || "";
        if (!RECEIPT_TYPES.includes(contentType)) return setError("Upload a photo or a PDF.");
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: up } = await createClient().storage.from("receipts").upload(path, file, { contentType, upsert: false });
        if (up) return setError("Couldn't upload the receipt. Try again, or save without it.");
        fd.set("receipt_path", path);
      }
      const res = await addExpense(fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="card grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="back" value={back} />
      <div>
        <label className="label" htmlFor="x-cat">Category</label>
        <input id="x-cat" name="category" required maxLength={40} list="x-cats" placeholder="e.g. Venue" className="input" />
        <datalist id="x-cats">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div>
        <label className="label" htmlFor="x-amt">Amount (HK$)</label>
        <input id="x-amt" name="amount" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" placeholder="1200.00" className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="x-desc">What for</label>
        <input id="x-desc" name="description" required maxLength={300} placeholder="e.g. E11 Space rental, 7pm–midnight" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="x-payee">Paid to (optional)</label>
        <input id="x-payee" name="payee" maxLength={100} placeholder="e.g. HKUST Facilities" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="x-date">Paid on</label>
        <input id="x-date" name="paid_on" type="date" required defaultValue={today} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="x-rcpt">Receipt or invoice (optional)</label>
        <input id="x-rcpt" name="receipt" type="file" accept="image/*,application/pdf" className="input" />
      </div>
      {error && <p role="alert" className="rounded-xl border border-bad/20 bg-bad/5 px-3 py-2 text-sm text-bad sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Add expense"}</button>
      </div>
    </form>
  );
}
