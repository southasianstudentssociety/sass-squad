"use client";

import Link from "next/link";
import { motion, type Variants } from "motion/react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Home page, the loud parts: the next events as a hand of paper admission
// tickets, drifting palette blobs, and a ribbon. Same language as /membership
// (tickets, stamps, the brand script). Motion is off for reduced motion
// (MotionConfig reducedMotion="user" in the root layout).


export type HomeTicket = {
  slug: string;
  title: string;
  venue: string | null;
  when: string; // e.g. "Sat · 8:00 pm", already in HK time
  day: string; // "21"
  month: string; // "Nov"
  daysAway: number;
  price: string | null; // e.g. "HK$230 members", null when sold out
  stamp: "sold_out" | "members" | "free" | null;
};

const STUBS = [
  { stub: "bg-brand text-white", chip: "bg-sass-yellow text-ink", ring: "ring-brand/25" },
  { stub: "bg-sass-purple text-white", chip: "bg-sass-pink text-ink", ring: "ring-sass-purple/25" },
  { stub: "bg-teal text-white", chip: "bg-sass-turquoise text-ink", ring: "ring-teal/25" },
] as const;
const TILT = [-2.5, 2, -1.5];

const STAMP: Record<NonNullable<HomeTicket["stamp"]>, { text: string; cls: string }> = {
  sold_out: { text: "Sold out", cls: "border-brand text-brand" },
  members: { text: "Members only", cls: "border-sass-purple text-sass-purple" },
  free: { text: "Free", cls: "border-ok text-ok" },
};

function countdown(d: number) {
  if (d <= 0) return "Tonight";
  if (d === 1) return "Tomorrow";
  if (d < 7) return `In ${d} days`;
  if (d < 14) return "Next week";
  return `In ${d} days`;
}

const hand: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.14, delayChildren: 0.15 } } };
const deal: Variants = {
  hidden: { opacity: 0, x: 80, y: -20, rotate: 12 },
  show: (i: number) => ({ opacity: 1, x: 0, y: 0, rotate: TILT[i % TILT.length], transition: { type: "spring", stiffness: 140, damping: 18 } }),
};

/** The next events as tilted admission tickets, front one first. */
export function UpNextTickets({ tickets }: { tickets: HomeTicket[] }) {
  return (
    <div className="relative">
      <div className="mb-6 flex items-baseline justify-between px-1">
        <p className="font-brand text-3xl text-brand">Up next</p>
        <Link href="/events" className="group flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          All events <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
      <motion.ul variants={hand} initial="hidden" animate="show" className="space-y-5">
        {tickets.map((t, i) => {
          const c = STUBS[i % STUBS.length];
          const stamp = t.stamp ? STAMP[t.stamp] : null;
          return (
            <motion.li key={t.slug} custom={i} variants={deal} whileHover={{ rotate: 0, y: -6, scale: 1.015 }} className="relative">
              <Link
                href={`/events/${t.slug}`}
                className={cn("group flex overflow-hidden rounded-2xl bg-[#fffaf0] shadow-[var(--shadow-float)] ring-1 transition-shadow", c.ring)}
                style={{
                  WebkitMask: "radial-gradient(circle at 76px 0, transparent 9px, #000 10px) top/100% 51% no-repeat, radial-gradient(circle at 76px 100%, transparent 9px, #000 10px) bottom/100% 51% no-repeat",
                  mask: "radial-gradient(circle at 76px 0, transparent 9px, #000 10px) top/100% 51% no-repeat, radial-gradient(circle at 76px 100%, transparent 9px, #000 10px) bottom/100% 51% no-repeat",
                }}
              >
                <div className={cn("relative flex w-[76px] shrink-0 flex-col items-center justify-center gap-0.5 py-4", c.stub)}>
                  <span className="text-[2rem] font-semibold leading-none tabular-nums">{t.day}</span>
                  <span className="text-[11px] font-bold tracking-[0.25em] uppercase">{t.month}</span>
                  <span className="mt-2 text-[8px] font-bold tracking-[0.3em] uppercase opacity-70">Admit one</span>
                </div>
                <div className="relative min-w-0 flex-1 border-l-2 border-dashed border-ink/15 px-4 py-3.5 sm:px-5">
                  <div className="flex items-center gap-2">
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.15em] uppercase", c.chip)}>{countdown(t.daysAway)}</span>
                    <span className="hidden truncate text-xs text-muted sm:inline">{t.when}</span>
                    {stamp && (
                      <span className={cn("-rotate-6 whitespace-nowrap rounded border-2 border-double px-1.5 text-[10px] font-black tracking-[0.14em] uppercase sm:hidden", stamp.cls)}>{stamp.text}</span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 font-brand text-[1.5rem] leading-[1.15] text-ink sm:truncate sm:pr-16 sm:text-[1.8rem]">{t.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink/65 sm:truncate sm:text-sm">
                    <span className="sm:hidden">{t.when}{t.venue && " · "}</span>
                    {t.venue}
                    {t.venue && t.price && " · "}
                    {t.price && <span className="font-medium text-ink">{t.price}</span>}
                  </p>
                </div>
              </Link>
              {stamp && (
                <motion.span
                  initial={{ scale: 2.2, opacity: 0, rotate: -30 }}
                  animate={{ scale: 1, opacity: 1, rotate: -12 }}
                  transition={{ delay: 0.7 + i * 0.15, type: "spring", stiffness: 380, damping: 16 }}
                  className={cn("pointer-events-none absolute -top-2.5 right-3 hidden rounded-md sm:block border-[3px] border-double bg-[#fffaf0]/90 px-2 py-0.5 text-xs font-black tracking-[0.16em] uppercase sm:text-sm", stamp.cls)}
                  aria-label={stamp.text}
                >
                  {stamp.text}
                </motion.span>
              )}
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}

/** Slowly drifting blobs in the SASS palette, behind the hero. */
export function HeroBlobs() {
  const blobs = [
    { c: "bg-sass-pink", s: "size-72", p: "-left-20 -top-16", d: 15 },
    { c: "bg-sass-yellow", s: "size-64", p: "right-[-4rem] top-10", d: 18 },
    { c: "bg-sass-turquoise", s: "size-56", p: "left-1/2 bottom-[-5rem]", d: 20 },
    { c: "bg-sass-purple/50", s: "size-48", p: "right-1/4 -top-20", d: 17 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[2rem]" aria-hidden>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={cn("absolute rounded-full opacity-40 blur-3xl", b.c, b.s, b.p)}
          animate={{ x: [0, 30, -20, 0], y: [0, -25, 15, 0], scale: [1, 1.08, 0.95, 1] }}
          transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/** A tilted scrolling ribbon under the hero. Stays still for reduced motion. */
export function NightsRibbon() {
  const words = ["Diwali", "Garba", "Henna", "Chaat & chai", "Cards nights", "Dance", "Good food"];
  const stars = ["text-sass-yellow", "text-sass-pink", "text-sass-turquoise"];
  return (
    <div className="relative -mx-5 rotate-[-1.5deg] overflow-hidden border-y-2 border-ink bg-teal py-3 sm:mx-0 sm:rounded-xl" aria-hidden>
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-8">
            {[...words, ...words].map((w, i) => (
              <span key={`${copy}-${i}`} className="flex items-center gap-8 font-display text-lg font-semibold tracking-wide text-white uppercase">
                {w}<span className={stars[i % stars.length]}>✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
