import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { SITE } from "@/lib/site";
import type { GalleryPhoto } from "@/lib/gallery";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { GalleryUploader } from "./uploader";
import { hideGalleryPhoto } from "./actions";

export const metadata = { title: "Gallery" };

export default async function AdminGalleryPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await requireAdmin("/admin/gallery");
  const supabase = await createClient();
  const [{ data: photoData }, { data: eventData }] = await Promise.all([
    supabase
      .from("gallery_photos")
      .select("id, path, caption, event_id, created_at, hidden_at, event:events(title)")
      .is("hidden_at", null)
      .order("created_at", { ascending: false })
      .returns<(GalleryPhoto & { event: { title: string } | null })[]>(),
    supabase.from("events").select("id, title, starts_at").order("starts_at", { ascending: false }).returns<{ id: string; title: string; starts_at: string }[]>(),
  ]);
  const photos = photoData ?? [];
  const events = (eventData ?? []).map((e) => ({ id: e.id, title: e.title, date: formatDate(e.starts_at) }));
  const url = (path: string) => supabase.storage.from("gallery").getPublicUrl(path).data.publicUrl;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Gallery</h1>
        <p className="text-sm text-muted">
          Photos here scroll across the home page, newest first (the latest 24). The &ldquo;View all photos&rdquo; button there opens{" "}
          <a href={SITE.photosUrl} target="_blank" rel="noreferrer" className="underline">the Google Drive folder</a>.
          Pick your best 10 to 20 shots; landscape and portrait both work.
        </p>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />
      <GalleryUploader userId={session.userId} events={events} />

      <section className="space-y-3">
        <h2 className="eyebrow">On the home page ({photos.length})</h2>
        {photos.length === 0 ? (
          <p className="text-sm text-muted">No photos yet. The gallery section stays hidden on the home page until you add some.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <li key={p.id} className="card space-y-2 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url(p.path)} alt={p.caption ?? ""} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
                <div className="flex items-start justify-between gap-2 px-1">
                  <p className="min-w-0 text-xs text-muted">
                    <span className="block truncate text-ink">{p.caption ?? p.event?.title ?? "No caption"}</span>
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
        )}
      </section>
    </div>
  );
}
