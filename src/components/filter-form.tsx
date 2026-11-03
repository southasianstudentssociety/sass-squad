"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A filter/search form that applies itself: dropdowns and checkboxes apply
 * the moment they change, text boxes shortly after you stop typing (Enter
 * applies at once). It updates the page address in place (no new history
 * entry, no jump to the top), so the page's server filtering does the rest.
 * Empty fields are left out of the address.
 */
export function FilterForm({ className, children, delay = 350 }: { className?: string; children: React.ReactNode; delay?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, start] = useTransition();

  useEffect(() => () => clearTimeout(timer.current), []);

  const apply = () => {
    clearTimeout(timer.current);
    const el = form.current;
    if (!el) return;
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(el)) {
      if (typeof v === "string" && v.trim() !== "") params.append(k, v.trim());
    }
    const qs = params.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <form
      ref={form}
      role="search"
      aria-busy={pending || undefined}
      className={cn("transition-opacity", pending && "opacity-70", className)}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement;
        // Typing waits a moment; selects, checkboxes and dates apply at once.
        if (t.tagName === "INPUT" && ["text", "search", ""].includes(t.type)) {
          clearTimeout(timer.current);
          timer.current = setTimeout(apply, delay);
        } else {
          apply();
        }
      }}
    >
      {children}
    </form>
  );
}
