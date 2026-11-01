import type { TicketStatus } from "@/lib/types";

const STYLES: Record<TicketStatus, { label: string; cls: string; dot: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-ok/10 text-ok", dot: "bg-ok" },
  awaiting_payment: { label: "Awaiting payment", cls: "bg-warn/10 text-warn", dot: "bg-warn" },
  cancelled: { label: "Cancelled", cls: "bg-bad/10 text-bad", dot: "bg-bad" },
};

export function StatusBadge({ status, checkedIn }: { status: TicketStatus; checkedIn?: boolean }) {
  if (checkedIn) return <span className="badge bg-ink/[0.06] text-ink"><span className="size-1.5 rounded-full bg-ink/50" />Checked in</span>;
  const s = STYLES[status];
  return (
    <span className={`badge ${s.cls}`}>
      <span className={`size-1.5 rounded-full ${s.dot} ${status === "awaiting_payment" ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}
