"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { id: string; src: string; alt: string };

// Collage rhythm: big square, two small, tall, two small, wide... (2 rows, scrolling sideways).
const SHAPES = ["col-span-2 row-span-2", "", "", "row-span-2", "", "col-span-2", "", "row-span-2", ""];

/**
 * A two-row photo collage that drifts slowly sideways and loops. It pauses
 * while someone touches, hovers or scrolls it, and doesn't move at all for
 * people who prefer reduced motion (they scroll it by hand).
 */
export function GalleryStrip({ items }: { items: Item[] }) {
  const reduce = useReducedMotion() ?? false;
  const scroller = useRef<HTMLDivElement>(null);
  const drift = !reduce && items.length >= 4;

  useEffect(() => {
    const el = scroller.current;
    if (!el || !drift) return;
    let raf = 0;
    let pos = el.scrollLeft;
    let pausedUntil = 0;
    let last = performance.now();
    const pause = (ms = 2500) => {
      pausedUntil = performance.now() + ms;
    };
    const hold = () => pause(60_000);
    const release = () => pause(2500);
    const onWheel = () => pause();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      if (now >= pausedUntil && !document.hidden) {
        if (Math.abs(el.scrollLeft - pos) > 2) pos = el.scrollLeft; // someone scrolled it
        pos += dt * 0.025; // ~25 px per second
        const half = el.scrollWidth / 2; // the items are rendered twice; jump back seamlessly
        if (pos >= half) pos -= half;
        el.scrollLeft = pos;
      } else {
        pos = el.scrollLeft;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    el.addEventListener("pointerenter", hold);
    el.addEventListener("pointerleave", release);
    el.addEventListener("touchstart", hold, { passive: true });
    el.addEventListener("touchend", release);
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("focusin", hold);
    el.addEventListener("focusout", release);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerenter", hold);
      el.removeEventListener("pointerleave", release);
      el.removeEventListener("touchstart", hold);
      el.removeEventListener("touchend", release);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("focusin", hold);
      el.removeEventListener("focusout", release);
    };
  }, [drift]);

  const nudge = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  };

  const tiles = (copy: number) =>
    items.map((item, i) => (
      <figure
        key={`${copy}-${item.id}`}
        aria-hidden={copy > 0 || undefined}
        className={cn("overflow-hidden rounded-2xl bg-line", SHAPES[i % SHAPES.length])}
      >
        {/* Public Storage URLs, already resized on upload. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.src} alt={copy > 0 ? "" : item.alt} loading="lazy" decoding="async" draggable={false}
          className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-soft)] hover:scale-[1.03] motion-reduce:transition-none" />
      </figure>
    ));

  return (
    <div className="relative">
      <div
        ref={scroller}
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        aria-label="Photos from past events"
        role="region"
        tabIndex={0}
      >
        <div className="grid w-max grid-flow-col grid-rows-[repeat(2,8.5rem)] auto-cols-[8.5rem] gap-2.5 sm:grid-rows-[repeat(2,11rem)] sm:auto-cols-[11rem] sm:gap-3">
          {tiles(0)}
          {drift && tiles(1)}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-10 bg-gradient-to-r from-page to-transparent sm:block" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-16 bg-gradient-to-l from-page to-transparent sm:block" aria-hidden />
      <div className="absolute -bottom-12 right-0 hidden gap-2 sm:flex">
        <button type="button" onClick={() => nudge(-1)} className="btn-ghost size-9 p-0" aria-label="Scroll photos left"><ChevronLeft className="size-4" aria-hidden /></button>
        <button type="button" onClick={() => nudge(1)} className="btn-ghost size-9 p-0" aria-label="Scroll photos right"><ChevronRight className="size-4" aria-hidden /></button>
      </div>
    </div>
  );
}
