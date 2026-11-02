import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatPrice } from "@/lib/format";
import type { MembershipApplication, MembershipOffer } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";
import { cancelApplication, confirmMembership, saveOffer } from "../../membership/actions";

export const metadata = { title: "Memberships" };

export default async function MembershipsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: offerData }, { data: appData }] = await Promise.all([
    supabase.from("membership_offers").select("*").order("valid_until", { ascending: false }).returns<MembershipOffer[]>(),
    supabase.from("membership_applications").select("*").neq("status", "cancelled").order("created_at", { ascending: false }).limit(300).returns<MembershipApplication[]>(),
  ]);
  const offers = offerData ?? [];
  const apps = appData ?? [];
  const q = (sp.q ?? "").trim().toLowerCase();
  const match = (a: MembershipApplication) => !q || [a.full_name, a.email, a.payment_reference].some((v) => v.toLowerCase().includes(q));
  const waiting = apps.filter((a) => a.status === "awaiting_payment" && match(a));
  const confirmed = apps.filter((a) => a.status === "confirmed" && match(a));
  const offerName = new Map(offers.map((o) => [o.id, o.name]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Memberships</h1>
        <p className="text-sm text-muted">People join at <strong>/membership</strong>. Confirming a payment adds or renews them on the member list straight away.</p>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-medium">Waiting for payment ({waiting.length})</h2>
          <form className="w-full sm:w-64"><input name="q" defaultValue={sp.q} placeholder="Search name, email or MEM-…" className="input py-2 text-sm" /></form>
        </div>
        {waiting.length === 0 ? <p className="card py-6 text-center text-sm text-muted">Nothing waiting.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {waiting.map((a) => (
              <li key={a.id} className="card space-y-3 p-4">
                <div>
                  <p className="font-medium">{a.full_name}</p>
                  <p className="text-xs text-muted">{a.email}{a.student_id && ` · ${a.student_id}`} · {offerName.get(a.offer_id)} · {formatDateTime(a.created_at)}</p>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-page px-3 py-2">
                  <span className="font-mono text-sm tracking-wide">{a.payment_reference}</span>
                  <CopyButton value={a.payment_reference} />
                </div>
                <form action={confirmMembership} className="w-full">
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton className="btn-primary w-full py-3" pendingText="Confirming…">Mark {formatPrice(a.price_cents)} paid</SubmitButton>
                </form>
                <form action={cancelApplication}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton className="btn-danger w-full" pendingText="Cancelling…">Cancel</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Offers</h2>
        {offers.map((o) => <OfferForm key={o.id} offer={o} />)}
        <details className="card" open={offers.length === 0}>
          <summary className="cursor-pointer font-medium">New offer</summary>
          <div className="mt-4"><OfferForm /></div>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Joined in the app ({confirmed.length})</h2>
        {confirmed.length === 0 ? <p className="text-sm text-muted">Nobody yet.</p> : (
          <ul className="card divide-y divide-line p-0 text-sm">
            {confirmed.slice(0, 100).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate">{a.full_name} <span className="text-xs text-muted">· {a.email}</span></span>
                <span className="shrink-0 text-xs text-muted">{a.confirmed_at ? formatDate(a.confirmed_at) : ""} · {formatPrice(a.price_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OfferForm({ offer }: { offer?: MembershipOffer }) {
  return (
    <form action={saveOffer} className={offer ? "card grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2"}>
      {offer && <input type="hidden" name="id" value={offer.id} />}
      <div>
        <label className="label text-xs">Name</label>
        <input name="name" required maxLength={80} defaultValue={offer?.name} placeholder="e.g. 2026–27 membership" className="input" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label text-xs">Price (HK$)</label>
          <input name="price" required inputMode="decimal" defaultValue={offer ? (offer.price_cents / 100).toFixed(2) : ""} placeholder="150.00" className="input" />
        </div>
        <div>
          <label className="label text-xs">Valid until</label>
          <input name="valid_until" type="date" required defaultValue={offer?.valid_until} className="input" />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="label text-xs">What members get (shown on the page)</label>
        <textarea name="description" rows={2} maxLength={1000} defaultValue={offer?.description ?? ""} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label text-xs">FPS payment details</label>
        <textarea name="payment_instructions" rows={2} maxLength={1000} defaultValue={offer?.payment_instructions ?? ""} placeholder="FPS ID / account name" className="input" />
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_open" defaultChecked={offer?.is_open ?? true} /> On sale</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="team_only" defaultChecked={offer?.team_only ?? false} /> Team only (only ExCo and subcommittee see and can buy it)</label>
      </div>
      <div className="sm:text-right"><SubmitButton className="btn-ghost" pendingText="Saving…">{offer ? "Save" : "Create offer"}</SubmitButton></div>
    </form>
  );
}
