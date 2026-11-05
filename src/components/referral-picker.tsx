"use client";

import { useId, useMemo, useState } from "react";
import { Check, Search, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Referrer = { id: string; name: string };

/**
 * "Who referred you?" Optional. A small card with a search bar over the
 * subcommittee list (A–Z). Sends `referrer_id` (empty = nobody).
 */
export function ReferralPicker({ options }: { options: Referrer[] }) {
  const uid = useId();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Referrer | null>(null);
  const sorted = useMemo(() => [...options].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })), [options]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? sorted.filter((o) => o.name.toLowerCase().includes(needle)) : sorted;
  }, [sorted, q]);

  return (
    <div className="rounded-2xl border border-line bg-page/60 p-3">
      <input type="hidden" name="referrer_id" value={picked?.id ?? ""} />
      <div className="flex items-baseline justify-between gap-2 px-1">
        <label htmlFor={`${uid}-q`} className="text-sm font-semibold">Who referred you?</label>
        <span className="text-xs text-muted">Optional</span>
      </div>

      {picked ? (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-ink/15">
          <Check className="size-4 shrink-0 text-ok" aria-hidden />
          <span className="flex-1 truncate text-sm font-medium">{picked.name}</span>
          <button type="button" onClick={() => setPicked(null)} className="rounded-lg p-1 text-muted hover:bg-ink/5 hover:text-ink" aria-label="Clear referral">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id={`${uid}-q`}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                // Enter picks the only match instead of submitting the form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown.length === 1) setPicked(shown[0]);
                }
              }}
              placeholder="Search the subcommittee"
              autoComplete="off"
              className="input py-2 pl-9 text-sm"
            />
          </div>
          <ul role="listbox" aria-label="Subcommittee" className="mt-2 max-h-44 overflow-y-auto overscroll-contain rounded-xl bg-surface ring-1 ring-line">
            {shown.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => setPicked(o)}
                  className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-brand-soft focus-visible:bg-brand-soft focus-visible:outline-none")}
                >
                  <UserRound className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="truncate">{o.name}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">No one by that name on the subcommittee.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
