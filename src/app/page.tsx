import Link from "next/link";
import { ArrowRight, Images } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { EVENT_COLUMNS, hoursAgoIso } from "@/lib/events";
import { SITE } from "@/lib/site";
import type { SassEvent } from "@/lib/types";
import { Illustration } from "@/components/illustrations";
import { Reveal } from "@/components/motion";
import { NowShowing, type HomeEvent } from "@/components/home-marquee";
import { formatPrice, TIME_ZONE, todayInHongKong } from "@/lib/format";
import { GalleryStrip } from "@/components/gallery-strip";
import { galleryAlbums, homeStripItems } from "@/lib/gallery";
import { activePhotoBanner } from "@/lib/albums";
import { PhotoBanner } from "@/components/photo-banner";
import { RateEventCard } from "@/components/rate-event-card";
import { feedbackOpen } from "@/lib/feedback";
import { GradientBackdrop } from "@/components/gradient-backdrop";

export default async function Home() {
  const supabase = await createClient();
  const banner = activePhotoBanner();
  const [session, { data }, photos, albums] = await Promise.all([
    getSession(),
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("is_published", true)
      .gte("starts_at", hoursAgoIso(12))
      .order("starts_at")
      .limit(3)
      .returns<SassEvent[]>(),
    homeStripItems(),
    banner ? galleryAlbums() : Promise.resolve([]),
  ]);
  const bannerAlbum = banner ? albums.find((a) => a.slug === banner.eventSlug) : undefined;
  const rate = banner && session ? await rateCardFor(banner.eventSlug, session.userId) : null;
  const events = data ?? [];
  const firstName = session?.profile.full_name?.split(" ")[0];
  const today = todayInHongKong();
  const showing = events.map((e) => toHomeEvent(e, today));

  return (
    <div className="space-y-14 sm:space-y-20">
      <GradientBackdrop />
      {banner && (bannerAlbum || rate) && (
        <div className="flex flex-col gap-3 empty:hidden sm:gap-4">
          {bannerAlbum && (
            <PhotoBanner slug={bannerAlbum.slug} eyebrow={banner.eyebrow} headline={banner.headline} cta={banner.cta} covers={bannerAlbum.covers} />
          )}
          {rate && <RateEventCard eventId={rate.eventId} eventName={banner.eyebrow} firstName={firstName} />}
        </div>
      )}
      <section className="grid grid-cols-1 items-center gap-10 pt-2 sm:pt-6 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
        <Reveal>
          <p className="eyebrow">{firstName ? `Welcome back, ${firstName}` : SITE.fullName}</p>
          <h1 className="mt-4 max-w-lg font-display text-[2.6rem] leading-[1.05] text-ink sm:text-[3.6rem]">
            Every SASS night, <span className="font-brand text-brand">one tap away.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink/70">
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
        {showing.length > 0 ? (
          <NowShowing events={showing} />
        ) : (
          <Reveal delay={0.08} className="hidden text-center lg:block">
            <Illustration name="celebration" className="mx-auto w-full max-w-sm" />
            <p className="mt-4 text-sm text-muted">Nothing announced yet. New events land here first.</p>
          </Reveal>
        )}
      </section>

      {photos.length > 0 && (
        <section className="pb-10 sm:pb-12">
          <div className="mb-6 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-ink sm:text-3xl">Gallery</h2>
              <p className="mt-1 text-sm text-muted">Moments from past SASS nights.</p>
            </div>
            <Link href="/gallery" className="btn-ghost shrink-0">
              <Images className="size-4" aria-hidden />See the gallery
            </Link>
          </div>
          <GalleryStrip items={photos} />
        </section>
      )}
    </div>
  );
}

/**
 * The "How was it?" card under the banner: only for someone checked in to the
 * banner's event, while feedback is open (30 days), who hasn't rated it yet.
 * The same rules are enforced again by submit_feedback.
 */
async function rateCardFor(eventSlug: string, userId: string): Promise<{ eventId: string } | null> {
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, starts_at").eq("slug", eventSlug).maybeSingle<{ id: string; starts_at: string }>();
  if (!event || !feedbackOpen(event.starts_at)) return null;
  const [{ data: ticket }, { data: rated }] = await Promise.all([
    supabase.from("tickets").select("id").eq("event_id", event.id).eq("user_id", userId).not("checked_in_at", "is", null).limit(1).maybeSingle(),
    supabase.from("event_feedback").select("id").eq("event_id", event.id).maybeSingle(),
  ]);
  return ticket && !rated ? { eventId: event.id } : null;
}

const part = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-HK", { timeZone: TIME_ZONE, ...o }).format(new Date(iso));

function toHomeEvent(e: SassEvent, today: string): HomeEvent {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(e.starts_at)); // YYYY-MM-DD
  const daysAway = Math.round((Date.parse(day) - Date.parse(today)) / 86_400_000);
  const free = e.member_price_cents === 0 && (e.access === "members_only" || e.public_price_cents === 0);
  const price = e.sold_out
    ? null
    : free
      ? (e.access === "members_only" ? "Free for members" : null)
      : `${formatPrice(e.member_price_cents).replace(".00", "")} members`;
  return {
    slug: e.slug,
    title: e.title,
    venue: e.venue,
    when: `${part(e.starts_at, { weekday: "short" })} · ${part(e.starts_at, { hour: "numeric", minute: "2-digit" })}`,
    day: part(e.starts_at, { day: "numeric" }),
    month: part(e.starts_at, { month: "short" }),
    daysAway,
    price,
    label: e.sold_out ? "sold_out" : e.access === "members_only" ? "members" : free ? "free" : null,
  };
}
