"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { motion } from "motion/react";
import { Menu } from "@base-ui/react/menu";
import { Boxes, CalendarDays, ChevronDown, ClipboardList, LayoutGrid, LogOut, Receipt, Settings2, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type User = {
  name: string;
  email: string;
  isMember: boolean;
  isStaff: boolean;
  isTeam: boolean;
  isAdmin: boolean;
  isFinance: boolean;
};

export function NavBar({ user }: { user: User | null }) {
  const pathname = usePathname();
  const signOutRef = useRef<HTMLFormElement>(null);

  const primary = [
    { href: "/events", label: "Events" },
    ...(user ? [{ href: "/tickets", label: "Tickets" }] : []),
    // Door staff need Scan one tap away, not inside a menu.
    ...(user?.isStaff ? [{ href: "/scan", label: "Scan" }] : []),
  ];
  const team = user?.isTeam || user?.isAdmin
    ? [
        ...(user.isTeam ? [
          { href: "/calendar", label: "Calendar", icon: CalendarDays },
          { href: "/tasks", label: "Tasks", icon: ClipboardList },
          { href: "/claims", label: "Claims", icon: Receipt },
          { href: "/inventory", label: "Inventory", icon: Boxes },
        ] : []),
        ...(user.isFinance ? [{ href: "/finance", label: "Finance", icon: Wallet }] : []),
        ...(user.isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
      ]
    : [];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const teamActive = team.some((t) => isActive(t.href));

  return (
    <header className="sticky top-0 z-30 print:hidden">
      <div className="sass-stripe h-[3px]" aria-hidden />
      <div className="border-b border-line/80 bg-page/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-1.5 px-4 sm:gap-6 sm:px-5">
          <Link href="/" className="mr-1 shrink-0 font-brand text-[1.4rem] leading-none text-brand transition-opacity hover:opacity-80 sm:text-2xl" aria-label="SASS home">
            SASS
          </Link>

          <nav className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto text-sm [scrollbar-width:none] sm:gap-0.5" aria-label="Main">
            {primary.map((l) => (
              <NavLink key={l.href} href={l.href} active={isActive(l.href)}>{l.label}</NavLink>
            ))}
          </nav>

        {team.length > 0 && (
              <Menu.Root>
                <Menu.Trigger
                  className={cn(
                    "relative flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 whitespace-nowrap sm:px-2.5 text-ink/70 outline-none transition-colors hover:text-ink data-[popup-open]:text-ink",
                    teamActive && "text-ink",
                  )}
                  aria-label="Team tools"
                >
                  {teamActive && <ActivePill />}
                  <LayoutGrid className="relative size-4 sm:hidden" aria-hidden />
                  <span className="relative hidden sm:inline">Team</span>
                  <ChevronDown className="relative hidden size-3.5 opacity-60 sm:inline" aria-hidden />
                </Menu.Trigger>
                <MenuPopup align="start">
                  {team.map((t) => (
                    <MenuLink key={t.href} href={t.href} active={isActive(t.href)}>
                      <t.icon className="size-4 opacity-60" aria-hidden />
                      {t.label}
                    </MenuLink>
                  ))}
                </MenuPopup>
              </Menu.Root>
            )}

          {user ? (
            <Menu.Root>
              <Menu.Trigger
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-sm font-medium text-ink shadow-[var(--shadow-soft)] outline-none transition hover:border-ink/15 data-[popup-open]:border-ink/20"
                aria-label="Account"
              >
                {initials(user.name)}
              </Menu.Trigger>
              <MenuPopup align="end">
                <div className="px-3 pb-2 pt-1.5">
                  <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                  <span className={cn("badge mt-2", user.isMember ? "bg-accent text-accent-ink" : "bg-line text-muted")}>
                    {user.isMember ? "Member" : "Not a member"}
                  </span>
                </div>
                <div className="my-1 h-px bg-line" />
                <MenuLink href="/tickets">
                  <UserRound className="size-4 opacity-60" aria-hidden />My tickets
                </MenuLink>
                <MenuLink href="/onboarding?edit=1&next=/tickets">
                  <Settings2 className="size-4 opacity-60" aria-hidden />Edit my details
                </MenuLink>
                <Menu.Item
                  onClick={() => signOutRef.current?.requestSubmit()}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink outline-none data-[highlighted]:bg-page"
                >
                  <LogOut className="size-4 opacity-60" aria-hidden />Log out
                </Menu.Item>
              </MenuPopup>
              <form ref={signOutRef} action="/auth/signout" method="post" hidden />
            </Menu.Root>
          ) : pathname.startsWith("/login") ? null : (
            <Link href="/login" className="btn-primary shrink-0 px-3.5 py-1.5">Log in</Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("relative rounded-lg px-2 py-1.5 whitespace-nowrap transition-colors sm:px-2.5", active ? "text-ink" : "text-ink/60 hover:text-ink")}
    >
      {active && <ActivePill />}
      <span className="relative">{children}</span>
    </Link>
  );
}

// A soft pill that glides between nav items as you move around the app.
function ActivePill() {
  return (
    <motion.span
      layoutId="nav-pill"
      className="absolute inset-0 rounded-lg bg-ink/[0.06]"
      transition={{ type: "spring", stiffness: 500, damping: 38 }}
    />
  );
}

function MenuPopup({ children, align }: { children: React.ReactNode; align: "start" | "end" }) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={8} align={align} className="z-50">
        <Menu.Popup
          className={cn(
            "min-w-52 origin-[var(--transform-origin)] rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)] outline-none",
            "transition-[transform,opacity] duration-150 ease-[var(--ease-out-soft)]",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
          )}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

function MenuLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Menu.LinkItem
      closeOnClick
      render={<Link href={href} />}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink outline-none transition-colors data-[highlighted]:bg-page",
        active && "font-medium",
      )}
    >
      {children}
    </Menu.LinkItem>
  );
}

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "•";
}
