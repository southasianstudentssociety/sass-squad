import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { EVENT_COLUMNS, hoursAgoIso } from "@/lib/events";
import { SITE } from "@/lib/site";
import type { SassEvent } from "@/lib/types";
import { EventCard } from "@/components/event-card";

export default async function Home() {
  const supabase = await createClient();
  const [session, { data }] = await Promise.all([
    getSession(),
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("is_published", true)
      .gte("starts_at", hoursAgoIso(12))
      .order("starts_at")
      .limit(3)
      .returns<SassEvent[]>(),
  ]);
  const events = data ?? [];

  return (
    <div className="space-y-12">
      <section className="overflow-hidden rounded-3xl bg-brand px-6 py-12 text-brand-ink sm:px-10 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">{SITE.fullName}</p>
        <h1 className="mt-3 max-w-xl text-4xl font-extrabold leading-tight sm:text-5xl">
          Events, tickets and everything SASS, in one place.
        </h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/events" className="btn-accent">See upcoming events</Link>
          {session ? (
            <Link href="/tickets" className="btn border border-white/30 text-brand-ink hover:bg-white/10">My tickets</Link>
          ) : (
            <Link href="/login" className="btn border border-white/30 text-brand-ink hover:bg-white/10">Log in / sign up</Link>
          )}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-extrabold">Coming up</h2>
          <Link href="/events" className="text-sm underline">All events</Link>
        </div>
        {events.length === 0 ? (
          <p className="text-muted">Nothing announced yet.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        )}
      </section>
    </div>
  );
}
