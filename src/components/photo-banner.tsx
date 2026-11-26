"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Embers } from "@/components/embers";
import { bannerTheme } from "@/lib/banner-themes";
import { cn } from "@/lib/utils";

type Cover = { id: string; src: string; alt: string };

const key = (slug: string) => `sass:photo-banner:${slug}`;
const noop = () => () => {};
const EASE = [0.22, 1, 0.36, 1] as const;

// Where each print lands in the photo pile (desktop): position, size, tilt.
const PILE = [
  { c: "left-[2%] top-[14%] w-[34%]", r: -10 },
  { c: "left-[33%] top-[2%] w-[34%]", r: 5 },
  { c: "right-[0%] top-[16%] w-[33%]", r: 11 },
  { c: "left-[12%] bottom-[2%] w-[31%]", r: 7 },
  { c: "right-[10%] bottom-[0%] w-[32%]", r: -7 },
  { c: "left-[34%] top-[30%] w-[36%]", r: -2 },
];

/** Puts the first (most important) cover in the middle of a fan, the rest either side. */
function middleFirst<T>(items: T[]): T[] {
  const [first, ...rest] = items;
  if (!first) return items;
  const mid = Math.floor(items.length / 2);
  return [...rest.slice(0, mid), first, ...rest.slice(mid)];
}

export type PhotoBannerProps = {
  slug: string;
  theme: string;
  eyebrow: string;
  headline: string;
  blurb: string;
  cta: string;
  /** Most important first (see pickCovers). */
  covers: Cover[];
  /** Admin preview: always shown, and closing it isn't remembered. */
  preview?: boolean;
};

/**
 * The big "It's a Wrap!!" announcement at the top of the home page once an
 * event's photos are up. ExCo set its event, wording and theme in Admin ->
 * Gallery. Closing it is remembered in this browser, per event. It only
 * renders after hydration, so people who closed it never see it flash in.
 */
export function PhotoBanner({ slug, theme: themeId, eyebrow, headline, blurb, cta, covers, preview = false }: PhotoBannerProps) {
  const reduce = useReducedMotion() ?? false;
  const theme = bannerTheme(themeId);
  const dismissedBefore = useSyncExternalStore(
    noop,
    () => {
      if (preview) return false;
      try {
        return localStorage.getItem(key(slug)) === "1";
      } catch {
        return false;
      }
    },
    () => true, // server: render nothing
  );
  const [closed, setClosed] = useState(false);
  const show = !dismissedBefore && !closed;
  const href = `/gallery/${slug}`;
  // The first cover lands last, on top of the pile.
  const pile = covers.slice(0, PILE.length);
  const desktop = pile.length < 2 ? pile : [...pile.slice(1), pile[0]];
  const phone = middleFirst(covers.slice(0, 5));

  const dismiss = () => {
    setClosed(true);
    if (preview) return;
    try {
      localStorage.setItem(key(slug), "1");
    } catch {}
  };

  return (
    <AnimatePresence initial>
      {show && (
        <motion.aside
          key="banner"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="-mx-4 sm:mx-0"
          aria-label={`${eyebrow}: ${headline}`}
        >
          <div className={cn("relative isolate overflow-hidden p-[2px] sm:rounded-[2rem]", theme.frame)}>
            {/* Slowly turning gold and pink border. */}
            <div
              className={cn("absolute inset-[-60%] -z-10 animate-[spin_8s_linear_infinite] motion-reduce:animate-none", theme.ring)}
              aria-hidden
            />
            <div className={cn("relative overflow-hidden sm:rounded-[calc(2rem-2px)]", theme.bg)}>
              <div className={cn("absolute -bottom-24 left-[10%] size-96 rounded-full blur-3xl animate-[diya-glow_4s_ease-in-out_infinite]", theme.glows[0])} aria-hidden />
              <div className={cn("absolute -top-32 right-[5%] size-96 rounded-full blur-3xl animate-[diya-glow_6s_ease-in-out_infinite]", theme.glows[1])} aria-hidden />
              <Embers colors={theme.sparks} />

              <button
                type="button"
                onClick={dismiss}
                className={cn("absolute top-3 right-3 z-20 rounded-full p-2 transition sm:top-5 sm:right-5", theme.close)}
                aria-label="Hide this banner"
              >
                <X className="size-5" aria-hidden />
              </button>

              <div className="relative grid items-center gap-6 px-6 pt-10 pb-8 sm:px-12 sm:py-14 lg:min-h-[30rem] lg:grid-cols-[1fr_1.05fr] lg:gap-4">
                {/* Phones: a fanned row of prints above the words. */}
                {phone.length > 0 && (
                  <Link href={href} tabIndex={-1} aria-hidden className="relative mx-auto flex h-40 w-full max-w-xs justify-center lg:hidden">
                    {phone.map((c, i, arr) => {
                      const mid = (arr.length - 1) / 2;
                      return (
                        <motion.span
                          key={c.id}
                          className="absolute top-2 h-36 w-24 overflow-hidden rounded-xl border-[3px] border-white bg-white/10 shadow-xl"
                          initial={reduce ? false : { opacity: 0, y: 40, rotate: 0, x: 0 }}
                          animate={{ opacity: 1, y: Math.abs(i - mid) * 8, rotate: (i - mid) * 9, x: (i - mid) * 46 }}
                          transition={{ delay: 0.25 + i * 0.08, type: "spring", stiffness: 140, damping: 15 }}
                          style={{ zIndex: 10 - Math.abs(i - mid) }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.src} alt="" className="size-full object-cover" />
                        </motion.span>
                      );
                    })}
                  </Link>
                )}

                <div className="relative z-10 text-center lg:text-left">
                  <motion.p
                    className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.7rem] font-semibold tracking-[0.25em] uppercase", theme.eyebrow)}
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.5, ease: EASE }}
                  >
                    <Sparkles className="size-3.5" aria-hidden />
                    {eyebrow}
                  </motion.p>
                  <h2 className="mt-4 font-brand text-[3.6rem] leading-[0.95] sm:text-[5.5rem] lg:text-[6.5rem]">
                    {headline.split(" ").map((word, i) => (
                      <motion.span
                        key={i}
                        className={cn("mr-[0.22em] inline-block bg-gradient-to-br bg-clip-text text-transparent last:mr-0", theme.headline)}
                        initial={reduce ? false : { opacity: 0, y: 40, rotate: -6, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                        transition={{ delay: 0.3 + i * 0.12, type: "spring", stiffness: 180, damping: 13 }}
                      >
                        {word}
                      </motion.span>
                    ))}
                  </h2>
                  <motion.p
                    className={cn("mx-auto mt-4 max-w-sm text-base sm:text-lg lg:mx-0", theme.body)}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7, duration: 0.6 }}
                  >
                    {blurb}
                  </motion.p>
                  <motion.div
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.85, duration: 0.5, ease: EASE }}
                  >
                    <Link
                      href={href}
                      className={cn("group relative mt-7 inline-flex items-center gap-2.5 overflow-hidden rounded-2xl px-7 py-4 text-base font-semibold transition hover:brightness-105 active:scale-[0.97]", theme.cta)}
                    >
                      <span className="absolute inset-0 -translate-x-full animate-[banner-sheen_3.2s_ease-in-out_1.5s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent motion-reduce:hidden" aria-hidden />
                      <span className="relative">{cta}</span>
                      <ArrowRight className="relative size-5 transition-transform group-hover:translate-x-1" aria-hidden />
                    </Link>
                  </motion.div>
                </div>

                {/* Laptops: a pile of prints dropped on the table, gently floating. */}
                {desktop.length > 0 && (
                  <Link href={href} tabIndex={-1} aria-hidden className="relative hidden aspect-[5/4] w-full lg:block">
                    {desktop.map((c, i) => (
                      <motion.span
                        key={c.id}
                        className={`absolute aspect-[4/5] overflow-hidden rounded-2xl border-[5px] border-white bg-white shadow-[0_24px_50px_-18px_rgb(0_0_0/0.75)] ${PILE[i].c}`}
                        initial={reduce ? false : { opacity: 0, y: -80, rotate: 0, scale: 1.15 }}
                        animate={{ opacity: 1, y: 0, rotate: PILE[i].r, scale: 1 }}
                        whileHover={{ scale: 1.08, rotate: 0, zIndex: 20 }}
                        transition={{ delay: 0.35 + i * 0.13, type: "spring", stiffness: 120, damping: 14 }}
                        style={{ zIndex: i }}
                      >
                        <motion.span
                          className="block size-full"
                          animate={reduce ? undefined : { y: [0, -6, 0] }}
                          transition={{ duration: 4 + i * 0.6, repeat: Infinity, ease: "easeInOut", delay: 1.5 + i * 0.3 }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.src} alt="" className="size-full object-cover" />
                        </motion.span>
                      </motion.span>
                    ))}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
