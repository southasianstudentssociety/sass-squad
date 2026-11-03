import Link from "next/link";
import { BadgeCheck, Clock, MessageCircle } from "lucide-react";
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
import { LAST_PRICE_NOTE, MEMBERSHIP_BENEFITS, NEXT_MEMBERSHIP_YEAR } from "@/lib/membership-content";

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
    session ? supabase.rpc("my_membership") : Promise.resolve({ data: null }),
  ]);
  const open = offers ?? [];
  const pending = (apps.data ?? []).find((a) => a.status === "awaiting_payment");
  const memberUntil = session?.isMember ? ((membership.data as string | null) ?? null) : null;
  const isTeam = session?.access.isTeam ?? false;
  const offerFor = (id: string) => open.find((o) => o.id === id);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      {pending && <AutoRefresh seconds={15} />}
      <Reveal className="text-center">
        <p className="eyebrow">South Asian Student Society</p>
        <h1 className="mt-3 font-display text-4xl">Membership</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          {memberUntil ? "Thanks for being part of SASS. Here's what your membership gets you." : "One membership, a whole year of SASS. Here's what members get."}
        </p>
      </Reveal>
      <FormMessage error={sp.error} success={sp.ok} />

      {!memberUntil && <Benefits title="What members get" />}

      {memberUntil ? (
        <div className="card animate-fade-up space-y-4 border-ok/30 p-6">
          <div className="flex items-center gap-4">
            <BadgeCheck className="size-11 shrink-0 text-ok" aria-hidden />
            <div>
              <p className="text-lg font-medium">You&apos;ve got your membership</p>
              <p className="text-sm text-muted">Member prices apply to your tickets automatically.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-page px-3.5 py-2.5 text-sm">
            <Clock className="size-4 shrink-0 text-muted" aria-hidden />
            Your membership expires on <strong>{formatDate(memberUntil)}</strong>.
          </div>
          {session && !session.profile.phone && (
            <Link href="/account" className="flex items-center gap-2 rounded-xl bg-ok/10 px-3.5 py-2.5 text-sm text-ok hover:bg-ok/15">
              <MessageCircle className="size-4 shrink-0" aria-hidden />Add your WhatsApp number in Settings so we can add you to the members&apos; group chat →
            </Link>
          )}
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
              {LAST_PRICE_NOTE && <p className="text-sm">Last time: <strong>{LAST_PRICE_NOTE}</strong></p>}
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
      )}

      {memberUntil && <Benefits title="What you enjoy" />}
    </div>
  );
}

function Benefits({ title }: { title: string }) {
  return (
    <section className="space-y-3">
      <h2 className="eyebrow text-center">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {MEMBERSHIP_BENEFITS.map((b) => (
          <li key={b.title} className="card flex gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><b.icon className="size-[18px]" aria-hidden /></span>
            <span>
              <span className="block font-medium">{b.title}</span>
              <span className="text-sm text-muted">{b.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
