import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { Ticket } from "@/lib/types";
import { PrintButton } from "./print-button";

export const metadata = { title: "Guest list" };

export default async function PrintList({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: event }, { data: tickets }] = await Promise.all([
    supabase.from("events").select("title, starts_at").eq("id", id).maybeSingle<{ title: string; starts_at: string }>(),
    supabase.from("tickets").select("*").eq("event_id", id).neq("status", "cancelled").order("holder_name").returns<Ticket[]>(),
  ]);
  if (!event) notFound();
  const rows = tickets ?? [];

  return (
    <div className="bg-white text-black">
      <div className="mb-4 flex items-end justify-between print:mb-2">
        <div>
          <h1 className="text-xl font-bold">{event.title}: guest list</h1>
          <p className="text-sm">{formatDateTime(event.starts_at)} · {rows.length} tickets · printed {formatDateTime(new Date().toISOString())}</p>
        </div>
        <PrintButton />
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="w-8 py-1">✓</th><th>Name</th><th>Type</th><th>Status</th><th>Ref</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-gray-300">
              <td className="py-1.5"><span className="inline-block h-4 w-4 border border-black text-center leading-3">{t.checked_in_at ? "✓" : ""}</span></td>
              <td className="font-semibold">{t.holder_name}</td>
              <td>{t.is_member ? "Member" : "Non-member"} {formatPrice(t.price_pence)}</td>
              <td>{t.status === "awaiting_payment" ? "UNPAID" : "OK"}</td>
              <td className="font-mono text-xs">{t.payment_reference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
