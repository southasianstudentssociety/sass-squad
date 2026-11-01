import type { TaskStatus } from "@/lib/types";

export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  todo: { label: "To do", cls: "bg-ink/10 text-ink" },
  doing: { label: "Doing", cls: "bg-accent text-accent-ink" },
  blocked: { label: "Blocked", cls: "bg-bad/10 text-bad" },
  done: { label: "Done", cls: "bg-ok/10 text-ok" },
  cancelled: { label: "Cancelled", cls: "bg-ink/5 text-muted" },
};

export const OPEN_STATUSES: TaskStatus[] = ["todo", "doing", "blocked"];
