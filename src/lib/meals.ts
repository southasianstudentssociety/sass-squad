// Meal choices per event (migration 0028). Colours are a fixed palette so the
// database only stores a key.

export type MealColor = "green" | "light_green" | "red" | "amber" | "blue" | "purple" | "grey";

export type MealOption = { id: string; label: string; color: MealColor; sort_order: number; archived_at: string | null };

export const MEAL_COLORS: Record<MealColor, { name: string; swatch: string; chip: string }> = {
  green: { name: "Green", swatch: "#15803d", chip: "bg-[#15803d] text-white" },
  light_green: { name: "Light green", swatch: "#86d39a", chip: "bg-[#86d39a] text-[#0f3d1c]" },
  red: { name: "Red", swatch: "#dc2626", chip: "bg-[#dc2626] text-white" },
  amber: { name: "Amber", swatch: "#f59e0b", chip: "bg-[#f59e0b] text-[#3b2503]" },
  blue: { name: "Blue", swatch: "#0041a3", chip: "bg-sass-blue text-white" },
  purple: { name: "Purple", swatch: "#5314a0", chip: "bg-sass-purple text-white" },
  grey: { name: "Grey", swatch: "#78716c", chip: "bg-[#78716c] text-white" },
};

export const MEAL_COLOR_KEYS = Object.keys(MEAL_COLORS) as MealColor[];

/** What a new event starts with when meals are switched on. */
export const DEFAULT_MEALS: { label: string; color: MealColor }[] = [
  { label: "Vegetarian (Non-Jain)", color: "green" },
  { label: "Vegetarian (Jain)", color: "light_green" },
  { label: "Non-Vegetarian", color: "red" },
];

export const MEAL_COLUMNS = "id, label, color, sort_order, archived_at";
