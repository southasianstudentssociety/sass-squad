import "server-only";
import { createClient } from "@/lib/supabase/server";

export type GalleryPhoto = {
  id: string;
  path: string;
  caption: string | null;
  event_id: string | null;
  created_at: string;
  hidden_at: string | null;
  on_home: boolean;
  /** 1-6 when ExCo picked it as one of its album's covers, in pick order. */
  cover_rank: number | null;
};

export type GalleryItem = { id: string; src: string; alt: string };

/** One event's visible photos in upload order (the order ExCo picked), for its event page strip. */
export async function galleryItems(limit: number, eventId: string): Promise<GalleryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gallery_photos")
    .select("id, path, caption, event:events(title)")
    .is("hidden_at", null)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<(Pick<GalleryPhoto, "id" | "path" | "caption"> & { event: { title: string } | null })[]>();
  return (data ?? []).map((p) => ({
    id: p.id,
    src: supabase.storage.from("gallery").getPublicUrl(p.path).data.publicUrl,
    alt: p.caption ?? (p.event ? `${p.event.title}, SASS` : "A SASS event"),
  }));
}

type MixRow = Pick<GalleryPhoto, "id" | "event_id" | "created_at" | "on_home"> & { event: { starts_at: string } | null };

/**
 * Which photos the home page strip shows, as ids in display order: an equal
 * mix of every event, one photo from each in turn (most recent event first)
 * until `limit`. An event with photos ticked "Home" in Admin -> Gallery only
 * offers those; otherwise its first-uploaded ones. When an event runs out,
 * the others fill its places. Photos with no event count as one group.
 */
export function homeMix(rows: MixRow[], limit: number): string[] {
  const groups = new Map<string, { when: string; all: MixRow[] }>();
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = r.event_id ?? "none";
    const g = groups.get(key) ?? { when: r.event?.starts_at ?? r.created_at, all: [] };
    g.all.push(r);
    if (!r.event && r.created_at > g.when) g.when = r.created_at;
    groups.set(key, g);
  }
  const queues = [...groups.values()]
    .sort((a, b) => b.when.localeCompare(a.when))
    .map((g) => (g.all.some((r) => r.on_home) ? g.all.filter((r) => r.on_home) : g.all));
  const out: string[] = [];
  for (let round = 0; out.length < limit; round++) {
    const before = out.length;
    for (const q of queues) if (round < q.length && out.length < limit) out.push(q[round].id);
    if (out.length === before) break;
  }
  return out;
}

/** How many photos the home page strip shows. */
export const HOME_STRIP_COUNT = 24;

/** The home page strip: an equal mix of events (see homeMix). */
export async function homeStripItems(limit = HOME_STRIP_COUNT): Promise<GalleryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gallery_photos")
    .select("id, path, caption, event_id, created_at, on_home, event:events(title, starts_at)")
    .is("hidden_at", null)
    .limit(2000)
    .returns<(MixRow & Pick<GalleryPhoto, "path" | "caption"> & { event: { title: string; starts_at: string } | null })[]>();
  const rows = data ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return homeMix(rows, limit).map((id) => {
    const p = byId.get(id)!;
    return {
      id: p.id,
      src: supabase.storage.from("gallery").getPublicUrl(p.path).data.publicUrl,
      alt: p.caption ?? (p.event ? `${p.event.title}, SASS` : "A SASS event"),
    };
  });
}

export type Album = {
  slug: string;
  title: string;
  startsAt: string;
  count: number;
  /** Up to 6 photos, most important first: the first 3 make the album card, all 6 the home banner. */
  covers: GalleryItem[];
};

/** How many covers an album has: 3 on its card and page, 6 on the home banner. */
export const COVER_COUNT = 6;

/**
 * An album's covers, most important first: the photos ExCo picked (in the
 * order they picked them), then its first uploads to fill the rest.
 * `rows` must be in upload order.
 */
export function pickCovers<T extends { id: string; cover_rank: number | null }>(rows: T[], count = COVER_COUNT): T[] {
  const picked = rows.filter((r) => r.cover_rank != null).sort((a, b) => a.cover_rank! - b.cover_rank!);
  const rest = rows.filter((r) => r.cover_rank == null);
  return [...picked, ...rest].slice(0, count);
}

/**
 * Lays covers out for a pile where the last one drawn sits on top: the most
 * important cover goes last, the rest keep their order underneath.
 */
export function topLast<T>(covers: T[]): T[] {
  return covers.length < 2 ? covers : [...covers.slice(1), covers[0]];
}

type AlbumRow = GalleryPhoto & { event: { slug: string; title: string; starts_at: string } };

/** Every event with at least one visible photo, most recent event first. */
export async function galleryAlbums(): Promise<Album[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gallery_photos")
    .select("id, path, caption, event_id, created_at, hidden_at, cover_rank, event:events!inner(slug, title, starts_at)")
    .is("hidden_at", null)
    .order("created_at", { ascending: true })
    .returns<AlbumRow[]>();
  const groups = new Map<string, AlbumRow[]>();
  for (const p of data ?? []) groups.set(p.event.slug, [...(groups.get(p.event.slug) ?? []), p]);
  return [...groups.values()]
    .map((rows) => {
      const { event } = rows[0];
      return {
        slug: event.slug,
        title: event.title,
        startsAt: event.starts_at,
        count: rows.length,
        covers: pickCovers(rows).map((p) => ({
          id: p.id,
          src: supabase.storage.from("gallery").getPublicUrl(p.path).data.publicUrl,
          alt: p.caption ?? `${event.title}, SASS`,
        })),
      };
    })
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/** One event's album: its details, every visible photo in upload order, and its covers (see pickCovers). */
export async function galleryAlbum(slug: string) {
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, slug, title, starts_at, venue")
    .eq("slug", slug)
    .maybeSingle<{ id: string; slug: string; title: string; starts_at: string; venue: string | null }>();
  if (!event) return null;
  const { data } = await supabase
    .from("gallery_photos")
    .select("id, path, caption, cover_rank")
    .eq("event_id", event.id)
    .is("hidden_at", null)
    .order("created_at", { ascending: true })
    .returns<Pick<GalleryPhoto, "id" | "path" | "caption" | "cover_rank">[]>();
  const photos: (GalleryItem & { cover_rank: number | null })[] = (data ?? []).map((p) => ({
    id: p.id,
    src: supabase.storage.from("gallery").getPublicUrl(p.path).data.publicUrl,
    alt: p.caption ?? `${event.title}, SASS`,
    cover_rank: p.cover_rank,
  }));
  return { event, photos, covers: pickCovers(photos) };
}
