import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ItemCondition } from "@/lib/types";

export const CONDITIONS: Record<ItemCondition, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-ok/10 text-ok" },
  good: { label: "Good", cls: "bg-accent text-accent-ink" },
  worn: { label: "Worn", cls: "bg-warn/10 text-warn" },
  damaged: { label: "Damaged", cls: "bg-bad/10 text-bad" },
};

/** id → display name, for team members (subcommittee can't read profiles directly). */
export async function teamNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.rpc("team_member_names", { p_ids: unique });
  return new Map(((data ?? []) as { user_id: string; full_name: string }[]).map((r) => [r.user_id, r.full_name]));
}
