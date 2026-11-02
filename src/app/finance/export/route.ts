import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { financeClaims } from "@/lib/claim-data";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { PAYOUT_METHODS } from "@/lib/claims";
import { todayInHongKong } from "@/lib/format";

// Treasurer's record of every claim: one row per claim, current version, with who approved and paid it.
export async function GET() {
  const session = await getSession();
  if (!session?.access.isFinance) return new NextResponse("Forbidden", { status: 403 });

  const claims = await financeClaims();
  const supabase = await createClient();
  const eventIds = [...new Set(claims.map((c) => c.current.event_id).filter(Boolean))] as string[];
  const actorIds = [...new Set(claims.flatMap((c) => c.claim_events.map((e) => e.actor_id)).filter(Boolean))] as string[];
  const [{ data: events }, { data: actors }] = await Promise.all([
    eventIds.length
      ? supabase.from("events").select("id, title").in("id", eventIds).returns<{ id: string; title: string }[]>()
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    actorIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", actorIds).returns<{ id: string; full_name: string | null; email: string }[]>()
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
  ]);
  const eventTitle = (id: string | null) => (events ?? []).find((e) => e.id === id)?.title ?? "";
  const who = (id: string | null) => {
    const p = (actors ?? []).find((a) => a.id === id);
    return p ? (p.full_name ?? p.email) : "";
  };

  const csv = toCsv([
    ["Reference", "Status", "Claimant", "Claimant email", "Event", "Description", "Amount (HK$)", "Pay by", "Payment details",
      "Version", "Submitted at", "Approved by", "Approved at", "Paid by", "Paid at", "Payment reference", "Last rejection reason", "Self-approved"],
    ...[...claims].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((c) => {
      const events = [...c.claim_events].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const approved = events.filter((e) => e.to_status === "approved").at(-1);
      const paid = events.filter((e) => e.to_status === "paid").at(-1);
      const rejected = events.filter((e) => e.to_status === "rejected").at(-1);
      return [
        c.reference, c.status, c.claimant?.full_name ?? "", c.claimant?.email ?? "", eventTitle(c.current.event_id),
        c.current.description, (c.current.amount_cents / 100).toFixed(2), PAYOUT_METHODS[c.current.payout_method].label,
        c.current.payout_details ?? "", c.current_revision, c.created_at,
        who(approved?.actor_id ?? null), approved?.created_at ?? "", who(paid?.actor_id ?? null), paid?.created_at ?? "",
        paid?.note ?? "", rejected?.note ?? "",
        events.some((e) => e.by_claimant) ? "yes" : "",
      ];
    }),
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sass-claims-${todayInHongKong()}.csv"`,
    },
  });
}
