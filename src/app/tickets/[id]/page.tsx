import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPrice, formatTime } from "@/lib/format";
import type { SassEvent, Ticket } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

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

  const showQr = t.status === "confirmed";
  const qrSvg = showQr
    ? await QRCode.toString(`SASS1:${t.qr_token}`, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#1f1a17", light: "#ffffff" } })
    : null;

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <Link href="/tickets" className="text-sm text-muted underline">← All tickets</Link>

      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lg">
        <div className="bg-brand-deep px-5 pb-5 pt-6 text-brand-ink">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80">SASS presents</p>
          <h1 className="mt-1 font-display text-3xl font-normal leading-tight">{t.event.title}</h1>
          <p className="mt-2 text-sm opacity-90">
            {formatDateTime(t.event.starts_at)}{t.event.ends_at && ` – ${formatTime(t.event.ends_at)}`}
          </p>
          {t.event.venue && <p className="text-sm opacity-90">{t.event.venue}</p>}
        </div>
        <div className="sass-stripe h-2" aria-hidden />

        <div className="relative border-t-2 border-dashed border-line px-5 py-6">
          {showQr && !t.checked_in_at && qrSvg ? (
            <div className="mx-auto w-full max-w-[260px]" aria-label="Ticket QR code" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          ) : t.checked_in_at ? (
            <div className="py-10 text-center">
              <p className="text-4xl">✅</p>
              <p className="mt-2 font-bold">Checked in at {formatTime(t.checked_in_at)}</p>
              <p className="text-sm text-muted">Enjoy the event!</p>
            </div>
          ) : t.status === "cancelled" ? (
            <p className="py-10 text-center font-semibold text-bad">This ticket was cancelled.</p>
          ) : (
            <PaymentPanel ticket={t} />
          )}

          <dl className="mt-5 grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted">Name</dt>
            <dd className="text-right font-semibold">{t.holder_name}</dd>
            <dt className="text-muted">Ticket</dt>
            <dd className="text-right">{t.is_member ? "Member" : "Non-member"} · {formatPrice(t.price_cents)}</dd>
            <dt className="text-muted">Reference</dt>
            <dd className="text-right font-mono">{t.payment_reference}</dd>
            <dt className="text-muted">Status</dt>
            <dd className="text-right"><StatusBadge status={t.status} checkedIn={!!t.checked_in_at} /></dd>
          </dl>
        </div>
      </div>

      {showQr && !t.checked_in_at && (
        <p className="text-center text-xs text-muted">
          Turn your screen brightness up at the door. This QR works once. Sharing a screenshot means whoever scans first gets in.
        </p>
      )}
    </div>
  );
}

function PaymentPanel({ ticket }: { ticket: Row }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-base font-bold text-warn">Payment needed</p>
      <p>
        Send <strong>{formatPrice(ticket.price_cents)}</strong> by FPS and put this exact reference in the remarks:
      </p>
      <p className="rounded-xl bg-brand-soft py-3 text-center font-mono text-2xl font-bold tracking-wider">{ticket.payment_reference}</p>
      {ticket.event.payment_instructions ? (
        <div className="whitespace-pre-line rounded-xl border border-line p-3">{ticket.event.payment_instructions}</div>
      ) : (
        <p className="text-muted">Bank details will be shared by the committee.</p>
      )}
      <p className="text-muted">
        Your QR code appears here once our Finance team confirms your payment. This is done by hand, so it can take a while. Check back later.
      </p>
    </div>
  );
}
