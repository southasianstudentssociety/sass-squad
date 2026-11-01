import { createClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS, hoursAgoIso } from "@/lib/events";
import type { SassEvent } from "@/lib/types";
import { EventCard } from "@/components/event-card";
import { EmptyState } from "@/components/illustrations";
import { Stagger, StaggerItem } from "@/components/motion";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("is_published", true)
    .gte("starts_at", hoursAgoIso(12))
    .order("starts_at")
    .returns<SassEvent[]>();
  const events = data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">What&apos;s on</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl">Upcoming events</h1>
      </div>
      {events.length === 0 ? (
        <div className="card">
          <EmptyState illustration="events" title="Nothing announced yet">New events land here first. Keep an eye on our Instagram too.</EmptyState>
        </div>
      ) : (
        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => <StaggerItem key={e.id}><EventCard event={e} /></StaggerItem>)}
        </Stagger>
      )}
    </div>
  );
}
