import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { claimableEvents } from "@/lib/claim-data";
import { teamNames } from "@/lib/inventory";
import { formatDate, formatDateTime, todayInHongKong } from "@/lib/format";
import { OPEN_STATUSES, TASK_KIND, TASK_STATUS, formatTaskTime } from "@/lib/tasks";
import type { Department, Task, TaskLogEntry, TaskStatus } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { setTaskStatus, updateTask } from "../actions";

export const metadata = { title: "Task" };

const FIELD_LABEL: Record<string, string> = {
  department_id: "department", title: "title", description: "details", event_id: "event", owner_id: "owner", due_on: "date", due_time: "time", kind: "type",
};

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireTeam(`/tasks/${id}`);
  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle<Task>();
  if (!task) notFound();

  const [{ data: logData }, { data: depts }, { data: mine }, { data: team }, events] = await Promise.all([
    supabase.from("task_log").select("*").eq("task_id", id).order("created_at", { ascending: false }).returns<TaskLogEntry[]>(),
    supabase.from("departments").select("id, name, handles_finance").order("name").returns<Department[]>(),
    supabase.rpc("my_task_departments"),
    supabase.rpc("team_directory"),
    claimableEvents(),
  ]);
  const log = logData ?? [];
  const departments = depts ?? [];
  const myDepts = new Set((mine ?? []) as string[]);
  const directory = (team ?? []) as { user_id: string; full_name: string | null; email: string }[];
  const names = await teamNames([task.owner_id, task.created_by, ...log.map((e) => e.actor_id)]);
  const name = (uid: string | null) => (uid ? (names.get(uid) ?? "Former team member") : "nobody");
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const eventTitle = events.find((e) => e.id === task.event_id)?.title;
  const today = todayInHongKong();
  const canEdit = myDepts.has(task.department_id);
  const canSetStatus = canEdit || task.owner_id === session.userId;
  const overdue = task.due_on && task.due_on < today && OPEN_STATUSES.includes(task.status);
  const lastBlocked = log.find((e) => e.action === "status" && e.details?.to === "blocked");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/tasks" className="text-xs text-muted underline">← Tasks</Link>
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1.5">
          <span className={`badge ${TASK_STATUS[task.status].cls}`}>{TASK_STATUS[task.status].label}</span>
          <span className={`badge ${TASK_KIND[task.kind].chip}`}>{TASK_KIND[task.kind].short}</span>
        </div>
        <h1 className="text-3xl font-display font-normal">{task.title}</h1>
        <p className="text-sm text-muted">
          {deptName.get(task.department_id)}{eventTitle && ` · ${eventTitle}`} · {task.owner_id ? name(task.owner_id) : "Unassigned"}
          {task.due_on && <span className={overdue ? "font-semibold text-bad" : undefined}> · {task.kind === "upload" ? "goes up" : "due"} {formatDate(task.due_on)}{task.due_time && ` ${formatTaskTime(task.due_time)}`}{overdue && " (overdue)"}</span>}
        </p>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />
      {task.status === "blocked" && lastBlocked?.note && (
        <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad"><strong>Blocked:</strong> {lastBlocked.note}</p>
      )}
      {task.description && <p className="card whitespace-pre-wrap text-sm">{task.description}</p>}

      {canSetStatus && (
        <form action={setTaskStatus} className="card flex flex-wrap items-end gap-2">
          <input type="hidden" name="task_id" value={id} />
          <div>
            <label className="label text-xs" htmlFor="ts-status">Status</label>
            <select id="ts-status" name="status" defaultValue={task.status} className="input">
              {(Object.keys(TASK_STATUS) as TaskStatus[]).map((s) => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
            </select>
          </div>
          <div className="min-w-48 flex-1">
            <label className="label text-xs" htmlFor="ts-note">Note (required for Blocked)</label>
            <input id="ts-note" name="note" maxLength={500} placeholder="e.g. Waiting for Finance to approve budget" className="input" />
          </div>
          <SubmitButton pendingText="Saving…">Update</SubmitButton>
        </form>
      )}

      {canEdit && (
        <details className="card">
          <summary className="cursor-pointer font-bold">Edit task</summary>
          <form action={updateTask} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="task_id" value={id} />
            <div className="sm:col-span-2">
              <label className="label text-xs" htmlFor="et-title">Title</label>
              <input id="et-title" name="title" required maxLength={140} defaultValue={task.title} className="input" />
            </div>
            <div>
              <label className="label text-xs" htmlFor="et-dept">Department</label>
              <select id="et-dept" name="department_id" defaultValue={task.department_id} className="input">
                {departments.filter((d) => myDepts.has(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs" htmlFor="et-owner">Who</label>
              <select id="et-owner" name="owner_id" defaultValue={task.owner_id ?? ""} className="input">
                <option value="">Unassigned</option>
                {directory.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name ?? p.email}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs" htmlFor="et-event">Event</label>
              <select id="et-event" name="event_id" defaultValue={task.event_id ?? ""} className="input">
                <option value="">None</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.date}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs" htmlFor="et-kind">Type</label>
              <select id="et-kind" name="kind" defaultValue={task.kind} className="input">
                {Object.entries(TASK_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div>
                <label className="label text-xs" htmlFor="et-due">Date</label>
                <input id="et-due" name="due_on" type="date" defaultValue={task.due_on ?? ""} className="input" />
              </div>
              <div>
                <label className="label text-xs" htmlFor="et-time">Time</label>
                <input id="et-time" name="due_time" type="time" defaultValue={task.due_time?.slice(0, 5) ?? ""} className="input w-28" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label text-xs" htmlFor="et-desc">Details</label>
              <textarea id="et-desc" name="description" rows={3} maxLength={2000} defaultValue={task.description ?? ""} className="input" />
            </div>
            <div className="sm:col-span-2"><SubmitButton className="btn-ghost" pendingText="Saving…">Save</SubmitButton></div>
          </form>
        </details>
      )}
      {!canSetStatus && <p className="text-sm text-muted">Only the owner, {deptName.get(task.department_id)} or ExCo can change this task.</p>}

      <section className="space-y-2">
        <h2 className="font-bold">History</h2>
        <ol className="card space-y-2 text-sm">
          {log.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className="text-muted">{formatDateTime(e.created_at)}</span>
              <span>
                {e.action === "created" && <>Created</>}
                {e.action === "status" && <>Moved to <strong>{TASK_STATUS[(e.details?.to as TaskStatus) ?? "todo"]?.label}</strong></>}
                {e.action === "edited" && <>Changed {Object.keys(e.details ?? {}).map((k) => FIELD_LABEL[k] ?? k).join(", ")}</>}
                {" "}by {name(e.actor_id)}{e.note && `: ${e.note}`}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
