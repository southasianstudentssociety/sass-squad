import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import type { Ticket } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session?.profile.role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const supabase = await createClient();
  const [{ data: event }, { data: tickets }] = await Promise.all([
    supabase.from("events").select("slug").eq("id", id).maybeSingle<{ slug: string }>(),
    supabase.from("tickets").select("*").eq("event_id", id).neq("status", "cancelled").order("holder_name").returns<Ticket[]>(),
  ]);
  if (!event) return new NextResponse("Not found", { status: 404 });

  const csv = toCsv([
    ["Name", "Email", "Member", "Status", "Price (HK$)", "Reference", "Source", "Checked in at", "Notes"],
    ...(tickets ?? []).map((t) => [
      t.holder_name, t.holder_email, t.is_member ? "yes" : "no", t.status, (t.price_cents / 100).toFixed(2),
      t.payment_reference, t.source, t.checked_in_at ?? "", t.notes ?? "",
    ]),
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-guest-list.csv"`,
    },
  });
}
