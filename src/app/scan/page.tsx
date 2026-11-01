import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { hoursAgoIso, scanWindow } from "@/lib/events";
import { EmptyState } from "@/components/illustrations";

export const metadata = { title: "Scan" };

export default async function ScanIndex() {
  const session = await requireStaff("/scan");
  const isAdmin = session.access.isAdmin;
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, venue, is_published")
    .gte("starts_at", hoursAgoIso(48))
    .order("starts_at")
    .limit(20);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-display font-normal">Scan mode: choose event</h1>
      <ul className="space-y-3">
        {(data ?? []).map((e) => (
          <li key={e.id}>
            <Link href={`/scan/${e.id}`} className="card-link block">
              <p className="font-bold">{e.title} {!e.is_published && <span className="badge bg-warn/10 text-warn">Draft</span>}</p>
              <p className="text-sm text-muted">{formatDateTime(e.starts_at)}{e.venue && ` · ${e.venue}`}</p>
              {!isAdmin && !scanWindow(e).open && (
                <p className="mt-1 text-xs text-muted">
                  {scanWindow(e).upcoming ? `Scanning opens ${formatDateTime(scanWindow(e).opensAt)}` : "Scanning closed"}
                </p>
              )}
            </Link>
          </li>
        ))}
        {(data ?? []).length === 0 && (
          <li className="card"><EmptyState illustration="scan" title="No upcoming events">Events show here from 48 hours before they start.</EmptyState></li>
        )}
      </ul>
    </div>
  );
}
