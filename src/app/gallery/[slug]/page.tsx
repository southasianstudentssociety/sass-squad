import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FolderOpen } from "lucide-react";
import { galleryAlbum } from "@/lib/gallery";
import { driveUrlFor } from "@/lib/albums";
import { formatDate } from "@/lib/format";
import { Reveal } from "@/components/motion";
import { Embers } from "@/components/embers";
import { PhotoCollage } from "@/components/photo-collage";
import { AlbumHeroStack } from "./hero-stack";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const album = await galleryAlbum((await params).slug);
  if (!album) return { title: "Gallery" };
  return {
    title: `${album.event.title} photos`,
    description: `Photos from ${album.event.title} with the South Asian Student Society.`,
    openGraph: album.photos[0] ? { images: [album.photos[0].src] } : undefined,
  };
}

export default async function AlbumPage({ params }: Props) {
  const { slug } = await params;
  const album = await galleryAlbum(slug);
  if (!album) notFound();
  const { event, photos } = album;
  const drive = driveUrlFor(event.slug);
  const year = new Date(event.starts_at).getFullYear();
  const showYear = !event.title.includes(String(year));

  return (
    <div className="pb-10">
      {/* Hero: dark, warm, with embers rising, so the photos pop against it. */}
      <section className="relative -mx-4 overflow-hidden rounded-b-[2rem] bg-[radial-gradient(110%_120%_at_10%_100%,#6b2340_0%,#2a1330_45%,#140b18_100%)] px-6 pt-8 pb-12 text-white sm:mx-0 sm:rounded-[2rem] sm:px-10 sm:pt-10 sm:pb-14">
        <div className="absolute -bottom-24 left-1/4 size-80 rounded-full bg-accent/35 blur-3xl animate-[diya-glow_5s_ease-in-out_infinite]" aria-hidden />
        <div className="absolute -top-24 right-0 size-72 rounded-full bg-sass-pink/20 blur-3xl" aria-hidden />
        <Embers />

        <Link href="/gallery" className="relative inline-flex items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-white">
          <ArrowLeft className="size-4" aria-hidden />All albums
        </Link>

        <div className="relative mt-8 grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            <p className="text-[0.7rem] font-semibold tracking-[0.25em] text-sass-yellow uppercase">
              {formatDate(event.starts_at)}{event.venue ? ` · ${event.venue}` : ""}
            </p>
            <h1 className="mt-3 font-display text-5xl leading-[0.95] sm:text-7xl">
              {event.title}
              {showYear && <span className="block text-sass-yellow">{year}</span>}
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">
              {photos.length > 0
                ? `Relive the night: ${photos.length} of our favourite moments. Tap any photo to see it big.`
                : "The photos are on their way. Check back soon."}
            </p>
            <a href={drive} target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium backdrop-blur transition hover:border-white/40 hover:bg-white/10">
              <FolderOpen className="size-4" aria-hidden />Every photo on Google Drive
              <ExternalLink className="size-3.5 opacity-60" aria-hidden />
            </a>
          </Reveal>
          {photos.length >= 3 && <AlbumHeroStack photos={photos.slice(0, 3)} />}
        </div>
      </section>

      {photos.length > 0 && <PhotoCollage items={photos} label={`Photos from ${event.title}`} />}

      <Reveal className="mx-auto max-w-md pt-6 text-center">
        <p className="font-display text-2xl text-ink">Looking for yourself?</p>
        <p className="mt-2 text-sm text-muted">These are our picks. The full set from the night is on Google Drive.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href={drive} target="_blank" rel="noreferrer" className="btn-primary px-5">
            <FolderOpen className="size-4" aria-hidden />Open the full album
          </a>
          <Link href="/events" className="btn-ghost px-5">Next events</Link>
        </div>
      </Reveal>
    </div>
  );
}
