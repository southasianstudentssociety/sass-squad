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
    <article className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        {!event.is_published && (
          <p className="mb-4 rounded-lg bg-warn/10 px-3 py-2 text-sm font-medium text-warn">Draft: only staff can see this page.</p>
        )}
        {event.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.cover_image_url} alt="" className="mb-6 aspect-[16/9] w-full rounded-2xl object-cover" />
        )}
        <p className="text-sm font-semibold text-brand">
          {formatDateTime(event.starts_at)}{event.ends_at && ` – ${formatTime(event.ends_at)}`}
        </p>
        <h1 className="mb-2 text-3xl font-extrabold sm:text-4xl">{event.title}</h1>
        {event.venue && <p className="mb-6 text-muted">{event.venue}</p>}
        {event.description && <div className="whitespace-pre-line leading-relaxed">{event.description}</div>}
      </div>

      <aside className="card h-fit space-y-4 lg:sticky lg:top-20">
        <div className="space-y-1 text-sm">
          <PriceRow label="Members" value={formatPrice(event.member_price_pence)} highlight={isMember} />
          {event.access === "everyone" ? (
            <PriceRow label="Non-members" value={formatPrice(event.public_price_pence)} highlight={!!session && !isMember} />
          ) : (
            <p className="text-muted">Members only</p>
          )}
          {event.member_sales_open_at && (
            <p className="pt-2 text-muted">Member sales open {formatDateTime(event.member_sales_open_at)}</p>
          )}
          {event.public_sales_open_at && event.access === "everyone" && (
            <p className="text-muted">General sales open {formatDateTime(event.public_sales_open_at)}</p>
          )}
        </div>

        <FormMessage error={sp.error} />

        {existingTicketId ? (
          <Link href={`/tickets/${existingTicketId}`} className="btn-primary w-full">View my ticket</Link>
        ) : over ? (
          <p className="text-sm text-muted">This event has finished.</p>
        ) : !session ? (
          <Link href={`/login?next=${encodeURIComponent(`/events/${event.slug}`)}`} className="btn-primary w-full">
            Log in to get a ticket
          </Link>
        ) : sales.state === "members_only" ? (
          <p className="text-sm text-muted">
            This event is for members only. If you&apos;re a member and see this, ask a committee member to check the
            email on your membership matches <strong>{session.email}</strong>.
          </p>
        ) : sales.state === "not_yet" ? (
          <p className="text-sm font-medium">Tickets open for you {formatDateTime(sales.opensAt)}.</p>
        ) : sales.state === "closed" ? (
          <p className="text-sm text-muted">Sales have closed.</p>
        ) : (
          <form action={claimTicket}>
            <input type="hidden" name="event_id" value={event.id} />
            <input type="hidden" name="slug" value={event.slug} />
            <SubmitButton className="btn-primary w-full" pendingText="Getting your ticket…">
              {yourPrice === 0 ? (isMember ? "Claim my free member ticket" : "Get free ticket") : `Get ticket · ${formatPrice(yourPrice)}`}
            </SubmitButton>
            {yourPrice > 0 && (
              <p className="hint">You&apos;ll get bank transfer details and a payment reference on the next screen.</p>
            )}
          </form>
        )}
      </aside>
    </article>
  );
}

function PriceRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between rounded-lg px-2 py-1 ${highlight ? "bg-brand-soft font-semibold" : ""}`}>
      <span>{label}{highlight && " (you)"}</span>
      <span>{value}</span>
    </div>
  );
}
