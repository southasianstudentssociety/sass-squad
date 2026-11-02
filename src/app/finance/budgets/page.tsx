import Link from "next/link";
import { Download, Minus, Plus } from "lucide-react";
import { requireFinance } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayInHongKong } from "@/lib/format";
import { academicYear, money, statement, yearLabel, type FinanceLine } from "@/lib/budgets";
import { cn } from "@/lib/utils";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Modal } from "@/components/modal";
import { Stagger, StaggerItem } from "@/components/motion";
import { EntryForm } from "./entry-form";
import { setOpeningBalance } from "./actions";
import { StatementTable } from "./statement-table";

export const metadata = { title: "Accounts" };

type EventRow = { id: string; title: string; starts_at: string };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ year?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await requireFinance("/finance/budgets");
  const supabase = await createClient();
  const today = todayInHongKong();
  const thisYear = academicYear(today);

  const [{ data: lineData }, { data: eventData }, { data: yearsData }] = await Promise.all([
    supabase.rpc("finance_lines", { p_year_start: null }),
    supabase.from("events").select("id, title, starts_at").order("starts_at").returns<EventRow[]>(),
    supabase.from("finance_years").select("year_start, opening_cents, note, set_at").returns<{ year_start: number; opening_cents: number; note: string | null; set_at: string }[]>(),
  ]);
  const allLines = (lineData ?? []) as FinanceLine[];
  const allEvents = (eventData ?? []).map((e) => ({ ...e, year: academicYear(todayInHongKong(new Date(e.starts_at))) }));

  const years = [...new Set([thisYear, ...allLines.map((l) => l.year_start), ...allEvents.map((e) => e.year)])].sort((a, b) => b - a);
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : thisYear;
  const here = `/finance/budgets?year=${year}`;

  const lines = allLines.filter((l) => l.year_start === year);
  const events = allEvents.filter((e) => e.year === year).reverse();
  const st = statement(lines);
  const opening = (yearsData ?? []).find((y) => y.year_start === year) ?? null;
  const formEvents = events.map((e) => ({ id: e.id, title: e.title, date: formatDate(e.starts_at) }));

  // Event cards: each event in the year, plus money not tied to an event.
  const cards = [
    ...events.map((e) => ({ key: e.id, href: `/finance/budgets/${e.id}`, title: e.title, sub: formatDate(e.starts_at), st: statement(lines.filter((l) => l.event_id === e.id)) })),
    { key: "general", href: `/finance/budgets/general?year=${year}`, title: "General", sub: "Memberships, grants, fees and anything not tied to one event", st: statement(lines.filter((l) => l.event_id === null)) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Accounts</h1>
          <p className="text-sm text-muted">Income statement for academic year {yearLabel(year)} (1 Sep to 31 Aug). Ticket sales, memberships and reimbursements come in automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Modal label="Add expense" title="Add an expense" description="Money the society paid directly: venue, alcohol, food, decor, fees. Things a member paid for and wants back go through Claims instead." icon={<Minus className="size-4" aria-hidden />}>
            <EntryForm kind="expense" back={here} userId={session.userId} today={today} events={formEvents} />
          </Modal>
          <Modal label="Add income" title="Add income" description="Money that came in that the hub doesn't already know about: sponsorship, Students' Union grants, donations, cash at the door. Ticket sales and memberships sold in the app are added automatically." triggerClassName="btn-blue" icon={<Plus className="size-4" aria-hidden />}>
            <EntryForm kind="income" back={here} userId={session.userId} today={today} events={formEvents} />
          </Modal>
        </div>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Academic year" className="inline-flex flex-wrap gap-1 rounded-xl bg-line p-1 text-sm font-medium">
          {years.map((y) => (
            <Link key={y} href={`/finance/budgets?year=${y}`} aria-current={y === year ? "page" : undefined}
              className={cn("rounded-lg px-3 py-1.5 tabular-nums transition-colors", y === year ? "bg-surface shadow-[var(--shadow-soft)]" : "text-muted hover:text-ink")}>
              {yearLabel(y)}
            </Link>
          ))}
        </nav>
        {/* A file download from a route handler, not a page, so a plain link is right. */}
        <a href={`/finance/budgets/export?year=${year}`} className="btn-ghost"><Download className="size-4" aria-hidden />Download (CSV)</a>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className="space-y-2">
          <h2 className="eyebrow">Income statement {yearLabel(year)}</h2>
          <StatementTable st={st} />
        </section>

        <section className="space-y-2">
          <h2 className="eyebrow">Bank balance</h2>
          <div className="card space-y-2 p-5 text-sm">
            <Row label={`Opening balance (1 Sep ${year})`} value={opening ? money(opening.opening_cents) : "Not set"} muted={!opening} />
            <Row label="+ Net for the year so far" value={money(st.net)} />
            {st.owedClaims > 0 && <Row label="+ Approved claims not paid out yet" value={money(st.owedClaims)} />}
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <span className="font-medium">Should be in the bank</span>
              <span className="text-xl font-semibold tabular-nums">{opening ? money(opening.opening_cents + st.net + st.owedClaims) : "-"}</span>
            </div>
            {st.owedClaims > 0 && opening && (
              <p className="text-xs text-muted">{money(opening.opening_cents + st.net)} after paying the {money(st.owedClaims)} we owe members for approved claims.</p>
            )}
            {(st.unpaidIncome > 0 || st.pendingClaims > 0) && (
              <p className="text-xs text-muted">
                Not counted yet: {[st.unpaidIncome > 0 && `${money(st.unpaidIncome)} not paid to us yet`, st.pendingClaims > 0 && `${money(st.pendingClaims)} in claims waiting for review`].filter(Boolean).join(" · ")}
              </p>
            )}
            <details className="border-t border-line pt-3">
              <summary className="cursor-pointer text-xs text-muted">{opening ? "Change the opening balance" : "Set the opening balance"}</summary>
              <form action={setOpeningBalance} className="mt-3 grid gap-2">
                <input type="hidden" name="back" value={here} />
                <input type="hidden" name="year" value={year} />
                <div>
                  <label className="label text-xs" htmlFor="ob-amt">Bank balance on 1 Sep {year} (HK$)</label>
                  <input id="ob-amt" name="opening" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={opening ? (opening.opening_cents / 100).toFixed(2) : undefined} placeholder="e.g. 15000.00" className="input" />
                </div>
                <div>
                  <label className="label text-xs" htmlFor="ob-note">Where it&apos;s from (optional)</label>
                  <input id="ob-note" name="note" maxLength={300} defaultValue={opening?.note ?? ""} placeholder="e.g. Bank statement, 1 Sep" className="input" />
                </div>
                <SubmitButton className="btn-ghost" pendingText="Saving…">Save balance</SubmitButton>
              </form>
            </details>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="eyebrow">By event</h2>
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <StaggerItem key={c.key}>
              <Link href={c.href} className="card-link flex h-full flex-col gap-4 p-5">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-sm text-muted">{c.sub}</p>
                </div>
                <dl className="space-y-1.5 text-sm">
                  <Line label="Income" value={money(c.st.totalIncome)} />
                  <Line label="Costs" value={money(-c.st.totalExpenses)} />
                </dl>
                <div className="mt-auto flex items-baseline justify-between border-t border-line pt-3">
                  <span className="text-sm text-muted">Net</span>
                  <span className={cn("text-xl font-semibold tabular-nums", c.st.net >= 0 ? "text-ok" : "text-bad")}>{money(c.st.net)}</span>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={cn("tabular-nums", muted && "text-muted")}>{value}</span>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
