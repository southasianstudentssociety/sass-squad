import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { addDays, formatDate, todayInHongKong } from "@/lib/format";
import type { Department, TeamMembership } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import {
  deleteDepartment,
  endTeamMembership,
  inviteTeamMember,
  revokeTeamInvite,
  saveDepartment,
  grantOwner,
  revokeOwner,
} from "../actions";

export const metadata = { title: "Team" };

type Person = { full_name: string | null; email: string };
type MembershipRow = TeamMembership & { person: Person | null };
type Invite = { id: string; full_name: string; email: string; alt_email: string | null; department_id: string; position: "exco" | "subcommittee"; title: string | null; starts_on: string; ends_on: string };

const POSITION_LABEL = { exco: "ExCo", subcommittee: "Subcommittee" } as const;

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: departments }, { data: memberships }, { data: inviteData }, { data: profileData }] = await Promise.all([
    supabase.from("departments").select("id, name, handles_finance, finance_access").order("name").returns<Department[]>(),
    supabase
      .from("team_memberships")
      .select("id, user_id, department_id, position, title, starts_on, ends_on, person:profiles!team_memberships_user_id_fkey(full_name, email)")
      .order("ends_on", { ascending: false })
      .returns<MembershipRow[]>(),
    supabase
      .from("team_invites")
      .select("id, full_name, email, alt_email, department_id, position, title, starts_on, ends_on")
      .is("revoked_at", null)
      .gte("ends_on", todayInHongKong())
      .order("full_name")
      .returns<Invite[]>(),
    supabase.from("profiles").select("email").returns<{ email: string }[]>(),
  ]);
  // Invites whose person hasn't logged in yet with either email.
  const loggedIn = new Set((profileData ?? []).map((p) => p.email.toLowerCase()));
  const waiting = (inviteData ?? []).filter((i) => !loggedIn.has(i.email.toLowerCase()) && !(i.alt_email && loggedIn.has(i.alt_email.toLowerCase())));

  const owner = session?.access.isOwner ?? false;
  const { data: ownerRows } = await supabase
    .from("hub_owners")
    .select("user_id, granted_at, person:profiles!hub_owners_user_id_fkey(full_name, email)")
    .order("granted_at")
    .returns<{ user_id: string; granted_at: string; person: { full_name: string | null; email: string } | null }[]>();
  const owners = ownerRows ?? [];
  const ownerNames = owners.map((o) => o.person?.full_name ?? o.person?.email).filter(Boolean).join(" and ");
  const today = todayInHongKong();
  const termEnd = session?.access.termEnd || addDays(today, 180);
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const all = memberships ?? [];
  const active = all.filter((m) => m.starts_on <= today && m.ends_on >= today);
  const upcoming = all.filter((m) => m.starts_on > today);
  const ended = all.filter((m) => m.ends_on < today).slice(0, 30);
  const byDept = (a: MembershipRow, b: MembershipRow) =>
    (deptName.get(a.department_id) ?? "").localeCompare(deptName.get(b.department_id) ?? "") ||
    a.position.localeCompare(b.position);

  // Lockout warning: if every ExCo membership (active or upcoming) ends soon, nobody can manage the hub afterwards.
  const excoEnds = [...active, ...upcoming].filter((m) => m.position === "exco").map((m) => m.ends_on);
  const lastExcoDay = excoEnds.length ? excoEnds.sort().at(-1)! : null;
  const lockoutSoon = lastExcoDay !== null && lastExcoDay <= addDays(today, 30);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-normal">Team</h1>
        <p className="text-sm text-muted">
          <strong>ExCo</strong> can manage events, members and payments. <strong>Hub owners</strong> also control this page.{" "}
          <strong>Subcommittee</strong> can use the scanner from 24 hours before an event.
          Access ends automatically on the last day of each person&apos;s term.
        </p>
      </div>
      <FormMessage error={sp.error} success={sp.ok} />
      {!owner && (
        <p className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-muted">
          You can see the team here. Only hub owners{ownerNames && ` (${ownerNames})`} can add or remove people, see who&apos;s waiting to log in, or change departments and owners.
        </p>
      )}

      {lockoutSoon && (
        <p role="alert" className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          Every ExCo&apos;s access ends by <strong>{formatDate(lastExcoDay)}</strong>. Add next term&apos;s ExCo before then,
          or nobody will be able to manage the hub.
        </p>
      )}

      {owner && <section className="space-y-3">
        <h2 className="text-lg font-bold">Add someone to the team</h2>
        {(departments ?? []).length === 0 ? (
          <p className="card text-sm text-muted">Add a department first (bottom of this page).</p>
        ) : (
          <form action={inviteTeamMember} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label" htmlFor="tm-name">Name</label>
              <input id="tm-name" name="full_name" required maxLength={100} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="tm-email">UST email</label>
              <input id="tm-email" name="email" type="email" required placeholder="name@connect.ust.hk" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="tm-alt">Gmail (optional)</label>
              <input id="tm-alt" name="alt_email" type="email" placeholder="If they log in with Google" className="input" />
            </div>
            <p className="hint sm:col-span-2 lg:col-span-3">They don&apos;t need to have logged in. They get access the first time they log in with either email.</p>
            <div>
              <label className="label" htmlFor="tm-dept">Department</label>
              <select id="tm-dept" name="department_id" required className="input">
                {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="tm-pos">Position</label>
              <select id="tm-pos" name="position" className="input" defaultValue="subcommittee">
                <option value="subcommittee">Subcommittee (own department&apos;s tasks, calendar, inventory, claims, scanner)</option>
                <option value="exco">ExCo (full admin)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="tm-title">Title (optional)</label>
              <input id="tm-title" name="title" maxLength={60} placeholder="e.g. Treasurer" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="tm-start">From</label>
              <input id="tm-start" name="starts_on" type="date" required defaultValue={today} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="tm-end">Until (end of term)</label>
              <input id="tm-end" name="ends_on" type="date" required defaultValue={termEnd} className="input" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton pendingText="Adding…">Add to team</SubmitButton>
            </div>
          </form>
        )}
      </section>}

      {owner && waiting.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Waiting for first login ({waiting.length})</h2>
          <p className="text-sm text-muted">On the team list, but they haven&apos;t logged in yet. Access starts automatically when they do.</p>
          <div className="card overflow-x-auto p-0">
            <table className="sheet min-w-[40rem]">
              <thead><tr><th>Name</th><th>Emails</th><th>Department</th><th>Position</th><th>Until</th>{owner && <th />}</tr></thead>
              <tbody>
                {waiting.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.full_name}</td>
                    <td className="text-xs">{i.email}{i.alt_email && <><br />{i.alt_email}</>}</td>
                    <td className="whitespace-nowrap">{deptName.get(i.department_id)}</td>
                    <td className="whitespace-nowrap">{POSITION_LABEL[i.position]}{i.title && ` · ${i.title}`}</td>
                    <td className="whitespace-nowrap">{formatDate(i.ends_on)}</td>
                    {owner && (
                      <td>
                        <form action={revokeTeamInvite}>
                          <input type="hidden" name="id" value={i.id} />
                          <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="…">Cancel</SubmitButton>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <MembershipTable title={`Current team (${active.length})`} rows={[...active].sort(byDept)} deptName={deptName} endable={owner} />
      {upcoming.length > 0 && <MembershipTable title="Starting later" rows={[...upcoming].sort(byDept)} deptName={deptName} endable={owner} />}

      {ended.length > 0 && <MembershipTable title="Past team" rows={ended} deptName={deptName} muted />}

      {owner && (
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Departments</h2>
        <p className="text-sm text-muted">
          ExCo in a department that <strong>handles finance</strong> (and hub owners) can see every reimbursement claim, receipt and payment detail, approve and pay claims, and use Accounts; the Finance department&apos;s ExCo may also approve their own claims (always flagged).
          <strong> Finance access</strong> gives a department&apos;s ExCo the same, except approving their own claims (e.g. the Presidents).
          {!(departments ?? []).some((d) => d.handles_finance) && " No department handles finance yet, so nobody can approve claims."}
        </p>
        <div className="card space-y-3">
          {(departments ?? []).map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2">
              <form action={saveDepartment} className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={d.id} />
                <input name="name" defaultValue={d.name} required maxLength={60} aria-label={`Rename ${d.name}`} className="input min-w-40 flex-1" />
                <label className="flex items-center gap-1.5 whitespace-nowrap text-sm">
                  <input type="checkbox" name="handles_finance" defaultChecked={d.handles_finance} /> Handles finance
                </label>
                <label className="flex items-center gap-1.5 whitespace-nowrap text-sm">
                  <input type="checkbox" name="finance_access" defaultChecked={d.finance_access ?? false} /> Finance access
                </label>
                <SubmitButton className="btn-ghost" pendingText="Saving…">Save</SubmitButton>
              </form>
              <form action={deleteDepartment}>
                <input type="hidden" name="id" value={d.id} />
                <SubmitButton className="btn-danger" pendingText="Deleting…">Delete</SubmitButton>
              </form>
            </div>
          ))}
          <form action={saveDepartment} className="flex gap-2 border-t border-line pt-3">
            <input name="name" required maxLength={60} placeholder="New department, e.g. Finance" aria-label="New department name" className="input" />
            <SubmitButton pendingText="Adding…">Add</SubmitButton>
          </form>
        </div>
      </section>
      )}

      {owner && (
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Hub owners</h2>
        <p className="text-sm text-muted">
          Owners control this page: the team, departments and who else is an owner. They also count as Finance.
          Pass ownership on before you leave; there must always be at least one owner.
        </p>
        <ul className="card divide-y divide-line p-0 text-sm">
          {owners.map((o) => (
            <li key={o.user_id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{o.person?.full_name ?? "-"}</span>
                <span className="block truncate text-xs text-muted">{o.person?.email} · since {formatDate(o.granted_at)}</span>
              </span>
              {owner && owners.length > 1 && (
                <form action={revokeOwner}>
                  <input type="hidden" name="user_id" value={o.user_id} />
                  <SubmitButton className="btn-danger px-3 py-1 text-xs" pendingText="Removing…">Remove</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        {owner && (
          <form action={grantOwner} className="card flex flex-wrap items-end gap-3">
            <div className="min-w-60 flex-1">
              <label className="label" htmlFor="ow-email">Make someone an owner</label>
              <input id="ow-email" name="email" type="email" required placeholder="They must have logged in once" className="input" />
            </div>
            <SubmitButton className="btn-ghost" pendingText="Saving…">Add owner</SubmitButton>
          </form>
        )}
      </section>
      )}
    </div>
  );
}

function MembershipTable({
  title,
  rows,
  deptName,
  endable = false,
  muted = false,
}: {
  title: string;
  rows: MembershipRow[];
  deptName: Map<string, string>;
  endable?: boolean;
  muted?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nobody yet.</p>
      ) : (
        <div className={`card overflow-x-auto p-0 ${muted ? "opacity-70" : ""}`}>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Department</th><th>Position</th><th>Term</th>{endable && <th />}</tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <span className="font-semibold">{m.person?.full_name ?? "-"}</span>
                    <span className="block text-xs text-muted">{m.person?.email}</span>
                  </td>
                  <td>{deptName.get(m.department_id) ?? "-"}</td>
                  <td>
                    <span className={`badge ${m.position === "exco" ? "bg-brand text-brand-ink" : "bg-accent text-accent-ink"}`}>
                      {POSITION_LABEL[m.position]}
                    </span>
                    {m.title && <span className="block text-xs text-muted">{m.title}</span>}
                  </td>
                  <td className="whitespace-nowrap text-sm">{formatDate(m.starts_on)} – {formatDate(m.ends_on)}</td>
                  {endable && (
                    <td className="text-right">
                      <form action={endTeamMembership}>
                        <input type="hidden" name="id" value={m.id} />
                        <SubmitButton className="btn-danger px-3 py-1 text-xs" pendingText="Ending…">End now</SubmitButton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
