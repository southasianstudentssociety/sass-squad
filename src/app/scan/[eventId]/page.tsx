import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { scanWindow } from "@/lib/events";
import { formatDateTime } from "@/lib/format";
import { getCounts } from "../actions";
import { ScanConsole } from "./scan-console";

export const metadata = { title: "Scanning" };

export default async function ScanEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const session = await requireStaff(`/scan/${eventId}`);
  const isAdmin = session.access.isAdmin;
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, public_price_cents, member_price_cents")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) notFound();

  const win = scanWindow(event);
  if (!isAdmin && !win.open) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <Link href="/scan" className="text-xs text-muted underline">← Events</Link>
        <h1 className="font-display text-2xl font-normal">{event.title}</h1>
        <p className="card text-sm">
          {win.upcoming
            ? <>Scanning opens <strong>{formatDateTime(win.opensAt)}</strong> (24 hours before the event).</>
            : <>Scanning for this event closed {formatDateTime(win.closesAt)}. Ask an admin if you need the guest list.</>}
        </p>
      </div>
    );
  }

  const counts = await getCounts(eventId);
  return (
    <ScanConsole
      eventId={event.id}
      title={event.title}
      defaultWalkInDollars={(event.public_price_cents / 100).toFixed(2)}
      initialCounts={counts}
      isAdmin={isAdmin}
    />
  );
}
