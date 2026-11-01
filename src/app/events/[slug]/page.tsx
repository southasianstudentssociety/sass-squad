import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { EVENT_COLUMNS, eventIsOver, priceFor, salesStateFor } from "@/lib/events";
import { formatDateTime, formatPrice, formatTime } from "@/lib/format";
import type { SassEvent } from "@/lib/types";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { claimTicket } from "./actions";

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
  let existingTicketId: string | null = null;
  if (session) {
    const { data } = await supabase
      .from("tickets")
      .select("id")
      .eq("event_id", event.id)
      .eq("user_id", session.userId)
      .neq("status", "cancelled")
      .maybeSingle<{ id: string }>();
    existingTicketId = data?.id ?? null;
  }

  const isMember = session?.isMember ?? false;
  const sales = salesStateFor(event, isMember);
  const yourPrice = priceFor(event, isMember);
  const over = eventIsOver(event);

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_360px] lg:gap-12">
      <div className="order-2 lg:order-1">
        {!event.is_published && (
          <p className="mb-5 rounded-xl border border-warn/20 bg-warn/[0.06] px-3.5 py-2.5 text-sm font-medium text-warn">Draft: only staff can see this page.</p>
        )}
        {event.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.cover_image_url} alt="" className="mb-8 aspect-[16/9] w-full animate-scale-in rounded-3xl object-cover shadow-[var(--shadow-lift)]" />
        )}
        <p className="eyebrow">
          {formatDateTime(event.starts_at)}{event.ends_at && ` – ${formatTime(event.ends_at)}`}
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.1] sm:text-5xl">{event.title}</h1>
        {event.venue && <p className="mt-3 text-muted">{event.venue}</p>}
        {event.description && <div className="mt-8 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{event.description}</div>}
      </div>

      <aside className="order-1 h-fit animate-fade-up space-y-5 rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-lift)] sm:p-6 lg:sticky lg:top-24 lg:order-2">
        <div className="space-y-1.5 text-sm">
          <PriceRow label="Members" value={formatPrice(event.member_price_cents)} highlight={isMember} />
          {event.access === "everyone" ? (
            <PriceRow label="Non-members" value={formatPrice(event.public_price_cents)} highlight={!!session && !isMember} />
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

        <FormMessage error={sp.error} />

        {existingTicketId ? (
          <Link href={`/tickets/${existingTicketId}`} className="btn-primary w-full py-3">View my ticket</Link>
        ) : over ? (
          <p className="rounded-xl bg-page px-3.5 py-3 text-center text-sm text-muted">This event has finished.</p>
        ) : !session ? (
          <Link href={`/login?next=${encodeURIComponent(`/events/${event.slug}`)}`} className="btn-primary w-full py-3">
            Log in to get a ticket
          </Link>
        ) : sales.state === "members_only" ? (
          <p className="text-sm leading-relaxed text-muted">
            This event is for members only. If you&apos;re a member and see this, ask a committee member to check the
            email on your membership matches <strong className="text-ink">{session.email}</strong>.
          </p>
        ) : sales.state === "not_yet" ? (
          <p className="rounded-xl bg-page px-3.5 py-3 text-center text-sm font-medium">Tickets open for you {formatDateTime(sales.opensAt)}.</p>
        ) : sales.state === "closed" ? (
          <p className="rounded-xl bg-page px-3.5 py-3 text-center text-sm text-muted">Sales have closed.</p>
        ) : (
          <form action={claimTicket}>
            <input type="hidden" name="event_id" value={event.id} />
            <input type="hidden" name="slug" value={event.slug} />
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

function PriceRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between rounded-xl px-3 py-2 transition-colors ${highlight ? "bg-brand-soft text-ink" : "text-ink/80"}`}>
      <span>{label}{highlight && <span className="ml-1.5 text-xs text-brand">· your price</span>}</span>
      <span className={`tabular-nums ${highlight ? "text-base font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
