import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import type { Ticket } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.access.isAdmin) return new NextResponse("Forbidden", { status: 403 });

  const supabase = await createClient();
  const [{ data: event }, { data: tickets }, { data: meals }] = await Promise.all([
    supabase.from("events").select("slug").eq("id", id).maybeSingle<{ slug: string }>(),
    supabase.from("tickets").select("*").eq("event_id", id).neq("status", "cancelled").order("holder_name").returns<Ticket[]>(),
    supabase.from("event_meal_options").select("id, label").eq("event_id", id).returns<{ id: string; label: string }[]>(),
  ]);
  const { data: refData } = await supabase.rpc("event_referrals", { p_event_id: id });
  const referredBy = new Map(((refData as { ticket_id: string; referrer: string }[] | null) ?? []).map((r) => [r.ticket_id, r.referrer]));
  if (!event) return new NextResponse("Not found", { status: 404 });
  const mealName = new Map((meals ?? []).map((m) => [m.id, m.label]));

  const csv = toCsv([
    ["Name", "Email", "Member", "Status", "Price (HK$)", "Meal", "Referred by", "Reference", "Source", "Checked in at", "Notes"],
    ...(tickets ?? []).map((t) => [
      t.holder_name, t.holder_email, t.team_rate ? "team" : t.is_member ? "yes" : "no", t.status, (t.price_cents / 100).toFixed(2),
      t.meal_option_id ? mealName.get(t.meal_option_id) ?? "" : "", referredBy.get(t.id) ?? "", t.payment_reference, t.source, t.checked_in_at ?? "", t.notes ?? "",
    ]),
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-guest-list.csv"`,
    },
  });
}
