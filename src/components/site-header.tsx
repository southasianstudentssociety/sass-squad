import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "./nav-bar";
import { PhonePrompt } from "./phone-prompt";
import { LinkPrompt, type LinkSuggestion } from "./link-prompt";

export async function SiteHeader() {
  const session = await getSession();
  const needsPhone = Boolean(session?.isMember && session.profile.onboarded && !session.profile.phone);
  let suggestion: LinkSuggestion | null = null;
  if (session?.profile.onboarded) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("my_link_nudge");
    suggestion = (data as LinkSuggestion | null) ?? null;
  }
  return (
    <>
      {needsPhone && <PhonePrompt />}
      <NavBar
        user={
          session
            ? {
                name: session.profile.full_name ?? session.email,
                email: session.email,
                isMember: session.isMember,
                isStaff: session.access.isStaff,
                isTeam: session.access.isTeam,
                isAdmin: session.access.isAdmin,
                isFinance: session.access.isFinance,
              }
            : null
        }
      />
      {suggestion && <LinkPrompt suggestion={suggestion} />}
    </>
  );
}
