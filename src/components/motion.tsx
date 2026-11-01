"use client";

import { MotionConfig, motion, type Variants } from "motion/react";

// Shared motion vocabulary: short, soft, and off when the user prefers reduced motion.
const EASE = [0.22, 1, 0.36, 1] as const;

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease: EASE }}>{children}</MotionConfig>;
}

/** Fades content up into place on mount. */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } };
const item: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } };

/** A list whose children appear one after another. Use with <StaggerItem>. */
export function Stagger({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "ul" }) {
  const Comp = as === "ul" ? motion.ul : motion.div;
  return <Comp className={className} variants={list} initial="hidden" animate="show">{children}</Comp>;
}

export function StaggerItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" }) {
  const Comp = as === "li" ? motion.li : motion.div;
  return <Comp className={className} variants={item}>{children}</Comp>;
}
