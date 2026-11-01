import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { setRole } from "../actions";

export const metadata = { title: "Staff & roles" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .in("role", ["staff", "admin"])
    .order("role")
    .returns<Pick<Profile, "id" | "email" | "full_name" | "role">[]>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Staff &amp; roles</h1>
        <p className="text-sm text-muted">
          <strong>Staff</strong> can open the scanner, search the guest list and add walk-ins.{" "}
          <strong>Admins</strong> can also manage events, members, confirm payments and change roles.
        </p>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />

      <form action={setRole} className="card flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <label className="label">Email</label>
          <input name="email" type="email" required placeholder="They must have logged in once" className="input" />
        </div>
        <div>
          <label className="label">Role</label>
          <select name="role" className="input">
            <option value="staff">Staff (door)</option>
            <option value="admin">Admin</option>
            <option value="user">Remove access</option>
          </select>
        </div>
        <SubmitButton pendingText="Saving…">Set role</SubmitButton>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.full_name ?? "-"}</td>
                <td>{p.email}</td>
                <td><span className={`badge ${p.role === "admin" ? "bg-brand text-brand-ink" : "bg-accent text-accent-ink"}`}>{p.role}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
