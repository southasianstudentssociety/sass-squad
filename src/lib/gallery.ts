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
