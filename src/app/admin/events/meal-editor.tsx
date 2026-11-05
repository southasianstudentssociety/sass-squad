"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { DEFAULT_MEALS, MEAL_COLORS, MEAL_COLOR_KEYS, type MealColor } from "@/lib/meals";

type Row = { key: string; id: string | null; label: string; color: MealColor };

let next = 0;
const key = () => `m${next++}`;

/**
 * Meal choice for an event: a switch, then the options (name + colour).
 * Sends `meals_enabled` and `meal_options` (JSON) with the event form; the
 * save action passes them to set_event_meals.
 */
export function MealEditor({ enabled, options }: { enabled: boolean; options: { id: string; label: string; color: MealColor }[] }) {
  const [on, setOn] = useState(enabled);
  const [rows, setRows] = useState<Row[]>(() =>
    (options.length ? options : DEFAULT_MEALS.map((d) => ({ ...d, id: null as string | null }))).map((o) => ({ key: key(), id: o.id, label: o.label, color: o.color })),
  );

  const update = (k: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const payload = JSON.stringify(rows.filter((r) => r.label.trim()).map((r) => ({ id: r.id, label: r.label.trim(), color: r.color })));

  return (
    <div className="space-y-3 sm:col-span-2">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="meals_enabled" checked={on} onChange={(e) => setOn(e.target.checked)} /> Meal choice
      </label>
      <p className="hint -mt-2">When on, everyone picks a meal when they get a ticket. It&apos;s saved on their ticket, shown on the guest list and counted on the event page. Once picked, only ExCo can change it (on the event page, per ticket).</p>
      <input type="hidden" name="meal_options" value={payload} />
      {on && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-2 border-b border-line pb-2 last:border-0 last:pb-0 sm:flex-nowrap sm:border-0 sm:pb-0">
              <span className="size-4 shrink-0 rounded-full ring-1 ring-ink/10" style={{ background: MEAL_COLORS[r.color].swatch }} aria-hidden />
              <input
                value={r.label}
                onChange={(e) => update(r.key, { label: e.target.value })}
                maxLength={40}
                placeholder="e.g. Vegan"
                aria-label="Meal name"
                className="input min-w-0 flex-1 basis-[calc(100%-1.5rem)] sm:basis-auto"
              />
              <select value={r.color} onChange={(e) => update(r.key, { color: e.target.value as MealColor })} aria-label="Colour" className="input ml-6 w-auto flex-1 sm:ml-0 sm:w-36 sm:flex-none">
                {MEAL_COLOR_KEYS.map((c) => <option key={c} value={c}>{MEAL_COLORS[c].name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="rounded-lg p-2 text-muted hover:bg-ink/5 hover:text-bad"
                aria-label={`Remove ${r.label || "option"}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button type="button" onClick={() => setRows((rs) => [...rs, { key: key(), id: null, label: "", color: "grey" }])} className="btn-ghost px-3 py-1.5 text-sm">
              <Plus className="size-4" aria-hidden /> Add option
            </button>
            <p className="hint">Removing an option someone already picked hides it from new buyers; their ticket keeps it.</p>
          </div>
        </div>
      )}
    </div>
  );
}
