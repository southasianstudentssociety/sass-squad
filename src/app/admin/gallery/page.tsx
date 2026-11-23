import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { HOME_STRIP_COUNT as HOME_COUNT, homeMix, type GalleryPhoto } from "@/lib/gallery";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { GalleryUploader } from "./uploader";
import { hideGalleryPhoto, setGalleryPhotoOnHome } from "./actions";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = { title: "Gallery" };

export default async function AdminGalleryPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await requireAdmin("/admin/gallery");
  const supabase = await createClient();
  const [{ data: photoData }, { data: eventData }] = await Promise.all([
    supabase
      .from("gallery_photos")
      .select("id, path, caption, event_id, created_at, hidden_at, on_home, event:events(title, starts_at)")
      .is("hidden_at", null)
      .order("created_at", { ascending: true })
      .returns<(GalleryPhoto & { event: { title: string; starts_at: string } | null })[]>(),
    supabase.from("events").select("id, title, starts_at").order("starts_at", { ascending: false }).returns<{ id: string; title: string; starts_at: string }[]>(),
  ]);
  const photos = photoData ?? [];
  const events = (eventData ?? []).map((e) => ({ id: e.id, title: e.title, date: formatDate(e.starts_at) }));
  const url = (path: string) => supabase.storage.from("gallery").getPublicUrl(path).data.publicUrl;
  const showing = new Set(homeMix(photos, HOME_COUNT));
  // One section per album, most recent event first; photos in upload order.
  const albums = new Map<string, { title: string; when: string; photos: typeof photos }>();
  for (const p of photos) {
    const key = p.event_id ?? "none";
    const a = albums.get(key) ?? { title: p.event ? `${p.event.title} · ${formatDate(p.event.starts_at)}` : "No event", when: p.event?.starts_at ?? "", photos: [] };
    a.photos.push(p);
    albums.set(key, a);
  }
  const sections = [...albums.values()].sort((a, b) => b.when.localeCompare(a.when));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ops-heading text-3xl">Gallery</h1>
        <p className="text-sm text-muted">
          Pick an event when you upload: the photos make that event&rsquo;s album on the{" "}
          <Link href="/gallery" className="underline">Gallery</Link> page, in the order you upload them.
          Landscape and portrait both work.
        </p>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />
      <GalleryUploader userId={session.userId} events={events} />

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Home page strip</h2>
        <p className="text-sm text-muted">
          Shows {HOME_COUNT} photos, an equal mix of every album: one from each in turn, newest event first. Tap the star on a photo
          to choose it for the home page. If an album has starred photos, only those are used; if none, its first uploads are.
          Photos marked <span className="font-medium text-ink">Showing</span> are on the home page right now.
        </p>
      </section>

      {sections.length === 0 && (
        <p className="text-sm text-muted">No photos yet. The gallery section stays hidden on the home page until you add some.</p>
      )}
      {sections.map((a) => {
        const picked = a.photos.filter((p) => p.on_home).length;
        const live = a.photos.filter((p) => showing.has(p.id)).length;
        return (
          <section key={a.title} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">{a.title} <span className="text-sm font-normal text-muted">({a.photos.length})</span></h2>
              <p className="text-xs text-muted">
                {picked ? `${picked} starred` : "None starred: using first uploads"} · {live} showing
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {a.photos.map((p) => (
                <li key={p.id} className={cn("card space-y-2 p-2", showing.has(p.id) && "ring-2 ring-accent")}>
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url(p.path)} alt={p.caption ?? ""} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
                    {showing.has(p.id) && (
                      <span className="absolute top-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-ink">Showing</span>
                    )}
                    <form action={setGalleryPhotoOnHome} className="absolute top-1.5 right-1.5">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="on" value={p.on_home ? "0" : "1"} />
                      <button
                        className={cn("rounded-full p-1.5 shadow backdrop-blur transition", p.on_home ? "bg-accent text-accent-ink" : "bg-white/80 text-ink/60 hover:text-ink")}
                        aria-label={p.on_home ? "Unstar: don't choose for the home page" : "Star: choose for the home page"}
                        aria-pressed={p.on_home}
                        title={p.on_home ? "Starred for the home page" : "Star for the home page"}
                      >
                        <Star className={cn("size-4", p.on_home && "fill-current")} aria-hidden />
                      </button>
                    </form>
                  </div>
                  <div className="flex items-start justify-between gap-2 px-1">
                    <p className="min-w-0 text-xs text-muted">
                      <span className="block truncate text-ink">{p.caption ?? "No caption"}</span>
                      {formatDate(p.created_at)}
                    </p>
                    <form action={hideGalleryPhoto}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">Remove</SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
