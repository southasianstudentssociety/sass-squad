import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 text-sm print:hidden">
        <Link href="/admin" className="btn-ghost px-3 py-1.5">Events</Link>
        <Link href="/admin/members" className="btn-ghost px-3 py-1.5">Members</Link>
        <Link href="/admin/team" className="btn-ghost px-3 py-1.5">Team</Link>
      </nav>
      {children}
    </div>
  );
}
