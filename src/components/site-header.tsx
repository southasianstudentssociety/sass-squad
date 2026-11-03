import { getSession } from "@/lib/auth";
import { NavBar } from "./nav-bar";
import { PhonePrompt } from "./phone-prompt";

export async function SiteHeader() {
  const session = await getSession();
  const needsPhone = Boolean(session?.isMember && session.profile.onboarded && !session.profile.phone);
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
    </>
  );
}
