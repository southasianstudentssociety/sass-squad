import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Access, Profile } from "@/lib/types";

export type Session = {
  userId: string;
  email: string;
  /** Name from the identity provider (e.g. Google), used to pre-fill onboarding. */
  providerName: string | null;
  profile: Profile;
  isMember: boolean;
  access: Access;
};

const NO_ACCESS: Access = { isAdmin: false, isStaff: false, isTeam: false, isFinance: false, isFinanceExco: false, isOwner: false, termEnd: "" };

/** Current user + profile + live membership status, or null. Deduped per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: isMember }, { data: access }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, phone, food_preference, onboarded")
      .eq("id", user.id)
      .single<Profile>(),
    supabase.rpc("current_user_is_member"),
    supabase.rpc("my_access"),
  ]);
  if (!profile) return null;

  const meta = user.user_metadata ?? {};
  const providerName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
  const a = (access ?? {}) as { is_admin?: boolean; is_staff?: boolean; is_team?: boolean; is_finance?: boolean; is_finance_exco?: boolean; is_owner?: boolean; term_end?: string };
  return {
    userId: user.id,
    email: user.email ?? profile.email,
    providerName,
    profile,
    isMember: Boolean(isMember),
    // If the access check fails, fall back to no access rather than guessing.
    access: access
      ? {
          isAdmin: a.is_admin === true,
          isStaff: a.is_staff === true,
          isTeam: a.is_team === true,
          isFinance: a.is_finance === true,
          isFinanceExco: a.is_finance_exco === true,
          isOwner: a.is_owner === true,
          termEnd: a.term_end ?? "",
        }
      : NO_ACCESS,
  };
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
  if (!session.access.isStaff) redirect("/");
  return session;
}

export async function requireAdmin(next?: string): Promise<Session> {
  const session = await requireUser(next);
  if (!session.access.isAdmin) redirect("/");
  return session;
}

export async function requireTeam(next?: string): Promise<Session> {
  const session = await requireUser(next);
  if (!session.access.isTeam) redirect("/");
  return session;
}

export async function requireOwner(next?: string): Promise<Session> {
  const session = await requireUser(next);
  if (!session.access.isOwner) redirect("/admin/team?error=" + encodeURIComponent("Only hub owners can change the team."));
  return session;
}

export async function requireFinance(next?: string): Promise<Session> {
  const session = await requireUser(next);
  if (!session.access.isFinance) redirect("/");
  return session;
}

/** Only allow same-site relative redirects. */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
