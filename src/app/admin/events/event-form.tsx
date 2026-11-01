import { saveEvent, deleteEvent } from "../actions";
import { isoToLondonLocal } from "@/lib/format";
import type { SassEvent } from "@/lib/types";
import { SubmitButton } from "@/components/submit-button";

const pounds = (p?: number) => (p == null ? "0" : (p / 100).toFixed(2));

export function EventForm({ event }: { event?: SassEvent }) {
  return (
    <div className="space-y-6">
      <form action={saveEvent} className="card grid gap-4 sm:grid-cols-2">
        {event && <input type="hidden" name="id" value={event.id} />}
        <Field label="Title" className="sm:col-span-2">
          <input name="title" required defaultValue={event?.title} className="input" />
        </Field>
        <Field label="URL slug" hint="e.g. henna-night-2026. Leave blank to generate from title.">
          <input name="slug" defaultValue={event?.slug} className="input" />
        </Field>
        <Field label="Venue">
          <input name="venue" defaultValue={event?.venue ?? ""} className="input" />
        </Field>
        <Field label="Starts (UK time)">
          <input name="starts_at" type="datetime-local" required defaultValue={isoToLondonLocal(event?.starts_at)} className="input" />
        </Field>
        <Field label="Ends (UK time, optional)">
          <input name="ends_at" type="datetime-local" defaultValue={isoToLondonLocal(event?.ends_at)} className="input" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea name="description" rows={5} defaultValue={event?.description ?? ""} className="input" />
        </Field>
        <Field label="Cover image URL (optional)" className="sm:col-span-2" hint="Paste a public image link (e.g. from Supabase Storage).">
          <input name="cover_image_url" type="url" defaultValue={event?.cover_image_url ?? ""} className="input" />
        </Field>

        <h2 className="pt-2 text-lg font-bold sm:col-span-2">Tickets</h2>
        <Field label="Who can get tickets">
          <select name="access" defaultValue={event?.access ?? "everyone"} className="input">
            <option value="everyone">Everyone (members + non-members)</option>
            <option value="members_only">Members only</option>
          </select>
        </Field>
        <Field label="Capacity (optional)" hint="Online tickets stop at this number. Door tickets can still be added.">
          <input name="capacity" type="number" min={1} defaultValue={event?.capacity ?? ""} className="input" />
        </Field>
        <Field label="Member price (£)" hint="0 = free member ticket">
          <input name="member_price" inputMode="decimal" defaultValue={pounds(event?.member_price_pence)} className="input" />
        </Field>
        <Field label="Non-member price (£)">
          <input name="public_price" inputMode="decimal" defaultValue={pounds(event?.public_price_pence)} className="input" />
        </Field>
        <Field label="Member sales open (optional)" hint="Blank = same as general sales">
          <input name="member_sales_open_at" type="datetime-local" defaultValue={isoToLondonLocal(event?.member_sales_open_at)} className="input" />
        </Field>
        <Field label="General sales open (optional)" hint="Blank = open as soon as published">
          <input name="public_sales_open_at" type="datetime-local" defaultValue={isoToLondonLocal(event?.public_sales_open_at)} className="input" />
        </Field>
        <Field label="Sales close (optional)">
          <input name="sales_close_at" type="datetime-local" defaultValue={isoToLondonLocal(event?.sales_close_at)} className="input" />
        </Field>
        <Field label="Bank transfer instructions" className="sm:col-span-2" hint="Shown to people with unpaid tickets: account name, sort code, account number.">
          <textarea name="payment_instructions" rows={3} defaultValue={event?.payment_instructions ?? ""} className="input font-mono text-sm" />
        </Field>

        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
          <input type="checkbox" name="is_published" defaultChecked={event?.is_published ?? false} /> Published (visible on the site)
        </label>
        <div className="sm:col-span-2">
          <SubmitButton pendingText="Saving…">Save event</SubmitButton>
        </div>
      </form>

      {event && (
        <form action={deleteEvent}>
          <input type="hidden" name="id" value={event.id} />
          <SubmitButton className="btn-danger" pendingText="Deleting…">Delete event</SubmitButton>
          <p className="hint">Only possible while no tickets exist.</p>
        </form>
      )}
    </div>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
