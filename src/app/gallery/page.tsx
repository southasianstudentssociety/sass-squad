import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { galleryAlbums, topLast } from "@/lib/gallery";
import { formatDate } from "@/lib/format";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { GradientBackdrop } from "@/components/gradient-backdrop";

export const metadata = { title: "Gallery", description: "Photos from South Asian Student Society events." };

/** "Diwali" -> "Diwali 2026", so albums from different years can be told apart. */
const withYear = (title: string, iso: string) => {
  const year = String(new Date(iso).getFullYear());
  return title.includes(year) ? title : `${title} ${year}`;
};

// Left, right, then the first cover in the middle on top.
const FAN = ["-rotate-8 -translate-x-12", "rotate-6 translate-x-12", "-rotate-1"];

export default async function GalleryPage() {
  const albums = await galleryAlbums();

  return (
    <div className="space-y-10 pb-10">
      <GradientBackdrop />
      <Reveal>
        <p className="eyebrow">Gallery</p>
        <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">Relive the nights</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">Photos from every SASS night. Open an album for the full collage.</p>
      </Reveal>

      {albums.length === 0 ? (
        <p className="text-sm text-muted">No albums yet. Photos from our next event will land here.</p>
      ) : (
        <Stagger className="grid gap-5 sm:grid-cols-2">
          {albums.map((a) => (
            <StaggerItem key={a.slug}>
              <Link href={`/gallery/${a.slug}`} className="group card-link block overflow-hidden p-0">
                <div className="relative flex h-56 items-center justify-center overflow-hidden bg-[radial-gradient(120%_120%_at_20%_100%,#6b2340_0%,#2a1330_50%,#140b18_100%)] sm:h-64">
                  {topLast(a.covers.slice(0, 3)).map((c, i) => (
                    <span
                      key={c.id}
                      className={`absolute h-40 w-32 overflow-hidden rounded-xl border-4 border-white shadow-xl transition-transform duration-500 ease-[var(--ease-out-soft)] sm:h-44 sm:w-36 ${FAN[i]} ${i === 0 ? "group-hover:-translate-x-20 group-hover:-rotate-12" : i === 1 ? "group-hover:translate-x-20 group-hover:rotate-12" : "group-hover:-translate-y-2"}`}
                      style={{ zIndex: i }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.src} alt="" loading="lazy" className="size-full object-cover" />
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 p-5">
                  <div>
                    <h2 className="font-display text-2xl text-ink">{withYear(a.title, a.startsAt)}</h2>
                    <p className="mt-0.5 text-xs text-muted">{formatDate(a.startsAt)}</p>
                  </div>
                  <ArrowRight className="size-5 text-muted transition-transform group-hover:translate-x-1 group-hover:text-ink" aria-hidden />
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
