"use client";

import { motion, type Variants } from "motion/react";
import { ArrowDown, DoorOpen, HandHeart, PartyPopper, Ticket, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEMBERSHIP_BENEFITS, PAYBACK_EVENTS, PRICE_TIERS, PRICES_YEAR, type Tone } from "@/lib/membership-content";

// Membership page, the fun parts. Motion is off for people who prefer reduced
// motion (MotionConfig reducedMotion="user" in the root layout).

const EASE = [0.22, 1, 0.36, 1] as const;
const ICONS: Record<(typeof MEMBERSHIP_BENEFITS)[number]["icon"], LucideIcon> = { door: DoorOpen, food: UtensilsCrossed, henna: HandHeart, ticket: Ticket };

const TONE: Record<Tone, { card: string; chip: string; text: string }> = {
  brand: { card: "bg-brand/[0.07] border-brand/25", chip: "bg-brand text-white", text: "text-brand" },
  yellow: { card: "bg-sass-yellow/35 border-sass-yellow", chip: "bg-ink text-sass-yellow", text: "text-ink" },
  turquoise: { card: "bg-sass-turquoise/15 border-sass-turquoise/40", chip: "bg-sass-turquoise text-white", text: "text-[#1d7f83]" },
  purple: { card: "bg-sass-purple/[0.08] border-sass-purple/25", chip: "bg-sass-purple text-white", text: "text-sass-purple" },
  pink: { card: "bg-sass-pink/35 border-sass-pink", chip: "bg-brand text-white", text: "text-brand" },
  blue: { card: "bg-sass-blue/[0.07] border-sass-blue/25", chip: "bg-sass-blue text-white", text: "text-sass-blue" },
};

const rise: Variants = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } };
const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };
const inView = { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.25 } } as const;

/** Slowly drifting blobs in the SASS palette, behind the hero. */
function Blobs() {
  const blobs = [
    { c: "bg-sass-pink", s: "size-64 sm:size-80", p: "-left-16 -top-10", d: 14 },
    { c: "bg-sass-yellow", s: "size-56 sm:size-72", p: "right-[-3rem] top-6", d: 17 },
    { c: "bg-sass-turquoise", s: "size-48 sm:size-64", p: "left-1/3 top-40", d: 19 },
    { c: "bg-sass-purple/60", s: "size-40 sm:size-56", p: "right-1/4 -bottom-16", d: 16 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[2rem]" aria-hidden>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={cn("absolute rounded-full opacity-50 blur-3xl", b.c, b.s, b.p)}
          animate={{ x: [0, 30, -20, 0], y: [0, -25, 15, 0], scale: [1, 1.08, 0.95, 1] }}
          transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export function MembershipHero({ memberUntil, joinable }: { memberUntil: string | null; joinable: boolean }) {
  return (
    <section className="relative isolate overflow-hidden rounded-[2rem] border border-line bg-surface/60 px-6 py-14 text-center sm:px-10 sm:py-20">
      <Blobs />
      <motion.div variants={list} initial="hidden" animate="show" className="relative">
        <motion.p variants={rise} className="eyebrow">South Asian Student Society · Membership</motion.p>
        {memberUntil ? (
          <motion.h1 variants={rise} className="mx-auto mt-4 max-w-2xl font-display text-4xl leading-[1.05] sm:text-6xl">
            You&apos;re in. <span className="font-brand text-brand">Enjoy the perks.</span>
          </motion.h1>
        ) : (
          <motion.h1 variants={rise} className="mx-auto mt-4 max-w-2xl font-display text-4xl leading-[1.05] sm:text-6xl">
            Your membership <span className="font-brand text-brand">pays for itself!</span>
          </motion.h1>
        )}
        <motion.p variants={rise} className="mx-auto mt-5 max-w-md text-base leading-relaxed text-ink/75">
          {memberUntil
            ? "Free entry, free food, free mehendi and cheaper tickets, all year."
            : `Come to just ${PAYBACK_EVENTS} flagship events and you've earned your fee back. Every event after that? Pure profit.`}
        </motion.p>
        {!memberUntil && (
          <motion.a
            variants={rise}
            href={joinable ? "#join" : "#prices"}
            className="btn-primary mt-8 px-6 py-3 text-base"
          >
            {joinable ? "Become a member" : "See the prices"}
            <motion.span animate={{ y: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
              <ArrowDown className="size-4" aria-hidden />
            </motion.span>
          </motion.a>
        )}
      </motion.div>
    </section>
  );
}

/** The torn-ticket "Pay once. Profit all year." and the two-events payback strip. */
export function PaysForItself() {
  return (
    <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
      <motion.div
        {...inView}
        variants={{ hidden: { opacity: 0, rotate: -9, scale: 0.9 }, show: { opacity: 1, rotate: -4, scale: 1, transition: { duration: 0.8, ease: EASE } } }}
        whileHover={{ rotate: 0, scale: 1.02 }}
        className="relative mx-auto w-[86%] max-w-md sm:w-full"
      >
        <div
          className="relative rounded-2xl bg-brand px-8 py-10 text-center text-brand-ink shadow-[var(--shadow-lift)]"
          style={{
            // Ticket notches on both sides.
            WebkitMask: "radial-gradient(circle at 0 50%, transparent 18px, #000 19px) left/51% 100% no-repeat, radial-gradient(circle at 100% 50%, transparent 18px, #000 19px) right/51% 100% no-repeat",
            mask: "radial-gradient(circle at 0 50%, transparent 18px, #000 19px) left/51% 100% no-repeat, radial-gradient(circle at 100% 50%, transparent 18px, #000 19px) right/51% 100% no-repeat",
          }}
        >
          <div className="rounded-xl border-2 border-dashed border-white/40 px-4 py-8">
            <p className="font-brand text-4xl leading-tight sm:text-5xl">Pay once.</p>
            <p className="mt-1 font-brand text-4xl leading-tight text-sass-yellow sm:text-5xl">Profit all year!</p>
          </div>
        </div>
      </motion.div>

      <motion.div {...inView} variants={list} className="space-y-5">
        <motion.h2 variants={rise} className="font-display text-3xl leading-tight">
          Two flagship events. <span className="text-brand">Fee earned back.</span>
        </motion.h2>
        <motion.div variants={rise} className="flex items-center gap-2 sm:gap-3" aria-label={`${PAYBACK_EVENTS} events pay it back, every event after is profit`}>
          {Array.from({ length: PAYBACK_EVENTS }, (_, i) => (
            <motion.span
              key={i}
              initial={{ scale: 0.6, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 + i * 0.35, type: "spring", stiffness: 300, damping: 18 }}
              className="flex h-14 flex-1 items-center justify-center gap-1.5 rounded-xl bg-sass-turquoise/20 text-sm font-medium text-[#1d7f83] ring-1 ring-sass-turquoise/40"
            >
              <Ticket className="size-4" aria-hidden />Event {i + 1}
            </motion.span>
          ))}
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.35 + PAYBACK_EVENTS * 0.35, type: "spring", stiffness: 300, damping: 14 }}
            className="flex h-14 flex-[1.3] items-center justify-center gap-1.5 rounded-xl bg-sass-yellow text-sm font-semibold text-ink shadow-[var(--shadow-soft)]"
          >
            <PartyPopper className="size-4" aria-hidden />Then: profit
          </motion.span>
        </motion.div>
        <motion.p variants={rise} className="text-sm leading-relaxed text-muted">
          Member prices are applied automatically when you get a ticket, so you start saving from your first event.
        </motion.p>
      </motion.div>
    </section>
  );
}

export function BenefitGrid({ title }: { title: string }) {
  return (
    <section className="space-y-6">
      <motion.h2 {...inView} variants={rise} className="text-center font-display text-3xl">
        {title}
      </motion.h2>
      <motion.ul {...inView} variants={list} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {MEMBERSHIP_BENEFITS.map((b) => {
          const Icon = ICONS[b.icon];
          const t = TONE[b.tone];
          return (
            <motion.li
              key={b.title}
              variants={rise}
              whileHover={{ y: -6, rotate: -1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={cn("group rounded-3xl border p-4 sm:p-6", t.card)}
            >
              <span className={cn("flex size-10 items-center justify-center rounded-2xl sm:size-12 shadow-[var(--shadow-soft)] transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110 motion-reduce:transition-none", t.chip)}>
                <Icon className="size-6" aria-hidden />
              </span>
              <p className={cn("mt-4 font-semibold leading-snug sm:mt-5 sm:text-lg", t.text)}>{b.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink/75">{b.text}</p>
            </motion.li>
          );
        })}
      </motion.ul>
    </section>
  );
}

export function PriceTiers({ salesOpen, nextYear }: { salesOpen: boolean; nextYear: string }) {
  const perYear = (t: (typeof PRICE_TIERS)[number]) => Math.round(t.price / t.years);
  return (
    <section id="prices" className="scroll-mt-24 space-y-6">
      <motion.div {...inView} variants={rise} className="text-center">
        <h2 className="font-display text-3xl">Open to everyone</h2>
        <p className="mt-2 text-sm text-muted">
          {salesOpen ? "Pick how long you want it for. The longer, the cheaper per year." : `${PRICES_YEAR} prices. Stay tuned for ${nextYear}.`}
        </p>
      </motion.div>
      <motion.ul {...inView} variants={list} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {PRICE_TIERS.map((t) => (
          <motion.li
            key={t.years}
            variants={rise}
            whileHover={{ y: -4 }}
            className={cn(
              "relative rounded-3xl border bg-surface p-5 text-center shadow-[var(--shadow-soft)] sm:p-6",
              t.best ? "border-brand ring-2 ring-brand/20" : "border-line",
            )}
          >
            {t.best && (
              <motion.span
                initial={{ scale: 0, rotate: -12 }}
                whileInView={{ scale: 1, rotate: 6 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 12 }}
                className="absolute -right-2 -top-3 rounded-full bg-sass-yellow px-2.5 py-1 text-[11px] font-bold tracking-wide text-ink uppercase shadow-[var(--shadow-soft)]"
              >
                Best value
              </motion.span>
            )}
            <p className="text-sm font-medium text-muted">{t.years} {t.years === 1 ? "year" : "years"}</p>
            <p className="mt-2 font-display text-3xl tabular-nums sm:text-4xl">
              <span className="text-base align-top text-muted">HK$</span>{t.price}
            </p>
            <p className={cn("mt-2 text-xs", t.years > 1 ? "font-medium text-ok" : "text-muted")}>
              {t.years > 1 ? `HK$${perYear(t)} a year` : "per year"}
            </p>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

/** "SASS members ≠ SASS team": you don't need to join the committee for the perks. */
export function NotTheTeam() {
  return (
    <motion.section {...inView} variants={list} className="rounded-[2rem] bg-ink px-6 py-12 text-center text-white sm:px-10">
      <motion.div variants={rise} className="flex flex-col items-center justify-center gap-2 font-display text-2xl sm:flex-row sm:gap-5 sm:text-4xl">
        <span className="rounded-2xl bg-brand px-4 py-2">SASS members</span>
        <motion.span
          initial={{ rotate: -90, opacity: 0 }}
          whileInView={{ rotate: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 12 }}
          className="font-brand text-4xl text-sass-yellow sm:text-5xl"
          aria-label="are not the same as"
        >
          ≠
        </motion.span>
        <span className="rounded-2xl bg-sass-turquoise px-4 py-2 text-ink">SASS team</span>
      </motion.div>
      <motion.p variants={rise} className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-white/80">
        Being a member doesn&apos;t mean you&apos;re on the committee. You don&apos;t have to join the team to enjoy everything SASS has to offer.
      </motion.p>
    </motion.section>
  );
}
