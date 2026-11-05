import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { EVENT_COLUMNS, eventIsOver, priceFor, salesStateFor } from "@/lib/events";
import { formatDateTime, formatPrice, formatEnd } from "@/lib/format";
import type { SassEvent } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { claimTeamTicket, claimTicket } from "./actions";
import { AddToCalendar } from "@/components/add-to-calendar";
import { GalleryStrip } from "@/components/gallery-strip";
import { galleryItems } from "@/lib/gallery";
import { SITE } from "@/lib/site";
import { SoldOutStamp } from "@/components/sold-out-stamp";
import { MealPicker } from "@/components/meal-picker";
import { MEAL_COLUMNS, type MealOption } from "@/lib/meals";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select(EVENT_COLUMNS).eq("slug", slug).maybeSingle<SassEvent>();
  if (!event) notFound();

  const session = await getSession();
  const isTeam = session?.access.isTeam ?? false;
  const [{ data: existing }, { data: team }, { data: mealData }] = await Promise.all([
    session
      ? supabase
          .from("tickets")
          .select("id, status, team_rate, meal_option_id")
          .eq("event_id", event.id)
          .eq("user_id", session.userId)
          .neq("status", "cancelled")
          .maybeSingle<{ id: string; status: string; team_rate: boolean; meal_option_id: string | null }>()
      : Promise.resolve({ data: null }),
    // Only current team members can read team prices; everyone else gets nothing back.
    isTeam
      ? supabase.from("event_team_prices").select("price_cents").eq("event_id", event.id).maybeSingle<{ price_cents: number }>()
      : Promise.resolve({ data: null }),
    event.meals_enabled
      ? supabase.from("event_meal_options").select(MEAL_COLUMNS).eq("event_id", event.id).is("archived_at", null).order("sort_order").returns<MealOption[]>()
      : Promise.resolve({ data: null }),
  ]);
  const meals = event.meals_enabled ? (mealData ?? []) : [];
  const existingTicketId = existing?.id ?? null;
  const isExco = isTeam && (session?.access.isAdmin ?? false);
  // Subcommittee pay the team price (if set); ExCo are always free. Both are reserved places.
  const teamPrice = isTeam ? (team?.price_cents ?? null) : null;
  const myTeamPrice = isExco ? 0 : teamPrice;
  const canSwitchToTeam = myTeamPrice !== null && existing?.status === "awaiting_payment" && !existing.team_rate;

  const isMember = session?.isMember ?? false;
  const sales = salesStateFor(event, isMember);
  const yourPrice = priceFor(event, isMember);
  const over = eventIsOver(event);
  const photos = over ? await galleryItems(24, event.id) : [];

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_360px] lg:gap-12">
      <div className="order-2 lg:order-1">
        {!event.is_published && (
          <p className="mb-5 rounded-xl border border-warn/20 bg-warn/[0.06] px-3.5 py-2.5 text-sm font-medium text-warn">Draft: only the team can see this page. Tickets go on sale when it&apos;s published.</p>
        )}
        {event.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.cover_image_url} alt="" className="mb-8 aspect-[16/9] w-full animate-scale-in rounded-3xl object-cover shadow-[var(--shadow-lift)]" />
        )}
        <p className="eyebrow">
          {formatDateTime(event.starts_at)}{event.ends_at && ` – ${formatEnd(event.starts_at, event.ends_at)}`}
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.1] sm:text-5xl">{event.title}</h1>
        {event.venue && <p className="mt-3 text-muted">{event.venue}</p>}
        {!over && <AddToCalendar event={event} className="mt-5" />}
        {event.description && <div className="mt-8 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{event.description}</div>}
        {photos.length > 0 && (
          <section className="mt-12 pb-12">
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 className="font-display text-2xl">Photos</h2>
              <a href={SITE.photosUrl} target="_blank" rel="noreferrer" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">View all photos</a>
            </div>
            <GalleryStrip items={photos} />
          </section>
        )}
      </div>

      <aside className="order-1 h-fit animate-fade-up space-y-5 rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-lift)] sm:p-6 lg:sticky lg:top-24 lg:order-2">
        <div className="relative space-y-1.5 text-sm">
          {event.sold_out && !over && <SoldOutStamp />}
          {isExco && <PriceRow label="ExCo" value="Free" highlight note="only the team sees this" />}
          {teamPrice !== null && (
            isExco
              ? <PriceRow label="Subcommittee" value={formatPrice(teamPrice)} />
              : <PriceRow label="Team" value={formatPrice(teamPrice)} highlight note="only the team sees this" />
          )}
          <PriceRow label="Members" value={formatPrice(event.member_price_cents)} highlight={myTeamPrice === null && isMember} />
          {event.access === "everyone" ? (
            <PriceRow label="Non-members" value={formatPrice(event.public_price_cents)} highlight={myTeamPrice === null && !!session && !isMember} />
          ) : (
            <p className="px-3 text-muted">Members only</p>
          )}
          {(event.member_sales_open_at || event.public_sales_open_at) && (
            <div className="space-y-0.5 px-3 pt-2 text-xs text-muted">
              {event.member_sales_open_at && <p>Member sales open {formatDateTime(event.member_sales_open_at)}</p>}
              {event.public_sales_open_at && event.access === "everyone" && <p>General sales open {formatDateTime(event.public_sales_open_at)}</p>}
            </div>
          )}
        </div>

        {session && !isMember && event.member_price_cents < event.public_price_cents && (
          <Link href="/membership" className="block rounded-xl bg-accent/30 px-3.5 py-2.5 text-sm transition-colors hover:bg-accent/45">
            Members pay <strong>{formatPrice(event.member_price_cents)}</strong>. Become a member →
          </Link>
        )}
        <FormMessage error={sp.error} />

        {existingTicketId ? (
          <div className="space-y-2">
            <Link href={`/tickets/${existingTicketId}`} className="btn-primary w-full py-3">View my ticket</Link>
            {canSwitchToTeam && !over && (
              <form action={claimTeamTicket}>
                <input type="hidden" name="event_id" value={event.id} />
                <input type="hidden" name="slug" value={event.slug} />
                {meals.length > 0 && (existing?.meal_option_id
                  ? <input type="hidden" name="meal_option_id" value={existing.meal_option_id} />
                  : <div className="mb-3"><MealPicker options={meals} /></div>)}
                <SubmitButton className="btn-ghost w-full" pendingText="Switching…">{isExco ? "Switch to my free ExCo ticket" : `Switch to the team price · ${formatPrice(myTeamPrice!)}`}</SubmitButton>
                <p className="hint text-center">Your ticket isn&apos;t paid yet, so it can move to the {isExco ? "ExCo" : "team"} price. Same reference.</p>
              </form>
            )}
          </div>
        ) : !event.is_published ? (
          <p className="rounded-xl bg-page px-3.5 py-3 text-center text-sm text-muted">Tickets go on sale when this event is published.</p>
        ) : over ? (
          <p className="rounded-xl bg-page px-3.5 py-3 text-center text-sm text-muted">This event has finished.</p>
        ) : !session ? (
          <Link href={`/login?next=${encodeURIComponent(`/events/${event.slug}`)}`} className="btn-primary w-full py-3">
            Log in to get a ticket
          </Link>
        ) : myTeamPrice !== null ? (
          <form action={claimTeamTicket} className="space-y-4">
            <input type="hidden" name="event_id" value={event.id} />
            <input type="hidden" name="slug" value={event.slug} />
            {meals.length > 0 && <MealPicker options={meals} />}
            <SubmitButton className="btn-primary w-full py-3" pendingText="Getting your ticket…">
              {isExco ? "Get my free ExCo ticket" : myTeamPrice === 0 ? "Get my free team ticket" : `Get team ticket · ${formatPrice(myTeamPrice)}`}
            </SubmitButton>
            <p className="hint text-center">{event.sold_out ? "Sold out to everyone else, but your team place is still reserved." : "Your place is reserved as part of the team."}{myTeamPrice > 0 && " You'll get FPS payment details and a reference on the next screen."}</p>
          </form>
        ) : sales.state === "members_only" ? (
          <p className="text-sm leading-relaxed text-muted">
            This event is for members only. If you&apos;re a member and see this, ask a committee member to check the
            email on your membership matches <strong className="text-ink">{session.email}</strong>.
          </p>
        ) : sales.state === "not_yet" ? (
          <p className="rounded-xl bg-page px-3.5 py-3 text-center text-sm font-medium">Tickets open for you {formatDateTime(sales.opensAt)}.</p>
        ) : sales.state === "sold_out" ? (
          <p className="rounded-xl bg-page px-3.5 py-3 text-center text-sm text-muted">Every ticket has gone. See you at the next one.</p>
        ) : sales.state === "closed" ? (
          <p className="rounded-xl bg-page px-3.5 py-3 text-center text-sm text-muted">Sales have closed.</p>
        ) : (
          <form action={claimTicket} className="space-y-4">
            <input type="hidden" name="event_id" value={event.id} />
            <input type="hidden" name="slug" value={event.slug} />
            {meals.length > 0 && <MealPicker options={meals} />}
            <SubmitButton className="btn-primary w-full py-3" pendingText="Getting your ticket…">
              {yourPrice === 0 ? (isMember ? "Claim my free member ticket" : "Get free ticket") : `Get ticket · ${formatPrice(yourPrice)}`}
            </SubmitButton>
            {yourPrice > 0 && (
              <p className="hint text-center">You&apos;ll get FPS payment details and a reference on the next screen.</p>
            )}
          </form>
        )}
      </aside>
    </article>
  );
}

function PriceRow({ label, value, highlight, note }: { label: string; value: string; highlight?: boolean; note?: string }) {
  return (
    <div className={`flex items-baseline justify-between rounded-xl px-3 py-2 transition-colors ${highlight ? "bg-brand-soft text-ink" : "text-ink/80"}`}>
      <span>{label}{highlight && <span className="ml-1.5 text-xs text-brand">· your price{note && `, ${note}`}</span>}</span>
      <span className={`tabular-nums ${highlight ? "text-base font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
