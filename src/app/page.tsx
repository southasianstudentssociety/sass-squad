import Link from "next/link";
import { ArrowRight, Images } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { EVENT_COLUMNS, hoursAgoIso } from "@/lib/events";
import { SITE } from "@/lib/site";
import type { SassEvent } from "@/lib/types";
import { EventCard } from "@/components/event-card";
import { EmptyState, Illustration } from "@/components/illustrations";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { GalleryStrip } from "@/components/gallery-strip";
import { galleryItems } from "@/lib/gallery";

export default async function Home() {
  const supabase = await createClient();
  const [session, { data }, photos] = await Promise.all([
    getSession(),
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("is_published", true)
      .gte("starts_at", hoursAgoIso(12))
      .order("starts_at")
      .limit(3)
      .returns<SassEvent[]>(),
    galleryItems(),
  ]);
  const events = data ?? [];
  const firstName = session?.profile.full_name?.split(" ")[0];

  return (
    <div className="space-y-16 sm:space-y-20">
      <section className="grid items-center gap-10 pt-2 sm:grid-cols-[1.2fr_1fr] sm:pt-6">
        <Reveal>
          <p className="eyebrow">{firstName ? `Welcome back, ${firstName}` : SITE.fullName}</p>
          <h1 className="mt-4 max-w-lg font-display text-4xl leading-[1.08] text-ink sm:text-[3.4rem]">
            Every SASS night, <span className="text-brand">one tap away.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
            Get your ticket, pay by FPS, and walk in with a QR code. Members get their price automatically.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/events" className="btn-primary group px-5">
              See events
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href={session ? "/tickets" : "/login"} className="btn-ghost px-5">
              {session ? "My tickets" : "Log in"}
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.08} className="hidden sm:block">
          <Illustration name="celebration" className="mx-auto w-full max-w-sm" />
        </Reveal>
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-2xl text-ink">Coming up</h2>
          <Link href="/events" className="group flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
            All events <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
        {events.length === 0 ? (
          <div className="card">
            <EmptyState illustration="events" title="Nothing announced yet">
              New events land here first. Keep an eye on our Instagram too.
            </EmptyState>
          </div>
        ) : (
          <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => <StaggerItem key={e.id}><EventCard event={e} /></StaggerItem>)}
          </Stagger>
        )}
      </section>

      {photos.length > 0 && (
        <section className="pb-10 sm:pb-12">
          <div className="mb-6 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-ink">Gallery</h2>
              <p className="mt-1 text-sm text-muted">Moments from past SASS nights.</p>
            </div>
            <a href={SITE.photosUrl} target="_blank" rel="noreferrer" className="btn-ghost shrink-0">
              <Images className="size-4" aria-hidden />View all photos
            </a>
          </div>
          <GalleryStrip items={photos} />
        </section>
      )}
    </div>
  );
}
