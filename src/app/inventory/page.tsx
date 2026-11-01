import Link from "next/link";
import { requireTeam } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayInHongKong } from "@/lib/format";
import { CONDITIONS, teamNames } from "@/lib/inventory";
import type { InventoryItem, InventoryLoan } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createItem } from "./actions";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; retired?: string; ok?: string; error?: string }>;
}) {
  const session = await requireTeam("/inventory");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: itemsData }, { data: loansData }] = await Promise.all([
    supabase.from("inventory_overview").select("*").order("name").returns<InventoryItem[]>(),
    supabase.from("inventory_loans").select("*").is("returned_at", null).order("due_on", { nullsFirst: false }).returns<InventoryLoan[]>(),
  ]);
  const allItems = itemsData ?? [];
  const loans = loansData ?? [];
  const names = await teamNames(loans.map((l) => l.borrower_id));
  const today = todayInHongKong();

  const q = (sp.q ?? "").trim().toLowerCase();
  const categories = [...new Set(allItems.map((i) => i.category).filter(Boolean))].sort() as string[];
  const items = allItems.filter(
    (i) =>
      (sp.retired === "1" || !i.retired_at) &&
      (!sp.category || i.category === sp.category) &&
      (!q || [i.name, i.category, i.location, i.notes].some((v) => v?.toLowerCase().includes(q))),
  );
  const itemName = new Map(allItems.map((i) => [i.id, i.name]));
  const overdue = loans.filter((l) => l.due_on && l.due_on < today);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-normal">Inventory</h1>
        <p className="text-sm text-muted">
          {allItems.filter((i) => !i.retired_at).length} items · {loans.length} checked out
          {overdue.length > 0 && <span className="text-bad"> · {overdue.length} overdue</span>}
        </p>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />

      {loans.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Who has what</h2>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead><tr><th>Item</th><th>Who</th><th>How many</th><th>Back by</th></tr></thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td><Link href={`/inventory/${l.item_id}`} className="font-semibold underline">{itemName.get(l.item_id) ?? "Item"}</Link></td>
                    <td>{names.get(l.borrower_id) ?? "Former team member"}</td>
                    <td>{l.quantity}</td>
                    <td className={l.due_on && l.due_on < today ? "font-semibold text-bad" : undefined}>
                      {l.due_on ? formatDate(l.due_on) : "-"}{l.due_on && l.due_on < today && " (overdue)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <form className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="inv-q">Search</label>
            <input id="inv-q" name="q" defaultValue={sp.q} placeholder="Name, location, notes" className="input" />
          </div>
          {categories.length > 0 && (
            <div>
              <label className="label" htmlFor="inv-cat">Category</label>
              <select id="inv-cat" name="category" defaultValue={sp.category ?? ""} className="input">
                <option value="">All</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-center gap-1.5 pb-2 text-sm">
            <input type="checkbox" name="retired" value="1" defaultChecked={sp.retired === "1"} /> Show retired
          </label>
          <button className="btn-ghost">Filter</button>
        </form>

        {items.length === 0 ? (
          <p className="card text-sm text-muted">{allItems.length === 0 ? "Nothing in the inventory yet." : "No items match."}</p>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead><tr><th>Item</th><th>Where</th><th>Condition</th><th className="text-right">Available</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className={i.retired_at ? "opacity-50" : undefined}>
                    <td>
                      <Link href={`/inventory/${i.id}`} className="font-semibold underline">{i.name}</Link>
                      {i.category && <span className="block text-xs text-muted">{i.category}</span>}
                    </td>
                    <td className="text-sm">{i.location ?? "-"}</td>
                    <td>{i.retired_at ? <span className="badge bg-ink/10 text-ink">Retired</span> : <span className={`badge ${CONDITIONS[i.condition].cls}`}>{CONDITIONS[i.condition].label}</span>}</td>
                    <td className="whitespace-nowrap text-right">
                      <strong>{i.available}</strong> <span className="text-muted">of {i.quantity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {session.access.isAdmin && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Add an item</h2>
          <form action={createItem} className="card grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ni-name">Name</label>
              <input id="ni-name" name="name" required maxLength={100} placeholder="e.g. Clay diyas" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="ni-cat">Category</label>
              <input id="ni-cat" name="category" maxLength={50} list="inv-categories" placeholder="e.g. Decor, Equipment, Stock" className="input" />
              <datalist id="inv-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="label" htmlFor="ni-qty">How many</label>
              <input id="ni-qty" name="quantity" type="number" min={0} required defaultValue={1} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="ni-cond">Condition</label>
              <select id="ni-cond" name="condition" defaultValue="good" className="input">
                {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ni-loc">Where it&apos;s kept</label>
              <input id="ni-loc" name="location" maxLength={200} placeholder="e.g. Society room, top shelf, box 3" className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ni-notes">Notes (optional)</label>
              <input id="ni-notes" name="notes" maxLength={1000} className="input" />
            </div>
            <div className="sm:col-span-2"><SubmitButton pendingText="Adding…">Add item</SubmitButton></div>
          </form>
        </section>
      )}
    </div>
  );
}
