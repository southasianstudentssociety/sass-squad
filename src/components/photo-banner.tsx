"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Embers } from "@/components/embers";

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

/**
 * The big "It's a Wrap!!" announcement at the top of the home page once an
 * event's photos are up. Closing it is remembered in this browser. It only
 * renders after hydration, so people who closed it never see it flash in.
 */
export function PhotoBanner({ slug, eyebrow, headline, cta, covers }: { slug: string; eyebrow: string; headline: string; cta: string; covers: Cover[] }) {
  const reduce = useReducedMotion() ?? false;
  const dismissedBefore = useSyncExternalStore(
    noop,
    () => {
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
  const pile = covers.slice(0, PILE.length);

  const dismiss = () => {
    setClosed(true);
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
          <div className="relative isolate overflow-hidden bg-[#1a0f1f] p-[2px] shadow-[0_30px_80px_-30px_rgb(90_31_58/0.7)] sm:rounded-[2rem]">
            {/* Slowly turning gold and pink border. */}
            <div
              className="absolute inset-[-60%] -z-10 animate-[spin_8s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_40%,var(--sass-yellow)_55%,var(--sass-pink)_68%,var(--accent)_78%,transparent_92%)] motion-reduce:animate-none"
              aria-hidden
            />
            <div className="relative overflow-hidden bg-[radial-gradient(110%_130%_at_0%_100%,#7a2547_0%,#2c1232_45%,#140b18_100%)] sm:rounded-[calc(2rem-2px)]">
              <div className="absolute -bottom-24 left-[10%] size-96 rounded-full bg-accent/40 blur-3xl animate-[diya-glow_4s_ease-in-out_infinite]" aria-hidden />
              <div className="absolute -top-32 right-[5%] size-96 rounded-full bg-sass-pink/25 blur-3xl animate-[diya-glow_6s_ease-in-out_infinite]" aria-hidden />
              <Embers />

              <button
                type="button"
                onClick={dismiss}
                className="absolute top-3 right-3 z-20 rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white sm:top-5 sm:right-5"
                aria-label="Hide this banner"
              >
                <X className="size-5" aria-hidden />
              </button>

              <div className="relative grid items-center gap-6 px-6 pt-10 pb-8 sm:px-12 sm:py-14 lg:min-h-[30rem] lg:grid-cols-[1fr_1.05fr] lg:gap-4">
                {/* Phones: a fanned row of prints above the words. */}
                {pile.length > 0 && (
                  <Link href={href} tabIndex={-1} aria-hidden className="relative mx-auto flex h-40 w-full max-w-xs justify-center lg:hidden">
                    {pile.slice(0, 5).map((c, i, arr) => {
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
                    className="inline-flex items-center gap-2 rounded-full border border-sass-yellow/30 bg-sass-yellow/10 px-3 py-1 text-[0.7rem] font-semibold tracking-[0.25em] text-sass-yellow uppercase"
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
                        className="mr-[0.22em] inline-block bg-gradient-to-br from-sass-yellow via-[#ffd27a] to-sass-pink bg-clip-text text-transparent last:mr-0"
                        initial={reduce ? false : { opacity: 0, y: 40, rotate: -6, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                        transition={{ delay: 0.3 + i * 0.12, type: "spring", stiffness: 180, damping: 13 }}
                      >
                        {word}
                      </motion.span>
                    ))}
                  </h2>
                  <motion.p
                    className="mx-auto mt-4 max-w-sm text-base text-white/70 sm:text-lg lg:mx-0"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7, duration: 0.6 }}
                  >
                    The photos are in. Find yourself, your friends and the best moments from the night.
                  </motion.p>
                  <motion.div
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.85, duration: 0.5, ease: EASE }}
                  >
                    <Link
                      href={href}
                      className="group relative mt-7 inline-flex items-center gap-2.5 overflow-hidden rounded-2xl bg-sass-yellow px-7 py-4 text-base font-semibold text-[#2a1a05] shadow-[0_10px_40px_-10px_rgb(255_240_117/0.6)] transition hover:brightness-105 active:scale-[0.97]"
                    >
                      <span className="absolute inset-0 -translate-x-full animate-[banner-sheen_3.2s_ease-in-out_1.5s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent motion-reduce:hidden" aria-hidden />
                      <span className="relative">{cta}</span>
                      <ArrowRight className="relative size-5 transition-transform group-hover:translate-x-1" aria-hidden />
                    </Link>
                  </motion.div>
                </div>

                {/* Laptops: a pile of prints dropped on the table, gently floating. */}
                {pile.length > 0 && (
                  <Link href={href} tabIndex={-1} aria-hidden className="relative hidden aspect-[5/4] w-full lg:block">
                    {pile.map((c, i) => (
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
