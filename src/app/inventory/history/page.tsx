import Link from "next/link";
import { requireTeam } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { teamNames } from "@/lib/inventory";
import { INVENTORY_ACTION_LABEL, LogText, logPeople } from "@/lib/inventory-log";
import type { InventoryAction, InventoryLogEntry } from "@/lib/types";
import { FilterForm } from "@/components/filter-form";

export const metadata = { title: "Inventory history" };

const LIMIT = 300;

export default async function InventoryHistoryPage({ searchParams }: { searchParams: Promise<{ item?: string; action?: string; who?: string }> }) {
  await requireTeam("/inventory/history");
  const sp = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("inventory_log").select("*").order("created_at", { ascending: false }).limit(LIMIT);
  if (sp.item && /^[0-9a-f-]{36}$/i.test(sp.item)) query = query.eq("item_id", sp.item);
  if (sp.action && sp.action in INVENTORY_ACTION_LABEL) query = query.eq("action", sp.action);
  if (sp.who && /^[0-9a-f-]{36}$/i.test(sp.who)) query = query.eq("actor_id", sp.who);

  const [{ data: logData }, { data: itemData }, { data: team }] = await Promise.all([
    query.returns<InventoryLogEntry[]>(),
    supabase.from("inventory_items").select("id, name").order("name").returns<{ id: string; name: string }[]>(),
    supabase.rpc("team_directory"),
  ]);
  const log = logData ?? [];
  const items = itemData ?? [];
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const directory = (team ?? []) as { user_id: string; full_name: string | null; email: string }[];
  const names = await teamNames(logPeople(log));
  const name = (id: string | null) => (id ? (names.get(id) ?? "Former team member") : "-");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/inventory" className="text-xs text-muted underline">← Inventory</Link>
        <h1 className="mt-1 font-display text-3xl">Inventory history</h1>
        <p className="text-sm text-muted">Everything that happened to every item: added, edited, moved, counted, checked out, returned, lost, handed on, retired. Newest first{log.length === LIMIT && ` (latest ${LIMIT})`}.</p>
      </div>

      <FilterForm className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label text-xs" htmlFor="ih-item">Item</label>
          <select id="ih-item" name="item" defaultValue={sp.item ?? ""} className="input">
            <option value="">All items</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="ih-action">What</label>
          <select id="ih-action" name="action" defaultValue={sp.action ?? ""} className="input">
            <option value="">Anything</option>
            {(Object.keys(INVENTORY_ACTION_LABEL) as InventoryAction[]).map((a) => <option key={a} value={a}>{INVENTORY_ACTION_LABEL[a]}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="ih-who">Done by</label>
          <select id="ih-who" name="who" defaultValue={sp.who ?? ""} className="input">
            <option value="">Anyone</option>
            {directory.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name ?? p.email}</option>)}
          </select>
        </div>
      </FilterForm>

      {log.length === 0 ? (
        <p className="card py-8 text-center text-sm text-muted">Nothing here yet.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="sheet min-w-[44rem]">
            <thead><tr><th>When</th><th>Item</th><th>What happened</th></tr></thead>
            <tbody>
              {log.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted tabular-nums">{formatDateTime(e.created_at)}</td>
                  <td className="whitespace-nowrap"><Link href={`/inventory/${e.item_id}`} className="font-medium hover:underline">{itemName.get(e.item_id) ?? "Item"}</Link></td>
                  <td><LogText e={e} name={name} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
