import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPrice, formatEnd } from "@/lib/format";
import type { SassEvent, Ticket } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { CopyButton } from "@/components/copy-button";
import { Illustration } from "@/components/illustrations";
import { LiveTicket } from "./live-ticket";
import { AddToCalendar } from "@/components/add-to-calendar";
import { feedbackOpen } from "@/lib/feedback";
import { FeedbackForm } from "./feedback-form";

export const metadata = { title: "Ticket" };

type Row = Ticket & { event: SassEvent };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser(`/tickets/${id}`);
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets")
    .select("*, event:events(*)")
    .eq("id", id)
    .eq("user_id", session.userId)
    .maybeSingle<Row>();
  if (!t) notFound();

  const canRate = !!t.checked_in_at && feedbackOpen(t.event.starts_at);
  const { data: myFeedback } = canRate
    ? await supabase.from("event_feedback").select("rating, comment, anonymous").eq("event_id", t.event_id).maybeSingle<{ rating: number; comment: string | null; anonymous: boolean }>()
    : { data: null };

  const showQr = t.status === "confirmed";
  const qrSvg = showQr
    ? await QRCode.toString(`SASS1:${t.qr_token}`, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#1f1a17", light: "#ffffff" } })
    : null;

  const details = (
    <dl className="mt-6 grid grid-cols-2 gap-y-3 border-t border-dashed border-line pt-5 text-sm">
      <dt className="text-muted">Name</dt>
      <dd className="text-right font-medium">{t.holder_name}</dd>
      <dt className="text-muted">Ticket</dt>
      <dd className="text-right">{t.is_member ? "Member" : "Non-member"} · {formatPrice(t.price_cents)}</dd>
      <dt className="text-muted">Reference</dt>
      <dd className="text-right font-mono text-[13px]">{t.payment_reference}</dd>
      <dt className="text-muted">Status</dt>
      <dd className="text-right"><StatusBadge status={t.status} checkedIn={!!t.checked_in_at} /></dd>
    </dl>
  );

  return (
    <div className="mx-auto max-w-sm space-y-5">
      <Link href="/tickets" className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">← All tickets</Link>

      {/* Two pieces (header + stub) so the stub can tear off and fall outside the card. */}
      <div className="animate-scale-in [filter:drop-shadow(0_2px_4px_rgb(28_25_23/0.05))_drop-shadow(0_18px_28px_rgb(28_25_23/0.12))]">
        <div className="rounded-t-[28px] bg-brand-deep px-6 pb-6 pt-7 text-brand-ink">
          <p className="font-brand text-lg opacity-90">SASS</p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight">{t.event.title}</h1>
          <p className="mt-3 text-sm opacity-90">
            {formatDateTime(t.event.starts_at)}{t.event.ends_at && ` – ${formatEnd(t.event.starts_at, t.event.ends_at)}`}
          </p>
          {t.event.venue && <p className="text-sm opacity-80">{t.event.venue}</p>}
        </div>
        <div className="sass-stripe h-1" aria-hidden />

        {/* Perforation with notches, like a paper ticket */}
        <div className="relative z-10 h-0">
          <span className="absolute -left-3 -top-3 size-6 rounded-full bg-page" aria-hidden />
          <span className="absolute -right-3 -top-3 size-6 rounded-full bg-page" aria-hidden />
        </div>

        {t.status === "cancelled" ? (
          <div className="rounded-b-[28px] bg-surface px-6 pb-6 pt-7">
            <p className="py-10 text-center font-medium text-bad">This ticket was cancelled.</p>
            {details}
          </div>
        ) : (
          <LiveTicket
            ticketId={t.id}
            status={t.status}
            checkedInAt={t.checked_in_at}
            qr={qrSvg ? <div className="mx-auto w-full max-w-[250px] animate-scale-in rounded-2xl bg-white p-2 [animation-delay:120ms]" aria-label="Ticket QR code" role="img" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
            payment={<PaymentPanel ticket={t} />}
            details={details}
            art={<Illustration name="checkedIn" className="mx-auto w-32 text-ok" />}
          />
        )}
      </div>

      {canRate && <FeedbackForm eventId={t.event_id} initial={myFeedback} />}

      {t.status !== "cancelled" && !t.checked_in_at && <AddToCalendar event={t.event} className="justify-center" />}

      {showQr && !t.checked_in_at && (
        <p className="px-4 text-center text-xs leading-relaxed text-muted">
          Turn your screen brightness up at the door. This QR works once. Sharing a screenshot means whoever scans first gets in.
        </p>
      )}
    </div>
  );
}

function PaymentPanel({ ticket }: { ticket: Row }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="size-2 animate-pulse rounded-full bg-warn" aria-hidden />
        <p className="font-medium text-warn">Payment needed</p>
      </div>
      <p className="leading-relaxed">
        Send <strong>{formatPrice(ticket.price_cents)}</strong> by FPS and put this exact reference in the remarks:
      </p>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3">
        <p className="font-mono text-xl font-semibold tracking-wider">{ticket.payment_reference}</p>
        <CopyButton value={ticket.payment_reference} />
      </div>
      {ticket.event.payment_instructions ? (
        <div className="whitespace-pre-line rounded-2xl border border-line p-4 leading-relaxed">{ticket.event.payment_instructions}</div>
      ) : (
        <p className="text-muted">Bank details will be shared by the committee.</p>
      )}
      <p className="leading-relaxed text-muted">
        Your QR code appears here once our Finance team confirms your payment. This is done by hand, so it can take a while. This page updates by itself.
      </p>
    </div>
  );
}
