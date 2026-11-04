"use client";

import Link from "next/link";
import { motion, type Variants } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// My tickets: each ticket as a paper admission ticket (same language as the
// /membership perks): coloured stub with the date, a dashed tear line, the
// title in the brand script, and a rubber stamp with the ticket's status.
// Tapping opens the normal ticket page. Motion is off for reduced motion
// (MotionConfig reducedMotion="user" in the root layout).

export type StubStatus = "confirmed" | "pending" | "cancelled" | "used";

export type StubTicket = {
  id: string;
  title: string;
  day: string; // "21"
  month: string; // "Nov"
  when: string; // "Sat, 21 Nov, 8:00 pm"
  venue: string | null;
  price: string; // "HK$230.00" / "Free"
  status: StubStatus;
  rate?: boolean; // past event they can still rate
};

const STAMP: Record<StubStatus, { text: string; cls: string; tick?: boolean }> = {
  confirmed: { text: "Confirmed", cls: "border-ok text-ok", tick: true },
  pending: { text: "Pending", cls: "border-warn text-warn" },
  cancelled: { text: "Cancelled", cls: "border-bad text-bad" },
  used: { text: "Admitted", cls: "border-ink/70 text-ink/70", tick: true },
};

const STUBS = ["bg-brand text-white", "bg-sass-purple text-white", "bg-teal text-white", "bg-sass-turquoise text-ink"] as const;

const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const rise: Variants = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } } };

// Two half-circle notches where the stub meets the body, like a real ticket.
const NOTCH = "radial-gradient(circle at 76px 0, transparent 9px, #000 10px) top/100% 51% no-repeat, radial-gradient(circle at 76px 100%, transparent 9px, #000 10px) bottom/100% 51% no-repeat";

export function TicketStubs({ tickets }: { tickets: StubTicket[] }) {
  return (
    <motion.ul variants={list} initial="hidden" animate="show" className="grid gap-x-6 gap-y-7 pt-3 sm:grid-cols-2">
      {tickets.map((t, i) => {
        const stamp = STAMP[t.status];
        const off = t.status === "cancelled";
        return (
          <motion.li key={t.id} variants={rise} whileHover={{ rotate: 0, y: -4 }} style={{ rotate: i % 2 ? 0.8 : -0.8 }} className="relative">
            <Link
              href={`/tickets/${t.id}`}
              className={cn("flex min-h-32 overflow-hidden rounded-2xl bg-[#fffaf0] shadow-[var(--shadow-soft)] ring-1 ring-ink/10 transition-shadow hover:shadow-[var(--shadow-lift)]", off && "grayscale-[0.7]")}
              style={{ WebkitMask: NOTCH, mask: NOTCH }}
            >
              <div className={cn("flex w-[76px] shrink-0 flex-col items-center justify-center gap-0.5 py-4", STUBS[i % STUBS.length])}>
                <span className="text-[1.9rem] font-semibold leading-none tabular-nums">{t.day}</span>
                <span className="text-[11px] font-bold tracking-[0.25em] uppercase">{t.month}</span>
                <span className="mt-2 text-[8px] font-bold tracking-[0.3em] uppercase opacity-75">Admit one</span>
              </div>
              <div className="relative min-w-0 flex-1 border-l-2 border-dashed border-ink/15 py-4 pl-4 pr-4 sm:pl-5">
                <p className="pr-24 text-[10px] font-semibold tracking-[0.3em] text-muted uppercase">SASS ticket</p>
                <p className={cn("mt-1 line-clamp-2 font-brand text-[1.55rem] leading-[1.15] text-ink", off && "line-through decoration-bad/50 decoration-2")}>{t.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-ink/70">{t.when}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink/60">
                  {t.venue && <>{t.venue} · </>}
                  <span className="font-medium text-ink">{t.price}</span>
                </p>
                {t.rate && <span className="badge mt-2 bg-accent text-accent-ink">Rate it</span>}
              </div>
            </Link>
            <motion.span
              initial={{ scale: 2.2, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: -12 }}
              transition={{ delay: 0.35 + i * 0.1, type: "spring", stiffness: 380, damping: 16 }}
              className={cn(
                "pointer-events-none absolute -right-1 -top-3 flex items-center gap-1 rounded-lg border-[3px] border-double bg-[#fffaf0]/85 px-2 py-0.5 font-display text-sm font-black tracking-[0.14em] uppercase sm:-right-2 sm:text-base",
                stamp.cls,
              )}
              aria-label={stamp.text}
            >
              {stamp.tick && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
              {stamp.text}
            </motion.span>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
