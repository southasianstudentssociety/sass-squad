import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { hoursAgoIso } from "@/lib/events";

export const metadata = { title: "Scan" };

export default async function ScanIndex() {
  await requireStaff("/scan");
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at, venue, is_published")
    .gte("starts_at", hoursAgoIso(48))
    .order("starts_at")
    .limit(20);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-extrabold">Scan mode: choose event</h1>
      <ul className="space-y-3">
        {(data ?? []).map((e) => (
          <li key={e.id}>
            <Link href={`/scan/${e.id}`} className="card block hover:shadow-md">
              <p className="font-bold">{e.title} {!e.is_published && <span className="badge bg-warn/10 text-warn">Draft</span>}</p>
              <p className="text-sm text-muted">{formatDateTime(e.starts_at)}{e.venue && ` · ${e.venue}`}</p>
            </Link>
          </li>
        ))}
        {(data ?? []).length === 0 && <p className="text-muted">No upcoming events.</p>}
      </ul>
    </div>
  );
}
