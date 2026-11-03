import { requireTeam } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { teamNames } from "@/lib/inventory";
import { addDays, todayInHongKong } from "@/lib/format";
import type { Department, Task } from "@/lib/types";
import { CalendarView } from "./calendar-view";
import { MONTHS_AHEAD, addMonths, daysInMonth, monthKey, type EventRow, type SP } from "./dates";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireTeam("/calendar");
  const sp = await searchParams;
  const today = todayInHongKong();
  const months = Array.from({ length: MONTHS_AHEAD }, (_, i) => addMonths(monthKey(today), i));
  const month = sp.month && months.includes(sp.month) ? sp.month : months[0];
  const selected = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && monthKey(sp.day) === month
    ? sp.day
    : monthKey(today) === month ? today : `${month}-01`;

  const rangeStart = `${months[0]}-01`;
  const rangeEnd = `${months[MONTHS_AHEAD - 1]}-${String(daysInMonth(months[MONTHS_AHEAD - 1])).padStart(2, "0")}`;

  const supabase = await createClient();
  const [{ data: events }, { data: tasks }, { data: depts }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, slug, starts_at, ends_at, venue, is_published")
      // a day of slack on each side; exact Hong Kong-day filtering happens in the view
      .gte("starts_at", `${addDays(rangeStart, -1)}T00:00:00Z`)
      .lte("starts_at", `${addDays(rangeEnd, 1)}T23:59:59Z`)
      .order("starts_at")
      .returns<EventRow[]>(),
    supabase
      .from("tasks")
      .select("*")
      .gte("due_on", rangeStart)
      .lte("due_on", rangeEnd)
      .neq("status", "cancelled")
      .is("archived_at", null)
      .order("due_on")
      .order("due_time", { nullsFirst: true })
      .returns<Task[]>(),
    supabase.from("departments").select("id, name, handles_finance").order("name").returns<Department[]>(),
  ]);
  const names = await teamNames((tasks ?? []).map((t) => t.owner_id));

  return (
    <CalendarView
      today={today}
      months={months}
      month={month}
      selected={selected}
      mine={sp.mine === "1"}
      department={sp.department}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      userId={session.userId}
      isAdmin={session.access.isAdmin}
      isStaff={session.access.isStaff}
      events={events ?? []}
      tasks={tasks ?? []}
      departments={depts ?? []}
      names={Object.fromEntries(names)}
    />
  );
}
