import Link from "next/link";
import { FilterForm } from "@/components/filter-form";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, ScanLine, Settings2 } from "lucide-react";
import { formatTime } from "@/lib/format";
import { OPEN_STATUSES, TASK_KIND, TASK_STATUS, formatTaskTime } from "@/lib/tasks";
import type { Department, Task, TaskKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion";

import { MONTHS_AHEAD, daysInMonth, hkDay, label, monthKey, weekdayIndex, type EventRow, type SP } from "./dates";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KIND_ORDER: TaskKind[] = ["task", "upload", "errand"];
const KIND_HEADING: Record<TaskKind, string> = { task: "Tasks & deadlines", upload: "Scheduled uploads", errand: "Errands" };

export type CalendarData = {
  today: string;
  months: string[];
  month: string;
  selected: string;
  mine: boolean;
  department: string | undefined;
  rangeStart: string;
  rangeEnd: string;
  userId: string;
  isAdmin: boolean;
  isStaff: boolean;
  events: EventRow[];
  tasks: Task[];
  departments: Department[];
  names: Record<string, string>;
};

/** Pure view: everything it shows comes in through props. */
export function CalendarView(d: CalendarData) {
  const { today, months, month, selected, mine, rangeStart, rangeEnd } = d;
  const sp: SP = { department: d.department };
  const session = { userId: d.userId, access: { isAdmin: d.isAdmin, isStaff: d.isStaff } };
  const evData = d.events;
  const names = new Map(Object.entries(d.names));
  const depts = d.departments;
  const events = evData.filter((e) => {
    const d = hkDay(e.starts_at);
    return d >= rangeStart && d <= rangeEnd;
  });
  const tasks = d.tasks.filter(
    (t) => (!mine || t.owner_id === session.userId) && (!sp.department || t.department_id === sp.department),
  );
  const deptName = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const eventById = new Map(evData.map((e) => [e.id, e]));

  const eventsOn = (day: string) => events.filter((e) => hkDay(e.starts_at) === day);
  const tasksOn = (day: string) => tasks.filter((t) => t.due_on === day);

  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { month, day: selected, mine: mine ? "1" : "", department: sp.department ?? "", ...over };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/calendar?${p.toString()}`;
  };

  // Month grid cells: leading blanks so the 1st lands on the right weekday.
  const first = `${month}-01`;
  const cells: (string | null)[] = [
    ...Array.from({ length: weekdayIndex(first) }, () => null),
    ...Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);

  const monthIdx = months.indexOf(month);
  const dayEvents = eventsOn(selected);
  const dayTasks = tasksOn(selected);
  const openCount = tasks.filter((t) => OPEN_STATUSES.includes(t.status) && t.due_on && t.due_on >= today).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Next six months</p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">Calendar</h1>
          <p className="mt-1 text-sm text-muted">{events.length} events · {openCount} open deadlines</p>
        </div>
        <FilterForm className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-line p-1 text-sm font-medium">
            <Link href={qs({ mine: "" })} className={cn("rounded-lg px-3 py-1.5 text-center", !mine ? "bg-surface shadow-[var(--shadow-soft)]" : "text-muted")}>All</Link>
            <Link href={qs({ mine: "1" })} className={cn("rounded-lg px-3 py-1.5 text-center", mine ? "bg-surface shadow-[var(--shadow-soft)]" : "text-muted")}>Mine</Link>
          </div>
          {mine && <input type="hidden" name="mine" value="1" />}
          <select name="department" defaultValue={sp.department ?? ""} className="input w-auto py-2 text-sm" aria-label="Department">
            <option value="">All departments</option>
            {(depts ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </FilterForm>
      </div>

      {/* Six month tabs */}
      <nav className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Months">
        {months.map((m) => {
          const count = events.filter((e) => monthKey(hkDay(e.starts_at)) === m).length + tasks.filter((t) => t.due_on && monthKey(t.due_on) === m).length;
          return (
            <Link
              key={m}
              href={qs({ month: m, day: "" })}
              aria-current={m === month ? "page" : undefined}
              className={cn(
                "flex shrink-0 flex-col items-start rounded-2xl border px-4 py-2 text-left transition-colors",
                m === month ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink/20",
              )}
            >
              <span className="text-sm font-medium">{label(`${m}-01`, { month: "short" })}</span>
              <span className={cn("text-[11px]", m === month ? "text-white/70" : "text-muted")}>
                {m.slice(0, 4)}{count > 0 && ` · ${count}`}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Month grid */}
        <section className="card p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-lg font-medium">{label(first, { month: "long", year: "numeric" })}</h2>
            <div className="flex gap-1">
              <MonthArrow href={monthIdx > 0 ? qs({ month: months[monthIdx - 1], day: "" }) : null} label="Previous month"><ChevronLeft className="size-4" /></MonthArrow>
              <MonthArrow href={monthIdx < MONTHS_AHEAD - 1 ? qs({ month: months[monthIdx + 1], day: "" }) : null} label="Next month"><ChevronRight className="size-4" /></MonthArrow>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-medium tracking-wide text-muted uppercase">
            {WEEKDAYS.map((d) => <div key={d} className="py-2">{d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span></div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={`b${i}`} className="min-h-14 sm:min-h-28" />;
              const evs = eventsOn(day);
              const ts = tasksOn(day);
              const items = [
                ...evs.map((e) => ({ key: e.id, text: e.title, cls: "bg-brand text-white", dot: "bg-brand", done: false })),
                ...ts.map((t) => ({ key: t.id, text: t.title, cls: TASK_KIND[t.kind].chip, dot: TASK_KIND[t.kind].dot, done: t.status === "done" })),
              ];
              const isToday = day === today;
              const isSel = day === selected;
              const past = day < today;
              return (
                <Link
                  key={day}
                  href={qs({ day })}
                  scroll={false}
                  aria-current={isSel ? "date" : undefined}
                  aria-label={`${label(day, { weekday: "long", day: "numeric", month: "long" })}: ${items.length} item${items.length === 1 ? "" : "s"}`}
                  className={cn(
                    "group flex min-h-14 flex-col gap-1 rounded-xl p-1.5 text-left transition-colors sm:min-h-28 sm:p-2",
                    isSel ? "bg-brand-soft ring-1 ring-brand/30" : "hover:bg-page",
                    past && !isSel && "opacity-55",
                  )}
                >
                  <span className={cn(
                    "flex size-6 items-center justify-center self-center rounded-full text-xs tabular-nums sm:self-start sm:text-[13px]",
                    isToday ? "bg-brand font-semibold text-white" : "text-ink",
                  )}>
                    {Number(day.slice(8))}
                  </span>
                  {/* Phones: coloured dots */}
                  {items.length > 0 && (
                    <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                      {items.slice(0, 4).map((it) => <span key={it.key} className={cn("size-1.5 rounded-full", it.dot, it.done && "opacity-40")} />)}
                    </span>
                  )}
                  {/* Larger screens: chips */}
                  <span className="hidden flex-col gap-1 sm:flex">
                    {items.slice(0, 3).map((it) => (
                      <span key={it.key} className={cn("truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium", it.cls, it.done && "line-through opacity-50")}>
                        {it.text}
                      </span>
                    ))}
                    {items.length > 3 && <span className="px-1.5 text-[11px] text-muted">+{items.length - 3} more</span>}
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-muted">
            <Legend dot="bg-brand" text="Event" />
            {KIND_ORDER.map((k) => <Legend key={k} dot={TASK_KIND[k].dot} text={TASK_KIND[k].short} />)}
          </div>
        </section>

        {/* Day breakdown */}
        <Reveal key={selected} className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">{selected === today ? "Today" : label(selected, { weekday: "long" })}</p>
              <h2 className="mt-1 font-display text-2xl">{label(selected, { day: "numeric", month: "long" })}</h2>
            </div>
            <Link href={`/tasks?due=${selected}`} className="btn-ghost px-3 py-1.5 text-xs"><Plus className="size-3.5" aria-hidden />Add</Link>
          </div>

          {dayEvents.length === 0 && dayTasks.length === 0 && (
            <div className="card flex flex-col items-center gap-2 py-10 text-center">
              <CalendarDays className="size-6 text-muted" aria-hidden />
              <p className="text-sm text-muted">Nothing on this day.</p>
              <Link href={`/tasks?due=${selected}`} className="text-sm text-brand underline-offset-4 hover:underline">Add a task, upload or errand</Link>
            </div>
          )}

          {dayEvents.map((e) => (
            <div key={e.id} className="card space-y-3 border-brand/20 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="badge bg-brand text-white">Event</span>
                  <p className="mt-2 font-medium">{e.title}</p>
                  <p className="text-sm text-muted">
                    {formatTime(e.starts_at)}{e.ends_at && ` – ${formatTime(e.ends_at)}`}
                  </p>
                  {e.venue && <p className="mt-0.5 flex items-center gap-1 text-sm text-muted"><MapPin className="size-3.5" aria-hidden />{e.venue}</p>}
                </div>
                {!e.is_published && <span className="badge bg-warn/10 text-warn">Draft</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/events/${e.slug}`} className="btn-ghost px-3 py-1.5 text-xs">Event page</Link>
                {session.access.isAdmin && <Link href={`/admin/events/${e.id}`} className="btn-ghost px-3 py-1.5 text-xs"><Settings2 className="size-3.5" aria-hidden />Manage</Link>}
                {session.access.isStaff && <Link href={`/scan/${e.id}`} className="btn-ghost px-3 py-1.5 text-xs"><ScanLine className="size-3.5" aria-hidden />Scanner</Link>}
              </div>
            </div>
          ))}

          {KIND_ORDER.map((kind) => {
            const list = dayTasks.filter((t) => t.kind === kind);
            if (list.length === 0) return null;
            const K = TASK_KIND[kind];
            return (
              <section key={kind} className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <span className={cn("flex size-5 items-center justify-center rounded-md", K.chip)}><K.icon className="size-3.5" aria-hidden /></span>
                  {KIND_HEADING[kind]}
                </h3>
                <ul className="space-y-2">
                  {list.map((t) => {
                    const overdue = OPEN_STATUSES.includes(t.status) && t.due_on! < today;
                    const ev = t.event_id ? eventById.get(t.event_id) : undefined;
                    return (
                      <li key={t.id}>
                        <Link href={`/tasks/${t.id}`} className="card-link block space-y-1.5 p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn("font-medium leading-snug", t.status === "done" && "text-muted line-through")}>{t.title}</p>
                            <span className={`badge shrink-0 ${TASK_STATUS[t.status].cls}`}>{TASK_STATUS[t.status].label}</span>
                          </div>
                          <p className="text-xs text-muted">
                            {t.owner_id ? (names.get(t.owner_id) ?? "Former team member") : <strong className="text-warn">Unassigned</strong>}
                            {" · "}{deptName.get(t.department_id)}
                            {t.due_time && ` · ${formatTaskTime(t.due_time)}`}
                            {ev && ` · for ${ev.title}`}
                            {overdue && <strong className="text-bad"> · overdue</strong>}
                          </p>
                          {t.description && <p className="line-clamp-2 text-xs text-ink/70">{t.description}</p>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </Reveal>
      </div>
    </div>
  );
}

function MonthArrow({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  if (!href) return <span className="btn-ghost pointer-events-none px-2 py-1.5 opacity-30" aria-hidden>{children}</span>;
  return <Link href={href} aria-label={label} className="btn-ghost px-2 py-1.5">{children}</Link>;
}

function Legend({ dot, text }: { dot: string; text: string }) {
  return <span className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", dot)} />{text}</span>;
}
