import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Admin" };

type Row = { id: string; title: string; starts_at: string; is_published: boolean; capacity: number | null; tickets: { status: string; checked_in_at: string | null }[] };

export default async function AdminHome() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at, is_published, capacity, tickets(status, checked_in_at)")
    .order("starts_at", { ascending: false })
    .returns<Row[]>();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Events</h1>
        <Link href="/admin/events/new" className="btn-primary">New event</Link>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Event</th><th>When</th><th>Confirmed</th><th>Unpaid</th><th>Checked in</th><th></th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((e) => {
              const confirmed = e.tickets.filter((t) => t.status === "confirmed").length;
              const unpaid = e.tickets.filter((t) => t.status === "awaiting_payment").length;
              const inn = e.tickets.filter((t) => t.checked_in_at).length;
              return (
                <tr key={e.id}>
                  <td className="font-semibold">
                    {e.title} {!e.is_published && <span className="badge bg-warn/10 text-warn">Draft</span>}
                  </td>
                  <td className="whitespace-nowrap">{formatDateTime(e.starts_at)}</td>
                  <td>{confirmed}{e.capacity ? ` / ${e.capacity}` : ""}</td>
                  <td>{unpaid > 0 ? <span className="font-semibold text-warn">{unpaid}</span> : 0}</td>
                  <td>{inn}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/admin/events/${e.id}`} className="underline">Manage</Link>
                  </td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 && (
              <tr><td colSpan={6} className="text-muted">No events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
