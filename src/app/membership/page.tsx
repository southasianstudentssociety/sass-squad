import Link from "next/link";
import { BadgeCheck, CalendarCheck, Sparkles, Ticket } from "lucide-react";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPrice } from "@/lib/format";
import type { MembershipApplication, MembershipOffer } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { Reveal } from "@/components/motion";
import { applyForMembership, cancelMyApplication } from "./actions";

export const metadata = { title: "Membership" };

const PERKS = [
  { icon: Ticket, text: "Member prices on every event, applied automatically" },
  { icon: CalendarCheck, text: "Early access when tickets open" },
  { icon: Sparkles, text: "Members-only nights" },
];

export default async function MembershipPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: offers }, apps, membership] = await Promise.all([
    supabase.from("membership_offers").select("*").eq("is_open", true).order("valid_until").returns<MembershipOffer[]>(),
    session
      ? supabase.from("membership_applications").select("*").eq("user_id", session.userId).neq("status", "cancelled").order("created_at", { ascending: false }).returns<MembershipApplication[]>()
      : Promise.resolve({ data: [] as MembershipApplication[] }),
    session
      ? supabase
          .from("members")
          .select("valid_until")
          // Filter to this person explicitly: ExCo can read the whole member list.
          .or(`email.eq."${session.email}",alt_email.eq."${session.email}"`)
          .order("valid_until", { ascending: false })
          .limit(1)
          .maybeSingle<{ valid_until: string }>()
      : Promise.resolve({ data: null }),
  ]);
  const open = offers ?? [];
  const pending = (apps.data ?? []).find((a) => a.status === "awaiting_payment");
  const memberUntil = session?.isMember ? membership.data?.valid_until : null;
  const offerFor = (id: string) => open.find((o) => o.id === id);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      {pending && <AutoRefresh seconds={15} />}
      <Reveal className="text-center">
        <p className="eyebrow">South Asian Student Society</p>
        <h1 className="mt-3 font-display text-4xl">Membership</h1>
        <ul className="mx-auto mt-6 max-w-sm space-y-2.5 text-left text-sm">
          {PERKS.map((p) => (
            <li key={p.text} className="flex items-center gap-3"><p.icon className="size-4 shrink-0 text-brand" aria-hidden />{p.text}</li>
          ))}
        </ul>
      </Reveal>
      <FormMessage error={sp.error} success={sp.ok} />

      {memberUntil ? (
        <div className="card flex animate-fade-up items-center gap-4 p-6">
          <BadgeCheck className="size-10 shrink-0 text-ok" aria-hidden />
          <div>
            <p className="font-medium">You&apos;re a member</p>
            <p className="text-sm text-muted">Until {formatDate(memberUntil)}. Member prices apply to your tickets automatically.</p>
          </div>
        </div>
      ) : pending ? (
        <div className="card animate-fade-up space-y-4 p-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-warn" aria-hidden />
            <p className="font-medium text-warn">Waiting for your payment</p>
          </div>
          <p>
            Send <strong>{formatPrice(pending.price_cents)}</strong> by FPS for <strong>{offerFor(pending.offer_id)?.name ?? "membership"}</strong>, with this exact reference in the remarks:
          </p>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3">
            <p className="font-mono text-xl font-semibold tracking-wider">{pending.payment_reference}</p>
            <CopyButton value={pending.payment_reference} />
          </div>
          {offerFor(pending.offer_id)?.payment_instructions && (
            <div className="whitespace-pre-line rounded-2xl border border-line p-4 leading-relaxed">{offerFor(pending.offer_id)!.payment_instructions}</div>
          )}
          <p className="text-muted">Once ExCo confirms the transfer, this page turns into &quot;You&apos;re a member&quot; by itself, and member prices apply straight away.</p>
          <form action={cancelMyApplication}>
            <input type="hidden" name="id" value={pending.id} />
            <SubmitButton className="text-xs text-muted underline-offset-4 hover:underline" pendingText="Cancelling…">Cancel this</SubmitButton>
          </form>
        </div>
      ) : open.length === 0 ? (
        <p className="card py-10 text-center text-sm text-muted">Membership sales aren&apos;t open right now. Watch our Instagram.</p>
      ) : (
        open.map((o) => (
          <form key={o.id} action={applyForMembership} className="card animate-fade-up space-y-4 p-6">
            <input type="hidden" name="offer_id" value={o.id} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-medium">{o.name}{o.team_only && <span className="badge ml-2 bg-sass-blue/10 align-middle text-sass-blue">Team only</span>}</p>
                <p className="text-sm text-muted">Valid until {formatDate(o.valid_until)}</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums">{formatPrice(o.price_cents)}</p>
            </div>
            {o.description && <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{o.description}</p>}
            {session ? (
              <>
                <div>
                  <label className="label" htmlFor={`sid-${o.id}`}>Student ID (optional)</label>
                  <input id={`sid-${o.id}`} name="student_id" maxLength={30} className="input" />
                </div>
                <SubmitButton className="btn-primary w-full py-3" pendingText="One moment…">
                  {o.price_cents === 0 ? "Join for free" : `Become a member · ${formatPrice(o.price_cents)}`}
                </SubmitButton>
                <p className="hint text-center">Your membership is under <strong>{session.email}</strong>. Log in with this email to get member prices.</p>
              </>
            ) : (
              <Link href="/login?next=/membership" className="btn-primary w-full py-3">Log in to join</Link>
            )}
          </form>
        ))
      )}
    </div>
  );
}
