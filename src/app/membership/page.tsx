import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPrice } from "@/lib/format";
import type { MembershipApplication, MembershipOffer } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { applyForMembership, cancelMyApplication } from "./actions";
import { NEXT_MEMBERSHIP_YEAR } from "@/lib/membership-content";
import { MemberPass, MembershipHero, NotTheTeam, PaysForItself, PerkRibbon, PerkTickets, PriceTiers, type MemberPlan } from "./showcase";

export const metadata = { title: "Membership" };


export default async function MembershipPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: offers }, apps, membership] = await Promise.all([
    supabase.from("membership_offers").select("*").eq("is_open", true).order("valid_until").returns<MembershipOffer[]>(),
    session
      ? supabase.from("membership_applications").select("*").eq("user_id", session.userId).neq("status", "cancelled").order("created_at", { ascending: false }).returns<MembershipApplication[]>()
      : Promise.resolve({ data: [] as MembershipApplication[] }),
    session ? supabase.rpc("my_membership_plan") : Promise.resolve({ data: null }),
  ]);
  const open = offers ?? [];
  const pending = (apps.data ?? []).find((a) => a.status === "awaiting_payment");
  const plan = session?.isMember ? ((membership.data as MemberPlan) ?? null) : null;
  const memberUntil = plan?.valid_until ?? null;
  const isTeam = session?.access.isTeam ?? false;
  const offerFor = (id: string) => open.find((o) => o.id === id);

  const joinable = !memberUntil && (open.length > 0 || !!pending);

  // Membership status / payment / buy / closed, depending on who's looking.
  const status = (
    memberUntil ? (
        session && !session.profile.phone ? (
          <Link href="/account" className="mx-auto flex max-w-md items-center gap-2 rounded-xl bg-ok/10 px-3.5 py-2.5 text-sm text-ok hover:bg-ok/15">
            <MessageCircle className="size-4 shrink-0" aria-hidden />Add your WhatsApp number in Settings so we can add you to the members&apos; group chat →
          </Link>
        ) : null
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
        <div className="card space-y-2 py-8 text-center">
          {isTeam ? (
            <>
              <p className="font-medium">Get your membership</p>
              <p className="mx-auto max-w-sm text-sm text-muted">
                As part of the team you can join any time, but the team membership isn&apos;t open right now. Ask an ExCo to open it on <strong>Admin → Memberships</strong> (tick &ldquo;Team only&rdquo;).
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Membership sales are closed for now</p>
              <p className="mx-auto max-w-sm text-sm text-muted">Stay tuned for the {NEXT_MEMBERSHIP_YEAR} membership. We&apos;ll announce it on our Instagram{session ? "" : ", and you can buy it right here"}.</p>
            </>
          )}
        </div>
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
      )
  );

  return (
    <div className="space-y-16 sm:space-y-24">
      {pending && <AutoRefresh seconds={15} />}
      <MembershipHero member={!!memberUntil} joinable={joinable} />
      <FormMessage error={sp.error} success={sp.ok} />

      {memberUntil ? (
        <>
          <div className="space-y-4">
            <MemberPass name={session?.profile.full_name ?? session?.email ?? "Member"} plan={plan} />
            {status}
          </div>
          <PerkRibbon />
          <PerkTickets owned />
          <PaysForItself member />
          <PriceTiers salesOpen={open.length > 0} nextYear={NEXT_MEMBERSHIP_YEAR} plan={plan} />
          <NotTheTeam />
        </>
      ) : (
        <>
          <PerkRibbon />
          <PaysForItself member={false} />
          <PerkTickets owned={false} />
          <PriceTiers salesOpen={open.length > 0} nextYear={NEXT_MEMBERSHIP_YEAR} />
          <NotTheTeam />
          <section id="join" className="mx-auto max-w-xl scroll-mt-24 space-y-4">
            <h2 className="text-center font-display text-3xl">{open.length > 0 || pending ? "Join SASS" : "Get your membership"}</h2>
            {status}
          </section>
        </>
      )}
    </div>
  );
}
