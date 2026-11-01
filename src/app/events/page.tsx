import { createClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS, hoursAgoIso } from "@/lib/events";
import type { SassEvent } from "@/lib/types";
import { EventCard } from "@/components/event-card";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const supabase = await createClient();
  const since = hoursAgoIso(12);
  const { data } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("is_published", true)
    .gte("starts_at", since)
    .order("starts_at")
    .returns<SassEvent[]>();
  const events = data ?? [];

  return (
    <div>
      <h1 className="mb-6 text-3xl font-display font-normal">Upcoming events</h1>
      {events.length === 0 ? (
        <p className="text-muted">Nothing announced yet. Watch our Instagram.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}
