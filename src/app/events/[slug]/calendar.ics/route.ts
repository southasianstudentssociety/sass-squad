import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { icsFor } from "@/lib/calendar-file";

// Calendar file for "Add to calendar". Same visibility as the event page (published, or staff).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("events")
    .select("title, slug, starts_at, ends_at, venue, description")
    .eq("slug", slug)
    .maybeSingle<{ title: string; slug: string; starts_at: string; ends_at: string | null; venue: string | null; description: string | null }>();
  if (!e) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(icsFor(e, new Date().toISOString()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${e.slug}.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
