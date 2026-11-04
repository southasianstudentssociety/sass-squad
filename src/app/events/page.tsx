import { createClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS, hoursAgoIso } from "@/lib/events";
import type { SassEvent } from "@/lib/types";
import { EventCard } from "@/components/event-card";
import { EmptyState } from "@/components/illustrations";
import { Stagger, StaggerItem } from "@/components/motion";
import { GradientBackdrop } from "@/components/gradient-backdrop";

export const metadata = { title: "Events" };

const PAST_LIMIT = 24;

export default async function EventsPage() {
  const supabase = await createClient();
  // An event stays "upcoming" until 12 hours after it starts, so it's still here on the night.
  const cutoff = hoursAgoIso(12);
  const [{ data: upcomingData }, { data: pastData }] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).eq("is_published", true).gte("starts_at", cutoff).order("starts_at").returns<SassEvent[]>(),
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("is_published", true)
      .lt("starts_at", cutoff)
      .order("starts_at", { ascending: false })
      .limit(PAST_LIMIT)
      .returns<SassEvent[]>(),
  ]);
  const events = upcomingData ?? [];
  const past = pastData ?? [];

  return (
    <div className="space-y-14">
      <GradientBackdrop />
      <section className="space-y-8">
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
      </section>

      {past.length > 0 && (
        <section className="space-y-6 border-t border-ink/10 pt-10">
          <div>
            <h2 className="font-display text-2xl">Previous events</h2>
            <p className="mt-1 text-sm text-muted">What we&apos;ve been up to.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((e) => <EventCard key={e.id} event={e} past />)}
          </div>
        </section>
      )}
    </div>
  );
}
