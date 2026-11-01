import Link from "next/link";
import { requireTeam } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { claimableEvents } from "@/lib/claim-data";
import { teamNames } from "@/lib/inventory";
import { formatDate, todayInHongKong } from "@/lib/format";
import { OPEN_STATUSES, TASK_KIND, TASK_STATUS, formatTaskTime } from "@/lib/tasks";
import type { Department, Task, TaskStatus } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createTask, setTaskStatus } from "./actions";
import { EmptyState } from "@/components/illustrations";

export const metadata = { title: "Tasks" };

type SP = { view?: string; department?: string; event?: string; done?: string; due?: string; ok?: string; error?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireTeam("/tasks");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: tasksData }, { data: depts }, { data: mine }, { data: team }, events] = await Promise.all([
    supabase.from("tasks").select("*").order("due_on", { nullsFirst: false }).order("created_at").returns<Task[]>(),
    supabase.from("departments").select("id, name, handles_finance").order("name").returns<Department[]>(),
    supabase.rpc("my_task_departments"),
    supabase.rpc("team_directory"),
    claimableEvents(),
  ]);
  const all = tasksData ?? [];
  const departments = depts ?? [];
  const myDepts = new Set((mine ?? []) as string[]);
  const directory = (team ?? []) as { user_id: string; full_name: string | null; email: string }[];
  const names = await teamNames(all.map((t) => t.owner_id));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const eventName = new Map(events.map((e) => [e.id, e.title]));
  const today = todayInHongKong();

  const view = sp.view === "all" ? "all" : "mine";
  const showDone = sp.done === "1";
  const statuses: TaskStatus[] = showDone ? [...OPEN_STATUSES, "done", "cancelled"] : OPEN_STATUSES;
  const tasks = all.filter(
    (t) =>
      (view === "all" || t.owner_id === session.userId) &&
      (!sp.department || t.department_id === sp.department) &&
      (!sp.event || t.event_id === sp.event) &&
      statuses.includes(t.status),
  );
  const myOpen = all.filter((t) => t.owner_id === session.userId && OPEN_STATUSES.includes(t.status));
  const overdueMine = myOpen.filter((t) => t.due_on && t.due_on < today).length;
  const unassigned = all.filter((t) => !t.owner_id && OPEN_STATUSES.includes(t.status)).length;
  const here = `/tasks?${new URLSearchParams(Object.entries({ view, department: sp.department ?? "", event: sp.event ?? "", done: sp.done ?? "" }).filter(([, v]) => v)).toString()}`;
  const creatable = departments.filter((d) => myDepts.has(d.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-normal">Tasks</h1>
        <p className="text-sm text-muted">
          {myOpen.length} open for you{overdueMine > 0 && <span className="text-bad"> · {overdueMine} overdue</span>}
          {unassigned > 0 && ` · ${unassigned} unassigned`}
        </p>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />

      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label text-xs" htmlFor="tf-view">Show</label>
          <select id="tf-view" name="view" defaultValue={view} className="input">
            <option value="mine">My tasks</option>
            <option value="all">Everyone&apos;s</option>
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="tf-dept">Department</label>
          <select id="tf-dept" name="department" defaultValue={sp.department ?? ""} className="input">
            <option value="">All</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="tf-event">Event</label>
          <select id="tf-event" name="event" defaultValue={sp.event ?? ""} className="input">
            <option value="">All</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input type="checkbox" name="done" value="1" defaultChecked={showDone} /> Include done
        </label>
        <button className="btn-ghost">Filter</button>
      </form>

      {all.length === 0 ? (
        <div className="card">
          <EmptyState illustration="tasks" title="No tasks yet">Add the first one below. Everyone on the team sees every department&apos;s tasks.</EmptyState>
        </div>
      ) : (
      <div className="grid gap-4 lg:grid-cols-3">
        {statuses.map((status) => {
          const column = tasks.filter((t) => t.status === status);
          return (
            <section key={status} className="space-y-2">
              <h2 className="flex items-center gap-2 font-bold">
                <span className={`badge ${TASK_STATUS[status].cls}`}>{TASK_STATUS[status].label}</span>
                <span className="text-sm font-normal text-muted">{column.length}</span>
              </h2>
              {column.length === 0 && <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">Nothing here</p>}
              {column.map((t) => {
                const overdue = t.due_on && t.due_on < today && OPEN_STATUSES.includes(t.status);
                return (
                  <article key={t.id} className="card animate-fade-up space-y-2 p-3.5">
                    <Link href={`/tasks/${t.id}`} className="flex items-start gap-2 font-medium hover:underline">
                      <KindIcon kind={t.kind} />
                      <span>{t.title}</span>
                    </Link>
                    <p className="text-xs text-muted">
                      {deptName.get(t.department_id)}
                      {t.event_id && eventName.get(t.event_id) && ` · ${eventName.get(t.event_id)}`}
                      {" · "}{t.owner_id ? (names.get(t.owner_id) ?? "Former team member") : <strong>Unassigned</strong>}
                      {t.due_on && <span className={overdue ? "font-semibold text-bad" : undefined}> · {t.kind === "upload" ? "goes up" : "due"} {formatDate(t.due_on)}{t.due_time && ` ${formatTaskTime(t.due_time)}`}{overdue && " (overdue)"}</span>}
                    </p>
                    {(t.status === "todo" || t.status === "doing") && (
                      <form action={setTaskStatus}>
                        <input type="hidden" name="task_id" value={t.id} />
                        <input type="hidden" name="return_to" value={here} />
                        <input type="hidden" name="status" value={t.status === "todo" ? "doing" : "done"} />
                        <SubmitButton className="btn-ghost px-2 py-1 text-xs" pendingText="Saving…">
                          {t.status === "todo" ? "Start" : "Mark done"}
                        </SubmitButton>
                      </form>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      )}

      <details className="card" open={all.length === 0 || !!sp.due}>
        <summary className="cursor-pointer font-bold">Add a task</summary>
        {creatable.length === 0 ? (
          <p className="mt-3 text-sm text-muted">You&apos;re not in a department yet. Ask an ExCo to add you on the Team page.</p>
        ) : (
          <form action={createTask} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="return_to" value={here} />
            <div className="sm:col-span-2">
              <label className="label" htmlFor="nt-title">What needs doing</label>
              <input id="nt-title" name="title" required maxLength={140} placeholder="e.g. Book the sound system for Diwali" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="nt-dept">Department</label>
              <select id="nt-dept" name="department_id" required defaultValue={sp.department && myDepts.has(sp.department) ? sp.department : creatable[0].id} className="input">
                {creatable.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="nt-owner">Who</label>
              <select id="nt-owner" name="owner_id" defaultValue={session.userId} className="input">
                <option value="">Unassigned</option>
                {directory.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name ?? p.email}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="nt-event">Event (optional)</label>
              <select id="nt-event" name="event_id" defaultValue={sp.event ?? ""} className="input">
                <option value="">None</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.date}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="nt-kind">Type</label>
              <select id="nt-kind" name="kind" defaultValue="task" className="input">
                {Object.entries(TASK_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div>
                <label className="label" htmlFor="nt-due">Date</label>
                <input id="nt-due" name="due_on" type="date" defaultValue={sp.due && /^\d{4}-\d{2}-\d{2}$/.test(sp.due) ? sp.due : undefined} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="nt-time">Time</label>
                <input id="nt-time" name="due_time" type="time" className="input w-28" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="nt-desc">Details (optional)</label>
              <textarea id="nt-desc" name="description" rows={2} maxLength={2000} className="input" />
            </div>
            <div className="sm:col-span-2"><SubmitButton pendingText="Adding…">Add task</SubmitButton></div>
          </form>
        )}
      </details>
    </div>
  );
}

function KindIcon({ kind }: { kind: Task["kind"] }) {
  const k = TASK_KIND[kind];
  return (
    <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ${k.chip}`} title={k.short}>
      <k.icon className="size-3.5" aria-hidden />
    </span>
  );
}
