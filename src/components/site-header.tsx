import Link from "next/link";
import { getSession } from "@/lib/auth";
import { SITE } from "@/lib/site";

export async function SiteHeader() {
  const session = await getSession();
  const access = session?.access;

  return (
    <header className="sticky top-0 z-20 print:hidden bg-brand text-brand-ink shadow">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-display text-2xl leading-none">
          {SITE.name}
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
          <NavLink href="/events">Events</NavLink>
          {session && <NavLink href="/tickets">My tickets</NavLink>}
          {access?.isStaff && <NavLink href="/scan">Scan</NavLink>}
          {access?.isAdmin && <NavLink href="/admin">Admin</NavLink>}
        </nav>
        {session ? (
          <form action="/auth/signout" method="post" className="flex items-center gap-2">
            {session.isMember && (
              <span className="badge hidden bg-accent text-accent-ink sm:inline-flex">Member</span>
            )}
            <button className="rounded-md px-2 py-1 text-sm opacity-90 hover:bg-white/10">Log out</button>
          </form>
        ) : (
          <Link href="/login" className="rounded-md bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25">
            Log in
          </Link>
        )}
      </div>
      <div className="sass-stripe h-1.5" aria-hidden />
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 opacity-90 hover:bg-white/10 hover:opacity-100">
      {children}
    </Link>
  );
}
