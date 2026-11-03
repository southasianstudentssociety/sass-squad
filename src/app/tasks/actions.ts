"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["todo", "doing", "blocked", "done", "cancelled"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const KINDS = ["task", "upload", "errand"];

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optional = (f: FormData, k: string) => str(f, k) || null;
const date = (f: FormData, k: string) => (DATE_RE.test(str(f, k)) ? str(f, k) : null);
const time = (f: FormData, k: string) => (TIME_RE.test(str(f, k)) ? str(f, k) : null);
const kind = (f: FormData) => (KINDS.includes(str(f, "kind")) ? str(f, "kind") : "task");

function rpcError(e: { code?: string; message: string } | null, fallback: string) {
  return e?.code === "P0001" ? e.message : fallback;
}

/** Back to the page the form was on (kept in a hidden "return_to" field), with a message. */
function back(formData: FormData, fallback: string, params: Record<string, string>): never {
  const target = str(formData, "return_to");
  const path = (target.startsWith("/tasks") || target.startsWith("/calendar")) && !target.startsWith("//") ? target : fallback;
  const url = new URL(path, "http://x");
  url.searchParams.delete("ok");
  url.searchParams.delete("error");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  redirect(`${url.pathname}${url.search}`);
}

export async function createTask(formData: FormData) {
  await requireTeam("/tasks");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_task", {
    p_department_id: str(formData, "department_id"),
    p_title: str(formData, "title"),
    p_description: optional(formData, "description"),
    p_event_id: optional(formData, "event_id"),
    p_owner_id: optional(formData, "owner_id"),
    p_due_on: date(formData, "due_on"),
    p_kind: kind(formData),
    p_due_time: time(formData, "due_time"),
  });
  if (error) back(formData, "/tasks", { error: rpcError(error, "Couldn't add the task.") });
  revalidatePath("/tasks");
  back(formData, "/tasks", { ok: "Task added." });
}

export async function updateTask(formData: FormData) {
  const id = str(formData, "task_id");
  await requireTeam(`/tasks/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_task", {
    p_task_id: id,
    p_department_id: str(formData, "department_id"),
    p_title: str(formData, "title"),
    p_description: optional(formData, "description"),
    p_event_id: optional(formData, "event_id"),
    p_owner_id: optional(formData, "owner_id"),
    p_due_on: date(formData, "due_on"),
    p_kind: kind(formData),
    p_due_time: time(formData, "due_time"),
  });
  if (error) back(formData, `/tasks/${id}`, { error: rpcError(error, "Couldn't save the task.") });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  back(formData, `/tasks/${id}`, { ok: "Saved." });
}

export async function setTaskArchived(formData: FormData) {
  const id = str(formData, "task_id");
  await requireTeam(`/tasks/${id}`);
  const archive = str(formData, "archive") === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_task_archived", { p_task_id: id, p_archived: archive });
  if (error) back(formData, `/tasks/${id}`, { error: rpcError(error, archive ? "Couldn't archive it." : "Couldn't restore it.") });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/calendar");
  back(formData, `/tasks/${id}`, { ok: archive ? "Archived. Find it under Archive." : "Restored from the archive." });
}

export async function setTaskStatus(formData: FormData) {
  const id = str(formData, "task_id");
  await requireTeam(`/tasks/${id}`);
  const status = str(formData, "status");
  if (!STATUSES.includes(status)) back(formData, `/tasks/${id}`, { error: "Pick a status." });
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_task_status", { p_task_id: id, p_status: status, p_note: optional(formData, "note") });
  if (error) back(formData, `/tasks/${id}`, { error: rpcError(error, "Couldn't change the status.") });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  back(formData, `/tasks/${id}`, { ok: "Status updated." });
}
