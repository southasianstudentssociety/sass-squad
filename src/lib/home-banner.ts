import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayInHongKong } from "@/lib/format";

export type HomeBanner = {
  event_id: string;
  theme: string;
  eyebrow: string;
  headline: string;
  blurb: string;
  cta: string;
  ends_at: string;
  updated_at: string;
  event: { slug: string; title: string; starts_at: string };
};

/** The saved home banner (Admin -> Gallery), whether or not it's still running. */
export async function savedHomeBanner(): Promise<HomeBanner | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("home_banner")
    .select("event_id, theme, eyebrow, headline, blurb, cta, ends_at, updated_at, event:events!inner(slug, title, starts_at)")
    .maybeSingle<HomeBanner>();
  return data ?? null;
}

/** The home banner while it's running (before its "show until"), otherwise null. */
export async function activeHomeBanner(): Promise<HomeBanner | null> {
  const banner = await savedHomeBanner();
  return banner && Date.now() < Date.parse(banner.ends_at) ? banner : null;
}

/** For the admin form: whether the banner is still running, and its "show until" as a Hong Kong date. */
export function bannerSchedule(endsAt: string): { live: boolean; until: string } {
  return { live: Date.now() < Date.parse(endsAt), until: todayInHongKong(new Date(endsAt)) };
}

/** A new banner's "show until": two weeks from today. */
export function defaultBannerUntil(): string {
  return todayInHongKong(new Date(Date.now() + 14 * 86_400_000));
}
