import { cn } from "@/lib/utils";
import { MEAL_COLORS, type MealOption } from "@/lib/meals";

/** Meal choice as big colour-coded radio buttons. Sends `meal_option_id`; required. */
export function MealPicker({ options, selected }: { options: MealOption[]; selected?: string | null }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">Your meal <span className="font-normal text-muted">· can&apos;t be changed later, only by an ExCo</span></legend>
      {options.map((o) => (
        <label
          key={o.id}
          className="group flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm transition-colors hover:border-ink/25 has-[:checked]:border-ink has-[:checked]:bg-page has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
        >
          <input type="radio" name="meal_option_id" value={o.id} required defaultChecked={selected === o.id} className="peer sr-only" />
          <span className="size-4 shrink-0 rounded-full ring-2 ring-white ring-offset-1 ring-offset-line" style={{ background: MEAL_COLORS[o.color].swatch }} aria-hidden />
          <span className="flex-1 font-medium">{o.label}</span>
          <span className="size-4 shrink-0 rounded-full border-2 border-line peer-checked:border-[5px] peer-checked:border-ink" aria-hidden />
        </label>
      ))}
    </fieldset>
  );
}

/** A small coloured label for a chosen meal. */
export function MealChip({ option, className }: { option: Pick<MealOption, "label" | "color"> | null | undefined; className?: string }) {
  if (!option) return <span className={cn("badge bg-line text-muted", className)}>Meal not chosen</span>;
  return <span className={cn("badge", MEAL_COLORS[option.color].chip, className)}>{option.label}</span>;
}
