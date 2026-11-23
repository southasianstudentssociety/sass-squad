import "server-only";
import { createClient } from "@/lib/supabase/server";

export type GalleryPhoto = {
  id: string;
  path: string;
  caption: string | null;
  event_id: string | null;
  created_at: string;
  hidden_at: string | null;
};

export type GalleryItem = { id: string; src: string; alt: string };

/** Visible gallery photos, newest first, with their public URLs. Optionally only one event's. */
export async function galleryItems(limit = 24, eventId?: string): Promise<GalleryItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("gallery_photos")
    .select("id, path, caption, event_id, created_at, hidden_at, event:events(title)")
    .is("hidden_at", null);
  if (eventId) query = query.eq("event_id", eventId);
  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<(GalleryPhoto & { event: { title: string } | null })[]>();
  return (data ?? []).map((p) => ({
    id: p.id,
    src: supabase.storage.from("gallery").getPublicUrl(p.path).data.publicUrl,
    alt: p.caption ?? (p.event ? `${p.event.title}, SASS` : "A SASS event"),
  }));
}

export type Album = {
  slug: string;
  title: string;
  startsAt: string;
  count: number;
  /** Up to 6 photos for the album card and the home banner. */
  covers: GalleryItem[];
};

type AlbumRow = GalleryPhoto & { event: { slug: string; title: string; starts_at: string } };

/** Every event with at least one visible photo, most recent event first. */
export async function galleryAlbums(): Promise<Album[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gallery_photos")
    .select("id, path, caption, event_id, created_at, hidden_at, event:events!inner(slug, title, starts_at)")
    .is("hidden_at", null)
    .order("created_at", { ascending: true })
    .returns<AlbumRow[]>();
  const albums = new Map<string, Album>();
  for (const p of data ?? []) {
    const album = albums.get(p.event.slug) ?? { slug: p.event.slug, title: p.event.title, startsAt: p.event.starts_at, count: 0, covers: [] };
    album.count++;
    if (album.covers.length < 6) {
      album.covers.push({
        id: p.id,
        src: supabase.storage.from("gallery").getPublicUrl(p.path).data.publicUrl,
        alt: p.caption ?? `${p.event.title}, SASS`,
      });
    }
    albums.set(p.event.slug, album);
  }
  return [...albums.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/** One event's album: its details and every visible photo in upload order (the order you picked them in). */
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
    .select("id, path, caption")
    .eq("event_id", event.id)
    .is("hidden_at", null)
    .order("created_at", { ascending: true })
    .returns<Pick<GalleryPhoto, "id" | "path" | "caption">[]>();
  const photos: GalleryItem[] = (data ?? []).map((p) => ({
    id: p.id,
    src: supabase.storage.from("gallery").getPublicUrl(p.path).data.publicUrl,
    alt: p.caption ?? `${event.title}, SASS`,
  }));
  return { event, photos };
}
