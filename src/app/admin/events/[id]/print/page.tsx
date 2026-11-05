import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { Ticket } from "@/lib/types";
import { PrintButton } from "./print-button";

export const metadata = { title: "Guest list" };

export default async function PrintList({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: event }, { data: tickets }, { data: meals }] = await Promise.all([
    supabase.from("events").select("title, starts_at, meals_enabled").eq("id", id).maybeSingle<{ title: string; starts_at: string; meals_enabled: boolean }>(),
    supabase.from("tickets").select("*").eq("event_id", id).neq("status", "cancelled").order("holder_name").returns<Ticket[]>(),
    supabase.from("event_meal_options").select("id, label").eq("event_id", id).returns<{ id: string; label: string }[]>(),
  ]);
  if (!event) notFound();
  const mealName = new Map((meals ?? []).map((m) => [m.id, m.label]));
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
            <th className="w-8 py-1">✓</th><th>Name</th><th>Type</th>{event.meals_enabled && <th>Meal</th>}<th>Status</th><th>Ref</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-gray-300">
              <td className="py-1.5"><span className="inline-block h-4 w-4 border border-black text-center leading-3">{t.checked_in_at ? "✓" : ""}</span></td>
              <td className="font-semibold">{t.holder_name}</td>
              <td>{t.is_member ? "Member" : "Non-member"} {formatPrice(t.price_cents)}</td>
              {event.meals_enabled && <td>{t.meal_option_id ? mealName.get(t.meal_option_id) ?? "-" : "-"}</td>}
              <td>{t.status === "awaiting_payment" ? "UNPAID" : "OK"}</td>
              <td className="font-mono text-xs">{t.payment_reference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
