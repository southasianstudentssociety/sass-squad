import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type Session = {
  userId: string;
  email: string;
  profile: Profile;
  isMember: boolean;
};

/** Current user + profile + live membership status, or null. Deduped per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: isMember }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, phone, role, onboarded")
      .eq("id", user.id)
      .single<Profile>(),
    supabase.rpc("current_user_is_member"),
  ]);
  if (!profile) return null;

  return { userId: user.id, email: user.email ?? profile.email, profile, isMember: Boolean(isMember) };
});

export async function requireUser(next?: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  if (!session.profile.onboarded) {
    redirect(next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding");
  }
  return session;
}

export async function requireStaff(next?: string): Promise<Session> {
  const session = await requireUser(next);
  if (session.profile.role !== "staff" && session.profile.role !== "admin") redirect("/");
  return session;
}

export async function requireAdmin(next?: string): Promise<Session> {
  const session = await requireUser(next);
  if (session.profile.role !== "admin") redirect("/");
  return session;
}

/** Only allow same-site relative redirects. */
export function safeNext(next: unknown, fallback = "/tickets"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
