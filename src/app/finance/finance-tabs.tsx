"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/finance", label: "Claims", match: (p: string) => p === "/finance" },
  { href: "/finance/budgets", label: "Accounts", match: (p: string) => p.startsWith("/finance/budgets") },
];

export function FinanceTabs() {
  const pathname = usePathname();
  return (
    <nav className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-xl bg-line p-1 text-sm font-medium" aria-label="Finance">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(pathname) ? "page" : undefined}
          className={cn("rounded-lg px-3 py-1.5 text-center transition-colors", t.match(pathname) ? "bg-surface shadow-[var(--shadow-soft)]" : "text-muted hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
