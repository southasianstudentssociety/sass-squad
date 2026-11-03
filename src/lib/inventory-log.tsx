import { formatDate } from "@/lib/format";
import type { InventoryAction, InventoryLogEntry } from "@/lib/types";

export const INVENTORY_ACTION_LABEL: Record<InventoryAction, string> = {
  created: "Added",
  edited: "Edited",
  adjusted: "Count changed",
  checked_out: "Checked out",
  returned: "Returned",
  lost: "Lost",
  retired: "Retired",
  transferred: "Handed on",
};

const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Every person id a set of log entries mentions, for looking up names. */
export function logPeople(log: InventoryLogEntry[]): (string | null)[] {
  return log.flatMap((e) => [e.actor_id, str(e.details?.from), str(e.details?.to), str(e.details?.keeper_id), str(e.details?.borrower_id)]);
}

/** One history line, e.g. "Handed on from Asha to Ravi (on 21 Nov 2026) by Asha: after Diwali". */
export function LogText({ e, name }: { e: InventoryLogEntry; name: (id: string | null) => string }) {
  const d = e.details ?? {};
  const loc = Array.isArray(d.location) ? (d.location as (string | null)[]) : null;
  const otherEdits = Object.keys(d).filter((k) => k !== "location");
  return (
    <>
      <strong>{INVENTORY_ACTION_LABEL[e.action]}</strong>
      {e.quantity_delta !== 0 && ` (${e.quantity_delta > 0 ? "+" : ""}${e.quantity_delta})`}
      {e.action === "checked_out" && str(d.borrower_id) && ` to ${name(str(d.borrower_id))}`}
      {e.action === "edited" && loc && `: moved from ${loc[0] ?? "nowhere set"} to ${loc[1] ?? "nowhere set"}`}
      {e.action === "edited" && otherEdits.length > 0 && `${loc ? "; also" : ":"} ${otherEdits.join(", ")}`}
      {e.action === "transferred" && ` from ${str(d.from) ? name(str(d.from)) : "nobody"} to ${str(d.to) ? name(str(d.to)) : "nobody"}`}
      {e.action === "transferred" && str(d.on) && ` (handed over ${formatDate(str(d.on))})`}
      {e.action === "created" && str(d.keeper_id) && `, in charge: ${name(str(d.keeper_id))}`}
      {" "}by {name(e.actor_id)}{e.note && `: ${e.note}`}
    </>
  );
}
