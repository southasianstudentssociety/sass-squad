import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, formatDateTime, todayInHongKong } from "@/lib/format";
import { claimableEvents } from "@/lib/claim-data";
import { CONDITIONS, teamNames } from "@/lib/inventory";
import type { InventoryAction, InventoryItem, InventoryLoan, InventoryLogEntry } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { adjustItem, checkOut, retireItem, returnLoan, transferItem, updateItem } from "../actions";

export const metadata = { title: "Inventory item" };

const ACTION_LABEL: Record<InventoryAction, string> = {
  created: "Added",
  edited: "Edited",
  adjusted: "Count changed",
  checked_out: "Checked out",
  returned: "Returned",
  lost: "Lost",
  retired: "Retired",
  transferred: "Handed on",
};

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireTeam(`/inventory/${id}`);
  const supabase = await createClient();

  const { data: item } = await supabase.from("inventory_overview").select("*").eq("id", id).maybeSingle<InventoryItem>();
  if (!item) notFound();

  const [{ data: loansData }, { data: logData }, { data: team }, events] = await Promise.all([
    supabase.from("inventory_loans").select("*").eq("item_id", id).is("returned_at", null).order("checked_out_at").returns<InventoryLoan[]>(),
    supabase.from("inventory_log").select("*").eq("item_id", id).order("created_at", { ascending: false }).limit(100).returns<InventoryLogEntry[]>(),
    supabase.rpc("team_directory"),
    claimableEvents(),
  ]);
  const loans = loansData ?? [];
  const log = logData ?? [];
  const directory = (team ?? []) as { user_id: string; full_name: string | null; email: string }[];
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const names = await teamNames([
    item.keeper_id,
    ...log.flatMap((e) => [str(e.details?.from), str(e.details?.to), str(e.details?.keeper_id)]),
    ...loans.flatMap((l) => [l.borrower_id, l.checked_out_by]),
    ...log.flatMap((e) => [e.actor_id, typeof e.details?.borrower_id === "string" ? e.details.borrower_id : null]),
  ]);
  const name = (uid: string | null | undefined) => (uid ? (names.get(uid) ?? "Former team member") : "-");
  const today = todayInHongKong();
  const retired = Boolean(item.retired_at);
  const isExco = session.access.isAdmin;
  const canTransfer = !retired && (isExco || item.keeper_id === session.userId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/inventory" className="text-xs text-muted underline">← Inventory</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-normal">{item.name}</h1>
          <p className="text-sm text-muted">{[item.category, item.location].filter(Boolean).join(" · ") || "No category or location yet"}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{item.available} <span className="text-base font-normal text-muted">of {item.quantity} available</span></p>
          {retired ? <span className="badge bg-ink/10 text-ink">Retired</span> : <span className={`badge ${CONDITIONS[item.condition].cls}`}>{CONDITIONS[item.condition].label}</span>}
        </div>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />
      {item.notes && <p className="card whitespace-pre-wrap text-sm">{item.notes}</p>}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">Person in charge</h2>
          <p className="text-sm">{item.keeper_id ? <strong>{name(item.keeper_id)}</strong> : <span className="text-muted">Nobody yet</span>}</p>
        </div>
        <p className="text-xs text-muted">The person who answers for this item and knows where it is. Handing it on is logged in the history below.</p>
        {canTransfer ? (
          <form action={transferItem} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="item_id" value={id} />
            <div>
              <label className="label text-xs" htmlFor="tr-to">Hand it to</label>
              <select id="tr-to" name="keeper_id" required defaultValue="" className="input">
                <option value="" disabled>Choose a person</option>
                {directory.filter((p) => p.user_id !== item.keeper_id).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name ?? p.email}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs" htmlFor="tr-note">Note (optional)</label>
              <input id="tr-note" name="note" maxLength={500} placeholder="e.g. Handed over after Diwali" className="input" />
            </div>
            <SubmitButton pendingText="Saving…">Transfer</SubmitButton>
          </form>
        ) : !retired && (
          <p className="text-xs text-muted">Only {item.keeper_id ? name(item.keeper_id) : "an ExCo"}{item.keeper_id && " or an ExCo"} can hand it on.</p>
        )}
      </section>

      {loans.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Checked out ({item.on_loan})</h2>
          {loans.map((l) => (
            <div key={l.id} className="card space-y-3">
              <p>
                <strong>{name(l.borrower_id)}</strong> has <strong>{l.quantity}</strong>
                {l.due_on && <span className={l.due_on < today ? "font-semibold text-bad" : undefined}> · back by {formatDate(l.due_on)}{l.due_on < today && " (overdue)"}</span>}
                <span className="block text-xs text-muted">
                  Checked out {formatDateTime(l.checked_out_at)} by {name(l.checked_out_by)}{l.note && ` · ${l.note}`}
                </span>
              </p>
              <form action={returnLoan} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
                <input type="hidden" name="item_id" value={id} />
                <input type="hidden" name="loan_id" value={l.id} />
                <div>
                  <label className="label text-xs" htmlFor={`rq-${l.id}`}>How many came back</label>
                  <input id={`rq-${l.id}`} name="returned_quantity" type="number" min={0} max={l.quantity} required defaultValue={l.quantity} className="input w-28" />
                </div>
                <div>
                  <label className="label text-xs" htmlFor={`rc-${l.id}`}>Condition now</label>
                  <select id={`rc-${l.id}`} name="condition" defaultValue="" className="input">
                    <option value="">Unchanged</option>
                    {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label text-xs" htmlFor={`rn-${l.id}`}>Note (required if some are missing)</label>
                  <input id={`rn-${l.id}`} name="note" maxLength={500} className="input" />
                </div>
                <SubmitButton pendingText="Saving…">Record return</SubmitButton>
              </form>
            </div>
          ))}
        </section>
      )}

      {!retired && item.available > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Check out</h2>
          <form action={checkOut} className="card grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="item_id" value={id} />
            <div>
              <label className="label" htmlFor="co-who">Who&apos;s taking it</label>
              <select id="co-who" name="borrower_id" required defaultValue={session.userId} className="input">
                {directory.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name ?? p.email}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="co-qty">How many</label>
              <input id="co-qty" name="quantity" type="number" min={1} max={item.available} required defaultValue={Math.min(1, item.available)} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="co-event">For event (optional)</label>
              <select id="co-event" name="event_id" defaultValue="" className="input">
                <option value="">None</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.date}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="co-due">Back by (optional)</label>
              <input id="co-due" name="due_on" type="date" min={today} defaultValue={addDays(today, 7)} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="co-note">Note (optional)</label>
              <input id="co-note" name="note" maxLength={500} className="input" />
            </div>
            <div className="sm:col-span-2"><SubmitButton pendingText="Saving…">Check out</SubmitButton></div>
          </form>
        </section>
      )}

      {!retired && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Manage</h2>
          <form action={adjustItem} className="card flex flex-wrap items-end gap-2">
            <input type="hidden" name="item_id" value={id} />
            <div>
              <label className="label text-xs" htmlFor="adj-dir">Change count</label>
              <select id="adj-dir" name="direction" className="input">
                <option value="add">Add</option>
                <option value="remove">Remove</option>
              </select>
            </div>
            <input name="amount" type="number" min={1} required aria-label="How many" placeholder="How many" className="input w-28" />
            <div className="min-w-48 flex-1">
              <label className="label text-xs" htmlFor="adj-why">Why</label>
              <input id="adj-why" name="reason" required maxLength={500} placeholder="e.g. Bought 20 more / 5 used up" className="input" />
            </div>
            <SubmitButton className="btn-ghost" pendingText="Saving…">Update count</SubmitButton>
          </form>

          <form action={updateItem} className="card grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="item_id" value={id} />
            <div><label className="label text-xs" htmlFor="ed-name">Name</label><input id="ed-name" name="name" required maxLength={100} defaultValue={item.name} className="input" /></div>
            <div><label className="label text-xs" htmlFor="ed-cat">Category</label><input id="ed-cat" name="category" maxLength={50} defaultValue={item.category ?? ""} className="input" /></div>
            <div><label className="label text-xs" htmlFor="ed-loc">Where it&apos;s kept</label><input id="ed-loc" name="location" maxLength={200} defaultValue={item.location ?? ""} className="input" /></div>
            <div>
              <label className="label text-xs" htmlFor="ed-cond">Condition</label>
              <select id="ed-cond" name="condition" defaultValue={item.condition} className="input">
                {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label className="label text-xs" htmlFor="ed-notes">Notes</label><input id="ed-notes" name="notes" maxLength={1000} defaultValue={item.notes ?? ""} className="input" /></div>
            <div className="sm:col-span-2"><SubmitButton className="btn-ghost" pendingText="Saving…">Save details</SubmitButton></div>
          </form>

          {isExco && item.on_loan === 0 && (
            <form action={retireItem} className="card flex flex-wrap items-end gap-2">
              <input type="hidden" name="item_id" value={id} />
              <div className="min-w-48 flex-1">
                <label className="label text-xs" htmlFor="ret-why">Retire (thrown away, sold, given away)</label>
                <input id="ret-why" name="reason" required maxLength={500} placeholder="Why" className="input" />
              </div>
              <SubmitButton className="btn-danger" pendingText="Retiring…">Retire item</SubmitButton>
            </form>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-bold">History</h2>
        <ol className="card space-y-2 text-sm">
          {log.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className="text-muted">{formatDateTime(e.created_at)}</span>
              <span>
                <strong>{ACTION_LABEL[e.action]}</strong>
                {e.quantity_delta !== 0 && ` (${e.quantity_delta > 0 ? "+" : ""}${e.quantity_delta})`}
                {e.action === "checked_out" && typeof e.details?.borrower_id === "string" && ` to ${name(e.details.borrower_id)}`}
                {e.action === "edited" && e.details && `: ${Object.keys(e.details).join(", ")}`}
                {e.action === "transferred" && ` from ${str(e.details?.from) ? name(str(e.details?.from)) : "nobody"} to ${str(e.details?.to) ? name(str(e.details?.to)) : "nobody"}`}
                {e.action === "created" && str(e.details?.keeper_id) && `, in charge: ${name(str(e.details?.keeper_id))}`}
                {" "}by {name(e.actor_id)}{e.note && `: ${e.note}`}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
