import type { TicketStatus } from "@/lib/types";

const STYLES: Record<TicketStatus, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-ok/10 text-ok" },
  awaiting_payment: { label: "Awaiting payment", cls: "bg-warn/10 text-warn" },
  cancelled: { label: "Cancelled", cls: "bg-bad/10 text-bad" },
};

export function StatusBadge({ status, checkedIn }: { status: TicketStatus; checkedIn?: boolean }) {
  if (checkedIn) return <span className="badge bg-ink/10 text-ink">Checked in</span>;
  const s = STYLES[status];
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}
