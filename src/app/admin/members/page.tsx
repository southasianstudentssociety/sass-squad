import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { Member } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { deleteMember, importMembers, saveMember } from "../actions";

export const metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; error?: string; edit?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("members").select("*").order("full_name");
  const q = (sp.q ?? "").trim().replace(/[%,()*]/g, " ").trim();
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,alt_email.ilike.%${q}%,student_id.ilike.%${q}%`);
  const { data } = await query.returns<Member[]>();
  const members = data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const editing = sp.edit ? members.find((m) => m.id === sp.edit) : undefined;
  const active = members.filter((m) => m.valid_until >= today).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Members</h1>
        <p className="text-sm text-muted">{active} active · {members.length - active} expired{q && ` (filtered)`}</p>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />

      <div className="grid gap-5 lg:grid-cols-2">
        <form action={saveMember} className="card space-y-3" key={editing?.id ?? "new"}>
          <h2 className="font-bold">{editing ? `Edit ${editing.full_name}` : "Add a member"}</h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <input name="full_name" required placeholder="Full name" defaultValue={editing?.full_name} className="input" />
          <input name="email" type="email" required placeholder="Email (the one they log in with)" defaultValue={editing?.email} className="input" />
          <input name="alt_email" type="email" placeholder="Second email, e.g. Gmail (optional)" defaultValue={editing?.alt_email ?? ""} className="input" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Purchased</label>
              <input name="purchased_at" type="date" defaultValue={editing?.purchased_at ?? today} className="input" />
            </div>
            <div>
              <label className="label text-xs">Valid until</label>
              <input name="valid_until" type="date" required defaultValue={editing?.valid_until} className="input" />
            </div>
          </div>
          <input name="student_id" placeholder="Student ID (optional)" defaultValue={editing?.student_id ?? ""} className="input" />
          <input name="notes" placeholder="Notes (optional)" defaultValue={editing?.notes ?? ""} className="input" />
          <div className="flex gap-2">
            <SubmitButton pendingText="Saving…">{editing ? "Save changes" : "Add member"}</SubmitButton>
            {editing && <a href="/admin/members" className="btn-ghost">Cancel</a>}
          </div>
        </form>

        <form action={importMembers} className="card space-y-3">
          <h2 className="font-bold">Import from Google Sheet</h2>
          <p className="text-sm text-muted">
            In the Sheet: <strong>File → Download → Comma-separated values (.csv)</strong>, then upload it here. Needs
            <code> Name</code> and <code>Email</code> columns. Optional: <code>Alt email</code>, <code>Student ID</code>,
            <code> Purchased</code>, <code>Valid until</code> (dates as DD/MM/YYYY). Existing emails are updated, not duplicated.
          </p>
          <input name="file" type="file" accept=".csv,text/csv" className="block w-full text-sm" />
          <div>
            <label className="label text-xs">Valid until (for rows without one)</label>
            <input name="default_valid_until" type="date" className="input" />
          </div>
          <SubmitButton pendingText="Importing…">Import CSV</SubmitButton>
        </form>
      </div>

      <form className="flex gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search name, email, student ID" className="input max-w-sm" />
        <button className="btn-ghost">Search</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Name</th><th>Email(s)</th><th>Purchased</th><th>Valid until</th><th></th></tr></thead>
          <tbody>
            {members.map((m) => {
              const expired = m.valid_until < today;
              return (
                <tr key={m.id}>
                  <td className="font-semibold">{m.full_name}{m.student_id && <p className="text-xs font-normal text-muted">{m.student_id}</p>}</td>
                  <td className="text-xs">{m.email}{m.alt_email && <><br />{m.alt_email}</>}</td>
                  <td className="whitespace-nowrap text-xs">{formatDate(m.purchased_at)}</td>
                  <td className={`whitespace-nowrap text-xs ${expired ? "font-semibold text-bad" : ""}`}>{formatDate(m.valid_until)}{expired && " (expired)"}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <a href={`/admin/members?edit=${m.id}`} className="btn-ghost px-3 py-1.5">Edit</a>
                      <form action={deleteMember}>
                        <input type="hidden" name="id" value={m.id} />
                        <SubmitButton className="btn-danger px-3 py-1.5" pendingText="…">Remove</SubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && <tr><td colSpan={5} className="text-muted">No members yet. Import your Sheet above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
