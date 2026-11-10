"use client";

import { motion, type Variants } from "motion/react";
import { ArrowDown, Check, PartyPopper, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEMBERSHIP_PERKS, PAYBACK_EVENTS, PRICE_TIERS, PRICES_YEAR } from "@/lib/membership-content";

// Membership page, the fun parts. Styled after the society's own posts:
// paper tickets, rubber stamps, the brand script. Motion is off for people who
// prefer reduced motion (MotionConfig reducedMotion="user" in the root layout).

const EASE = [0.22, 1, 0.36, 1] as const;
const rise: Variants = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } };
const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const inView = { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.25 } } as const;

export type MemberPlan = { valid_until: string; years: number | null; exco: boolean } | null;

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Hong_Kong" }).format(new Date(`${iso}T12:00:00+08:00`));

/** Slowly drifting blobs in the SASS palette. */
function Blobs() {
  const blobs = [
    { c: "bg-sass-pink", s: "size-64 sm:size-80", p: "-left-16 -top-10", d: 14 },
    { c: "bg-sass-yellow", s: "size-56 sm:size-72", p: "right-[-3rem] top-6", d: 17 },
    { c: "bg-sass-turquoise", s: "size-48 sm:size-64", p: "left-1/3 top-40", d: 19 },
    { c: "bg-sass-purple/60", s: "size-40 sm:size-56", p: "right-1/4 -bottom-16", d: 16 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[2rem] [contain:paint]" aria-hidden>
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

export function MembershipHero({ member, joinable }: { member: boolean; joinable: boolean }) {
  return (
    <section className="relative isolate overflow-hidden rounded-[2rem] border border-line bg-surface/60 px-6 py-14 text-center [contain:paint] sm:px-10 sm:py-20">
      <Blobs />
      <motion.div variants={list} initial="hidden" animate="show" className="relative">
        <motion.p variants={rise} className="eyebrow">South Asian Student Society · Membership</motion.p>
        <motion.h1 variants={rise} className="mx-auto mt-4 max-w-2xl font-display text-4xl leading-[1.05] sm:text-6xl">
          {member ? <>You&apos;re in. <span className="font-brand text-brand">Enjoy the perks.</span></> : <>Your membership <span className="font-brand text-brand">pays for itself!</span></>}
        </motion.h1>
        <motion.p variants={rise} className="mx-auto mt-5 max-w-md text-base leading-relaxed text-ink/75">
          {member
            ? "Free entry to selected events, free food & drinks, early access to tickets and cheaper prices. Here's everything that's yours."
            : `Come to just ${PAYBACK_EVENTS} flagship events and you've earned your fee back. Every event after that? Pure profit.`}
        </motion.p>
        <motion.a variants={rise} href={member ? "#perks" : joinable ? "#join" : "#prices"} className="btn-primary mt-8 px-6 py-3 text-base">
          {member ? "See your perks" : joinable ? "Become a member" : "See the prices"}
          <motion.span animate={{ y: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
            <ArrowDown className="size-4" aria-hidden />
          </motion.span>
        </motion.a>
      </motion.div>
    </section>
  );
}

/** A member's pass: name, plan and expiry, like a lanyard card. */
export function MemberPass({ name, plan }: { name: string; plan: MemberPlan }) {
  const planLabel = plan?.exco ? "ExCo · until you graduate" : plan?.years ? `${plan.years}-year membership` : "Member";
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotate: -3 }}
      animate={{ opacity: 1, y: 0, rotate: -1.5 }}
      whileHover={{ rotate: 0, y: -4 }}
      transition={{ duration: 0.8, ease: EASE }}
      className="relative mx-auto w-full max-w-md overflow-hidden rounded-[1.75rem] bg-brand p-6 [contain:paint] text-brand-ink shadow-[var(--shadow-lift)] sm:p-7"
    >
      {/* paper pattern + a slow shine */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_20%_20%,#fff_0_2px,transparent_3px),radial-gradient(circle_at_70%_60%,#fff_0_1.5px,transparent_2.5px)] [background-size:28px_28px,22px_22px]" aria-hidden />
      <motion.div
        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
        animate={{ x: ["0%", "320%"] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 3.5, ease: "easeInOut" }}
        aria-hidden
      />
      <div className="relative flex items-start justify-between">
        <span className="font-brand text-3xl leading-none">SASS</span>
        <span className="rounded-full bg-sass-yellow px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-ink uppercase">Member</span>
      </div>
      <p className="relative mt-8 text-xs tracking-[0.25em] text-white/70 uppercase">Name</p>
      <p className="relative mt-1 truncate text-2xl font-semibold">{name}</p>
      <div className="relative mt-6 grid grid-cols-2 gap-4 border-t border-dashed border-white/35 pt-4 text-sm">
        <div>
          <p className="text-[11px] tracking-[0.2em] text-white/70 uppercase">Plan</p>
          <p className="mt-0.5 font-medium">{planLabel}</p>
        </div>
        <div>
          <p className="text-[11px] tracking-[0.2em] text-white/70 uppercase">Valid until</p>
          <p className="mt-0.5 font-medium">{plan ? fmtDate(plan.valid_until) : "-"}</p>
        </div>
      </div>
    </motion.div>
  );
}

/** A scrolling ribbon of the perks. Stays still for reduced motion. */
export function PerkRibbon() {
  const words = ["Early access", "Free food & drinks", "Cheaper tickets", "Members-only nights"];
  const run = [...words, ...words];
  return (
    <div className="relative -mx-5 -rotate-1 overflow-hidden border-y-2 border-ink bg-sass-yellow py-3 [contain:paint] sm:mx-0 sm:rounded-xl" aria-hidden>
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex gap-8">
            {run.map((w, i) => (
              <span key={`${copy}-${i}`} className="flex items-center gap-8 font-display text-lg font-semibold tracking-wide text-ink uppercase">
                {w}<span className="text-brand">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const STUB: Record<(typeof MEMBERSHIP_PERKS)[number]["stub"], string> = {
  brand: "bg-brand text-white",
  purple: "bg-sass-purple text-white",
  turquoise: "bg-sass-turquoise text-ink",
  teal: "bg-teal text-white",
};

/** The perks as admission tickets, each "stamped". Members' stamps say YOURS. */
export function PerkTickets({ owned }: { owned: boolean }) {
  return (
    <section id="perks" className="scroll-mt-24 space-y-8">
      <motion.div {...inView} variants={rise} className="text-center">
        <h2 className="font-brand text-4xl text-brand sm:text-5xl">{owned ? "All yours" : "Members get more!"}</h2>
        <p className="mt-2 text-sm text-muted">{owned ? "Show up, and it's sorted. Member prices apply automatically." : "Four perks, one membership."}</p>
      </motion.div>
      <motion.ul {...inView} variants={list} className="grid gap-x-6 gap-y-8 pt-2 sm:grid-cols-2">
        {MEMBERSHIP_PERKS.map((p, i) => (
          <motion.li
            key={p.title}
            variants={rise}
            whileHover={{ rotate: 0, y: -4 }}
            style={{ rotate: i % 2 ? 1 : -1 }}
            className="relative flex min-h-36 overflow-visible"
          >
            <div
              className="flex w-full overflow-hidden rounded-2xl bg-[#fffaf0] shadow-[var(--shadow-soft)] ring-1 ring-ink/10"
              style={{
                WebkitMask: "radial-gradient(circle at 56px 0, transparent 9px, #000 10px) top/100% 51% no-repeat, radial-gradient(circle at 56px 100%, transparent 9px, #000 10px) bottom/100% 51% no-repeat",
                mask: "radial-gradient(circle at 56px 0, transparent 9px, #000 10px) top/100% 51% no-repeat, radial-gradient(circle at 56px 100%, transparent 9px, #000 10px) bottom/100% 51% no-repeat",
              }}
            >
              <div className={cn("flex w-14 shrink-0 items-center justify-center", STUB[p.stub])}>
                <span className="rotate-180 text-[10px] font-bold tracking-[0.3em] uppercase [writing-mode:vertical-rl]">Admit one · 0{i + 1}</span>
              </div>
              <div className="relative flex-1 border-l-2 border-dashed border-ink/15 py-5 pl-5 pr-5">
                <p className="pr-20 text-[10px] font-semibold tracking-[0.3em] text-muted uppercase">SASS member perk</p>
                <p className="mt-1.5 font-brand text-[1.7rem] leading-tight text-ink">{p.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink/70">{p.text}</p>
              </div>
            </div>
            <motion.span
              initial={{ scale: 2.2, opacity: 0, rotate: -30 }}
              whileInView={{ scale: 1, opacity: 1, rotate: -14 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ delay: 0.35 + i * 0.12, type: "spring", stiffness: 380, damping: 16 }}
              className={cn(
                "absolute -right-2 -top-4 flex items-center gap-1 rounded-lg border-[3px] border-double bg-[#fffaf0]/80 px-2.5 py-0.5 font-display text-base font-black tracking-[0.15em] uppercase sm:-right-3 sm:text-lg",
                owned ? "border-ok text-ok" : "border-brand text-brand",
              )}
              aria-label={owned ? "Yours" : p.stamp}
            >
              {owned && <Check className="size-4" strokeWidth={3} aria-hidden />}
              {owned ? "Yours" : p.stamp}
            </motion.span>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

/** The torn-ticket "Pay once. Profit all year." and the two-events payback strip. */
export function PaysForItself({ member }: { member: boolean }) {
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
          {member ? <>Two flagship events. <span className="text-brand">Then it&apos;s all profit.</span></> : <>Two flagship events. <span className="text-brand">Fee earned back.</span></>}
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

export function PriceTiers({ salesOpen, nextYear, plan }: { salesOpen: boolean; nextYear: string; plan?: MemberPlan }) {
  const perYear = (t: (typeof PRICE_TIERS)[number]) => Math.round(t.price / t.years);
  const mine = plan && !plan.exco ? plan.years : null;
  return (
    <section id="prices" className="scroll-mt-24 space-y-6">
      <motion.div {...inView} variants={rise} className="text-center">
        <h2 className="font-display text-3xl">{plan ? "Your plan" : "Open to everyone"}</h2>
        <p className="mt-2 text-sm text-muted">
          {plan?.exco
            ? "You're ExCo, so your membership runs until you graduate."
            : mine
              ? `You're on the ${mine}-year plan, valid until ${fmtDate(plan!.valid_until)}.`
              : salesOpen
                ? "Pick how long you want it for. The longer, the cheaper per year."
                : `${PRICES_YEAR} prices. Stay tuned for ${nextYear}.`}
        </p>
      </motion.div>
      <motion.ul {...inView} variants={list} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {PRICE_TIERS.map((t) => {
          const isMine = mine === t.years;
          return (
            <motion.li
              key={t.years}
              variants={rise}
              whileHover={{ y: -4 }}
              className={cn(
                "relative rounded-3xl border bg-surface p-5 text-center shadow-[var(--shadow-soft)] sm:p-6",
                isMine ? "border-ok bg-ok/[0.06] ring-2 ring-ok/25" : t.best && !mine ? "border-brand ring-2 ring-brand/20" : "border-line",
                mine && !isMine && "opacity-60",
              )}
            >
              {isMine ? (
                <motion.span
                  initial={{ scale: 0, rotate: -12 }}
                  whileInView={{ scale: 1, rotate: 4 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 12 }}
                  className="absolute -right-2 -top-3 flex items-center gap-1 rounded-full bg-ok px-2.5 py-1 text-[11px] font-bold tracking-wide text-white uppercase shadow-[var(--shadow-soft)]"
                >
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />Your plan
                </motion.span>
              ) : t.best && !mine ? (
                <motion.span
                  initial={{ scale: 0, rotate: -12 }}
                  whileInView={{ scale: 1, rotate: 6 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 12 }}
                  className="absolute -right-2 -top-3 rounded-full bg-sass-yellow px-2.5 py-1 text-[11px] font-bold tracking-wide text-ink uppercase shadow-[var(--shadow-soft)]"
                >
                  Best value
                </motion.span>
              ) : null}
              <p className="text-sm font-medium text-muted">{t.years} {t.years === 1 ? "year" : "years"}</p>
              <p className="mt-2 font-display text-3xl tabular-nums sm:text-4xl">
                <span className="align-top text-base text-muted">HK$</span>{t.price}
              </p>
              <p className={cn("mt-2 text-xs", t.years > 1 ? "font-medium text-ok" : "text-muted")}>
                {t.years > 1 ? `HK$${perYear(t)} a year` : "per year"}
              </p>
            </motion.li>
          );
        })}
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
