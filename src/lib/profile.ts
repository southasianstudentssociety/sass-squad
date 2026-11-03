// Shared rules for profile details (used by onboarding, Settings and the phone prompt).

export const FOOD_PREFERENCES = [
  { value: "non_veg", label: "Non-vegetarian" },
  { value: "veg", label: "Vegetarian (non-Jain)" },
  { value: "veg_jain", label: "Vegetarian (Jain)" },
  { value: "vegan", label: "Vegan" },
] as const;
export type FoodPreference = (typeof FOOD_PREFERENCES)[number]["value"];

export function foodLabel(value: string | null | undefined): string | null {
  return FOOD_PREFERENCES.find((f) => f.value === value)?.label ?? null;
}

/**
 * WhatsApp number with country code, e.g. "+852 1234 5678" -> "+85212345678".
 * Returns null if it isn't a plausible international number.
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(compact)) return null;
  return compact;
}

export const PHONE_HINT = "Your WhatsApp number with the country code, e.g. +852 12345678.";
