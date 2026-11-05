import { saveEvent, deleteEvent } from "../actions";
import { isoToLocal } from "@/lib/format";
import type { SassEvent } from "@/lib/types";
import { SubmitButton } from "@/components/submit-button";
import type { MealColor } from "@/lib/meals";
import { MealEditor } from "./meal-editor";

const dollars = (p?: number) => (p == null ? "0" : (p / 100).toFixed(2));

export function EventForm({ event, teamPriceCents, mealOptions = [] }: { event?: SassEvent; teamPriceCents?: number | null; mealOptions?: { id: string; label: string; color: MealColor }[] }) {
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
        <Field label="Starts (HK time)">
          <input name="starts_at" type="datetime-local" required defaultValue={isoToLocal(event?.starts_at)} className="input" />
        </Field>
        <Field label="Ends (HK time, optional)">
          <input name="ends_at" type="datetime-local" defaultValue={isoToLocal(event?.ends_at)} className="input" />
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
        <Field label="Member price (HK$)" hint="0 = free member ticket">
          <input name="member_price" inputMode="decimal" defaultValue={dollars(event?.member_price_cents)} className="input" />
        </Field>
        <Field label="Non-member price (HK$)">
          <input name="public_price" inputMode="decimal" defaultValue={dollars(event?.public_price_cents)} className="input" />
        </Field>
        <Field label="Subcommittee price (HK$, optional)" className="sm:col-span-2" hint="What subcommittee pay. Only current team members can see it. ExCo are always free. Team places are reserved: sold out, sales dates and members-only don't stop them. Blank = no subcommittee price.">
          <input name="team_price" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={teamPriceCents == null ? "" : dollars(teamPriceCents)} placeholder="e.g. 30.00" className="input sm:max-w-xs" />
        </Field>
        <Field label="Member sales open (optional)" hint="Blank = same as general sales">
          <input name="member_sales_open_at" type="datetime-local" defaultValue={isoToLocal(event?.member_sales_open_at)} className="input" />
        </Field>
        <Field label="General sales open (optional)" hint="Blank = open as soon as published">
          <input name="public_sales_open_at" type="datetime-local" defaultValue={isoToLocal(event?.public_sales_open_at)} className="input" />
        </Field>
        <Field label="Sales close (optional)">
          <input name="sales_close_at" type="datetime-local" defaultValue={isoToLocal(event?.sales_close_at)} className="input" />
        </Field>
        <Field label="FPS payment instructions" className="sm:col-span-2" hint="Shown to people with unpaid tickets: FPS ID or phone number, account name, and to put the reference in the remarks.">
          <textarea name="payment_instructions" rows={3} defaultValue={event?.payment_instructions ?? ""} className="input font-mono text-sm" />
        </Field>

        <MealEditor enabled={event?.meals_enabled ?? false} options={mealOptions} />

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="sold_out" defaultChecked={event?.sold_out ?? false} /> Sold out
          </label>
          <p className="hint">Stops online ticket sales and shows a SOLD OUT stamp on the event. Anyone who already has a ticket keeps it. Team places, door tickets and walk-ins still work. Untick to reopen sales.</p>
        </div>
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
