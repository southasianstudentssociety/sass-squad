"use client";

import Link from "next/link";
import { motion, type Variants } from "motion/react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Home page: the next events on a Bollywood cinema marquee. A night-purple
// board, a frame of bulbs (blink a few times, then stay lit), flip-clock
// dates, and each title as a neon sign that switches on. Bulbs and
// neon are CSS animations (bulb, neon-flicker in globals.css), so they stop
// for people who prefer reduced motion; the rows' entrance uses motion, which
// is off for them too (MotionConfig reducedMotion="user").

export type HomeEvent = {
  slug: string;
  title: string;
  venue: string | null;
  when: string; // "Sat · 8:00 pm", HK time
  day: string; // "21"
  month: string; // "Nov"
  daysAway: number;
  price: string | null; // "HK$230 members" / "Free for members"; null when sold out
  label: "sold_out" | "members" | "free" | null;
};

const NEON: Record<NonNullable<HomeEvent["label"]>, { text: string; cls: string }> = {
  sold_out: { text: "Sold out", cls: "neon text-sass-pink animate-neon-flicker" },
  members: { text: "Members only", cls: "neon text-sass-turquoise" },
  free: { text: "Free", cls: "neon text-sass-yellow" },
};

function countdown(d: number) {
  if (d <= 0) return "Tonight";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

const rows: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.25 } } };
const row: Variants = {
  hidden: { opacity: 0, y: 14, filter: "brightness(2.2) blur(2px)" },
  show: { opacity: 1, y: 0, filter: "brightness(1) blur(0px)", transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

/** A strip of bulbs along one side of the board. Every other bulb blinks in turn. */
function Bulbs({ count, side }: { count: number; side: "top" | "bottom" | "left" | "right" }) {
  const pos = {
    top: "inset-x-5 top-[7px] flex-row",
    bottom: "inset-x-5 bottom-[7px] flex-row",
    left: "inset-y-5 left-[7px] flex-col",
    right: "inset-y-5 right-[7px] flex-col",
  }[side];
  return (
    <div className={cn("pointer-events-none absolute flex justify-between", pos)} aria-hidden>
      {Array.from({ length: count }, (_, i) => <span key={i} className="bulb" />)}
    </div>
  );
}

// Each title is its own neon sign, cycling through the palette.
const SIGN = ["text-sass-pink", "text-sass-turquoise", "text-sass-yellow"] as const;

export function NowShowing({ events }: { events: HomeEvent[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="marquee-board relative rounded-[1.75rem] p-6 text-white shadow-[var(--shadow-float)] sm:p-9"
    >
      <Bulbs count={16} side="top" />
      <Bulbs count={16} side="bottom" />
      <Bulbs count={10} side="left" />
      <Bulbs count={10} side="right" />

      <div className="relative rounded-2xl border border-white/10 bg-black/20 px-3.5 py-5 sm:px-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.45em] text-white/55 uppercase">SASS presents</p>
            <p className="neon mt-1 whitespace-nowrap font-brand text-[2.3rem] leading-none text-sass-yellow sm:text-[2.9rem]">Now showing</p>
          </div>
          <Link href="/events" className="group mb-1 hidden shrink-0 items-center gap-1 text-xs text-white/60 transition-colors hover:text-white sm:flex">
            All events <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>

        <motion.ul variants={rows} initial="hidden" animate="show" className="mt-5 divide-y divide-dashed divide-white/15 border-t border-dashed border-white/15">
          {events.map((e, i) => {
            const neon = e.label ? NEON[e.label] : null;
            return (
              <motion.li key={e.slug} variants={row}>
                <Link href={`/events/${e.slug}`} className="group -mx-2 flex items-center gap-3.5 rounded-xl sm:gap-4 px-2 py-4 transition-colors hover:bg-white/[0.06]">
                  <div className="flip-tile relative flex w-[4.25rem] shrink-0 flex-col items-center overflow-hidden rounded-lg pt-2 pb-1.5 text-center">
                    <span className="relative z-10 text-[2rem] font-semibold leading-none tabular-nums">{e.day}</span>
                    <span className="relative z-10 mt-1 text-[10px] font-bold tracking-[0.3em] text-sass-turquoise uppercase">{e.month}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn("neon animate-neon-on font-brand text-[1.75rem] leading-[1.1] transition-[filter] duration-300 group-hover:brightness-125 sm:text-[2rem]", SIGN[i % SIGN.length])}
                      style={{ animationDelay: `${0.5 + i * 0.35}s` }}
                    >
                      {e.title}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold tracking-[0.2em] text-white/80 uppercase">
                      <span>{e.when}</span>
                      {e.venue && <><span className="text-sass-yellow" aria-hidden>✦</span><span className="font-medium normal-case tracking-normal text-white/60 text-[13px]">{e.venue}</span></>}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="rounded-full border border-white/20 px-2 py-0.5 font-semibold tracking-[0.18em] text-white/70 uppercase">{countdown(e.daysAway)}</span>
                      {neon && <span className={cn("whitespace-nowrap text-sm font-black tracking-[0.2em] uppercase", neon.cls)}>{neon.text}</span>}
                      {e.price && <span className="text-sm font-semibold text-white">{e.price}</span>}
                    </p>
                  </div>
                  <ArrowRight className="hidden size-4 shrink-0 text-white/30 sm:block transition-all group-hover:translate-x-0.5 group-hover:text-sass-yellow" aria-hidden />
                </Link>
              </motion.li>
            );
          })}
        </motion.ul>
        <Link href="/events" className="mt-1 flex items-center justify-center gap-1 border-t border-dashed border-white/15 pt-4 text-xs font-semibold tracking-[0.2em] text-sass-yellow uppercase sm:hidden">
          All events <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </motion.div>
  );
}
