import { ClipboardCheck, ImageUp, ShoppingBag, type LucideIcon } from "lucide-react";
import type { TaskKind, TaskStatus } from "@/lib/types";

export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  todo: { label: "To do", cls: "bg-ink/10 text-ink" },
  doing: { label: "Doing", cls: "bg-accent text-accent-ink" },
  blocked: { label: "Blocked", cls: "bg-bad/10 text-bad" },
  done: { label: "Done", cls: "bg-ok/10 text-ok" },
  cancelled: { label: "Cancelled", cls: "bg-ink/5 text-muted" },
};

export const OPEN_STATUSES: TaskStatus[] = ["todo", "doing", "blocked"];

/** Task types. Colours come from the SASS palette and are reused on the calendar. */
export const TASK_KIND: Record<TaskKind, { label: string; short: string; icon: LucideIcon; dot: string; chip: string }> = {
  task: { label: "Task / deadline", short: "Task", icon: ClipboardCheck, dot: "bg-sass-blue", chip: "bg-sass-blue/10 text-sass-blue" },
  upload: { label: "Scheduled upload (post)", short: "Upload", icon: ImageUp, dot: "bg-sass-purple", chip: "bg-sass-purple/10 text-sass-purple" },
  errand: { label: "Errand (buy / pick up)", short: "Errand", icon: ShoppingBag, dot: "bg-teal", chip: "bg-teal/10 text-teal" },
};

/** "18:30:00" → "6:30 pm" */
export function formatTaskTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
