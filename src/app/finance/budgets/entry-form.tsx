"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@/lib/claims";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type EntryKind } from "@/lib/budgets";
import { addEntry } from "./actions";

const EXT_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", pdf: "application/pdf" };

/** Add income or an expense, for an event or for the year in general. Lives inside a Modal. */
export function EntryForm({
  kind,
  back,
  userId,
  today,
  events,
  eventId,
}: {
  kind: EntryKind;
  back: string;
  userId: string;
  today: string;
  events: { id: string; title: string; date: string }[];
  /** Fixed event (event page) or undefined to let them pick (year page). "" = general. */
  eventId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const income = kind === "income";
  const p = income ? "in" : "ex";

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
        if (up) return setError("Couldn't upload the file. Try again, or save without it.");
        fd.set("receipt_path", path);
      }
      const res = await addEntry(fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="kind" value={kind} />
      {eventId === undefined ? (
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`${p}-event`}>For</label>
          <select id={`${p}-event`} name="event_id" defaultValue="" className="input">
            <option value="">The year in general (not one event)</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} · {ev.date}</option>)}
          </select>
        </div>
      ) : (
        <input type="hidden" name="event_id" value={eventId} />
      )}
      <div>
        <label className="label" htmlFor={`${p}-cat`}>Category</label>
        <input id={`${p}-cat`} name="category" required maxLength={40} list={`${p}-cats`} placeholder={income ? "e.g. Sponsorship" : "e.g. Venue"} className="input" />
        <datalist id={`${p}-cats`}>{(income ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div>
        <label className="label" htmlFor={`${p}-amt`}>Amount (HK$)</label>
        <input id={`${p}-amt`} name="amount" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" placeholder={income ? "3000.00" : "1200.00"} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}-desc`}>What for</label>
        <input id={`${p}-desc`} name="description" required maxLength={300} placeholder={income ? "e.g. Term 1 Students' Union grant" : "e.g. E11 Space rental, 7pm–midnight"} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-party`}>{income ? "Received from (optional)" : "Paid to (optional)"}</label>
        <input id={`${p}-party`} name="party" maxLength={100} placeholder={income ? "e.g. HKUST Students' Union" : "e.g. HKUST Facilities"} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`${p}-date`}>{income ? "Received on" : "Paid on"}</label>
        <input id={`${p}-date`} name="entry_date" type="date" required defaultValue={today} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${p}-rcpt`}>{income ? "Proof (optional)" : "Receipt or invoice (optional)"}</label>
        <input id={`${p}-rcpt`} name="receipt" type="file" accept="image/*,application/pdf" className="input" />
      </div>
      {error && <p role="alert" className="rounded-xl border border-bad/20 bg-bad/5 px-3 py-2 text-sm text-bad sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button className={income ? "btn-blue" : "btn-primary"} disabled={pending}>{pending ? "Saving…" : income ? "Add income" : "Add expense"}</button>
      </div>
    </form>
  );
}
