"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Embers } from "@/components/embers";

type Cover = { id: string; src: string; alt: string };

const key = (slug: string) => `sass:photo-banner:${slug}`;
const noop = () => () => {};

/**
 * "Photos are out" banner for the home page. Closing it remembers the choice
 * in this browser. It only renders after hydration, so people who closed it
 * never see it flash in.
 */
export function PhotoBanner({ slug, headline, cta, count, covers }: { slug: string; headline: string; cta: string; count: number; covers: Cover[] }) {
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
          initial={{ opacity: 0, y: -12, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="!mb-8 sm:!mb-10"
          aria-label={headline}
        >
          <div className="relative isolate overflow-hidden rounded-3xl bg-[#1a0f1f] p-[1.5px] shadow-[var(--shadow-float)]">
            {/* Slowly turning gold/pink border. */}
            <div
              className="absolute inset-[-50%] -z-10 animate-[spin_9s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_55%,var(--sass-yellow)_70%,var(--sass-pink)_80%,transparent_95%)] motion-reduce:animate-none"
              aria-hidden
            />
            <div className="relative overflow-hidden rounded-[calc(1.5rem-1.5px)] bg-[radial-gradient(120%_140%_at_0%_100%,#5a1f3a_0%,#24112b_45%,#140b18_100%)] px-5 py-5 sm:px-7 sm:py-6">
              <div className="absolute -bottom-16 left-10 size-48 rounded-full bg-accent/40 blur-3xl animate-[diya-glow_4s_ease-in-out_infinite]" aria-hidden />
              <Embers />

              <div className="relative flex items-center gap-4 sm:gap-6">
                {covers.length > 0 && (
                  <Link href={`/gallery/${slug}`} tabIndex={-1} aria-hidden className="relative hidden h-24 w-28 shrink-0 sm:block">
                    {covers.slice(0, 3).map((c, i) => (
                      <motion.span
                        key={c.id}
                        className="absolute inset-y-1 left-3 w-[4.5rem] overflow-hidden rounded-xl border-2 border-white/90 bg-white/10 shadow-lg"
                        initial={{ rotate: 0, x: 0, opacity: 0 }}
                        animate={{ rotate: [-12, 2, 14][i], x: [-14, 4, 22][i], opacity: 1 }}
                        transition={{ delay: 0.35 + i * 0.12, type: "spring", stiffness: 160, damping: 16 }}
                        style={{ zIndex: i }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.src} alt="" className="size-full object-cover" />
                      </motion.span>
                    ))}
                  </Link>
                )}

                <div className="min-w-0 flex-1 pr-6 sm:pr-0">
                  <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.2em] text-sass-yellow uppercase">
                    <Sparkles className="size-3.5" aria-hidden />
                    {count} photos · Just in
                  </p>
                  <p className="mt-1.5 font-brand text-2xl leading-tight text-white sm:text-3xl">{headline}</p>
                </div>

                <Link
                  href={`/gallery/${slug}`}
                  className="group relative hidden shrink-0 items-center gap-2 overflow-hidden rounded-xl bg-sass-yellow px-4 py-2.5 text-sm font-semibold text-[#2a1a05] transition hover:brightness-105 active:scale-[0.97] sm:inline-flex"
                >
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent transition-transform duration-700 group-hover:translate-x-full" aria-hidden />
                  {cta}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>

                <button
                  type="button"
                  onClick={dismiss}
                  className="absolute -top-2 -right-3 rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white sm:static sm:-mr-2"
                  aria-label="Hide this banner"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              <Link
                href={`/gallery/${slug}`}
                className="relative mt-4 flex items-center justify-center gap-2 rounded-xl bg-sass-yellow px-4 py-2.5 text-sm font-semibold text-[#2a1a05] active:scale-[0.97] sm:hidden"
              >
                {cta}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
