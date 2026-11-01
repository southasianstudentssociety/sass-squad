import { getSession } from "@/lib/auth";
import { NavBar } from "./nav-bar";

export async function SiteHeader() {
  const session = await getSession();
  return (
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
  );
}
