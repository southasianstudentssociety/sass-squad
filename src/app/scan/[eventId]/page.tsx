import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCounts } from "../actions";
import { ScanConsole } from "./scan-console";

export const metadata = { title: "Scanning" };

export default async function ScanEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const session = await requireStaff(`/scan/${eventId}`);
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, title, public_price_cents, member_price_cents")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) notFound();
  const counts = await getCounts(eventId);

  return (
    <ScanConsole
      eventId={event.id}
      title={event.title}
      defaultWalkInDollars={(event.public_price_cents / 100).toFixed(2)}
      initialCounts={counts}
      isAdmin={session.profile.role === "admin"}
    />
  );
}
