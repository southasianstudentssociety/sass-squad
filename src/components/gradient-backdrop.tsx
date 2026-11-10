"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

// A full-page backdrop of slowly drifting SASS-palette blobs, the same feel as
// the /membership hero but behind the whole page. Fixed to the viewport, so it
// stays put while the page scrolls. Rendered straight into <body>: the page
// fade-in (app/template.tsx) uses a transform, which would otherwise pin a
// "fixed" element to the page wrapper instead of the screen. Still for reduced
// motion (MotionConfig reducedMotion="user" in the root layout).

const BLOBS = [
  { c: "bg-sass-pink", s: "size-[26rem] sm:size-[34rem]", p: "-left-32 -top-24", d: 16 },
  { c: "bg-sass-yellow", s: "size-[24rem] sm:size-[30rem]", p: "-right-28 top-[10%]", d: 19 },
  { c: "bg-sass-turquoise", s: "size-[22rem] sm:size-[30rem]", p: "left-[18%] top-[45%]", d: 21 },
  { c: "bg-sass-purple/60", s: "size-[20rem] sm:size-[26rem]", p: "right-[8%] bottom-[-6rem]", d: 18 },
  { c: "bg-accent", s: "size-[18rem] sm:size-[22rem]", p: "-left-20 bottom-[5%]", d: 23 },
];

const noop = () => () => {};

export function GradientBackdrop() {
  // Only on the client: there's no <body> to portal into during server render.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden [contain:paint]" aria-hidden>
      {BLOBS.map((b, i) => (
        <motion.div
          key={i}
          className={cn("absolute rounded-full opacity-45 blur-3xl will-change-transform", b.c, b.s, b.p)}
          animate={{ x: [0, 40, -30, 0], y: [0, -35, 25, 0], scale: [1, 1.1, 0.94, 1] }}
          transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      {/* Soften towards the page colour so text stays easy to read. */}
      <div className="absolute inset-0 bg-page/35" />
    </div>,
    document.body,
  );
}
