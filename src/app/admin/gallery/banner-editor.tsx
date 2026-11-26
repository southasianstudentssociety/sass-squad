"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { PhotoBanner } from "@/components/photo-banner";
import { SubmitButton } from "@/components/submit-button";
import { BANNER_DEFAULTS, BANNER_THEMES, bannerTheme } from "@/lib/banner-themes";
import { cn } from "@/lib/utils";
import { clearHomeBanner, saveHomeBanner } from "./actions";

type Cover = { id: string; src: string; alt: string };
export type BannerEvent = { id: string; slug: string; label: string; date: string; covers: Cover[] };
export type SavedBanner = {
  eventId: string;
  theme: string;
  eyebrow: string;
  headline: string;
  blurb: string;
  cta: string;
  /** YYYY-MM-DD, Hong Kong. */
  until: string;
  live: boolean;
  untilText: string;
};

/**
 * Admin -> Gallery: which album the home page "It's a Wrap" banner announces,
 * its theme and wording, and until when. The preview underneath is the real
 * banner, so what you see is what goes on the home page.
 */
export function BannerEditor({ events, saved, defaultUntil }: { events: BannerEvent[]; saved: SavedBanner | null; defaultUntil: string }) {
  const withPhotos = events.filter((e) => e.covers.length > 0);
  const first = saved ? events.find((e) => e.id === saved.eventId) : withPhotos[0];
  const [eventId, setEventId] = useState(first?.id ?? "");
  const [theme, setTheme] = useState(bannerTheme(saved?.theme).id);
  const [eyebrow, setEyebrow] = useState(saved?.eyebrow ?? first?.label ?? "");
  const [headline, setHeadline] = useState(saved?.headline ?? BANNER_DEFAULTS.headline);
  const [blurb, setBlurb] = useState(saved?.blurb ?? BANNER_DEFAULTS.blurb);
  const [cta, setCta] = useState(saved?.cta ?? BANNER_DEFAULTS.cta);
  const [until, setUntil] = useState(saved?.until ?? defaultUntil);
  const [previewKey, setPreviewKey] = useState(0);
  const event = events.find((e) => e.id === eventId);

  function pickEvent(id: string) {
    const next = events.find((e) => e.id === id);
    // Keep a label someone typed; follow the event if it was still the old event's name.
    if (!eyebrow.trim() || eyebrow === event?.label) setEyebrow(next?.label ?? "");
    setEventId(id);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm">
        {saved?.live ? (
          <>
            <span className="mr-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Live</span>
            On the home page until {saved.untilText}.
          </>
        ) : saved ? (
          <>
            <span className="mr-2 rounded-full bg-ink/10 px-2 py-0.5 text-xs font-semibold text-muted">Ended</span>
            Stopped showing on {saved.untilText}. Pick a later date and save to bring it back.
          </>
        ) : (
          <>
            <span className="mr-2 rounded-full bg-ink/10 px-2 py-0.5 text-xs font-semibold text-muted">Off</span>
            No banner on the home page. Set one up below.
          </>
        )}
      </p>

      <form action={saveHomeBanner} className="card space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="b-event">Album</label>
            <select id="b-event" name="event_id" required value={eventId} onChange={(e) => pickEvent(e.target.value)} className="input">
              <option value="" disabled>Pick an event</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label} · {e.date}{e.covers.length === 0 ? " (no photos yet)" : ""}
                </option>
              ))}
            </select>
            {event && event.covers.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">This album has no photos yet. The banner stays hidden until you upload some.</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="b-until">Show until (end of that day)</label>
            <input id="b-until" name="until" type="date" required value={until} onChange={(e) => setUntil(e.target.value)} className="input" />
          </div>
        </div>

        <fieldset>
          <legend className="label">Theme</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {BANNER_THEMES.map((t) => (
              <label
                key={t.id}
                className={cn(
                  "cursor-pointer rounded-xl border p-2 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                  theme === t.id ? "border-ink ring-1 ring-ink" : "border-ink/10 hover:border-ink/30",
                )}
              >
                <input type="radio" name="theme" value={t.id} checked={theme === t.id} onChange={() => setTheme(t.id)} className="sr-only" />
                <span className="block h-12 rounded-lg" style={{ background: t.swatch }} aria-hidden />
                <span className="mt-1.5 block text-sm font-medium text-ink">{t.name}</span>
                <span className="block text-xs text-muted">{t.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="b-eyebrow">Small label</label>
            <input id="b-eyebrow" name="eyebrow" required maxLength={40} value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="Diwali 2026" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="b-headline">Headline</label>
            <input id="b-headline" name="headline" required maxLength={40} value={headline} onChange={(e) => setHeadline(e.target.value)} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="b-blurb">Line under the headline</label>
            <input id="b-blurb" name="blurb" required maxLength={160} value={blurb} onChange={(e) => setBlurb(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="b-cta">Button</label>
            <input id="b-cta" name="cta" required maxLength={30} value={cta} onChange={(e) => setCta(e.target.value)} className="input" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingText="Saving…">{saved ? "Save banner" : "Put it on the home page"}</SubmitButton>
          <p className="text-xs text-muted">
            The photos are the album&rsquo;s covers: pick them with <span className="font-medium text-ink">Cover</span> on each photo below.
            People who closed the banner for this event won&rsquo;t see it again; a different event shows to everyone.
          </p>
        </div>
      </form>

      {saved && (
        <form action={clearHomeBanner}>
          <SubmitButton className="btn-ghost text-sm" pendingText="Turning off…">Turn the banner off now</SubmitButton>
        </form>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted"><Eye className="size-4" aria-hidden />Preview</h3>
          <button type="button" onClick={() => setPreviewKey((k) => k + 1)} className="text-xs text-muted underline hover:text-ink">
            Replay
          </button>
        </div>
        {event && event.covers.length > 0 ? (
          <PhotoBanner
            key={previewKey}
            preview
            slug={event.slug}
            theme={theme}
            eyebrow={eyebrow || "Label"}
            headline={headline || "Headline"}
            blurb={blurb}
            cta={cta || "Button"}
            covers={event.covers}
          />
        ) : (
          <p className="card p-6 text-center text-sm text-muted">Pick an album with photos to see the preview.</p>
        )}
      </div>
    </div>
  );
}
