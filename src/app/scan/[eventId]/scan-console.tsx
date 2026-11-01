"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { checkInAction, createDoorTicketAction, previewAction, searchTickets, type Counts, type SearchRow } from "../actions";
import type { CheckInResponse, ScanResult, TicketSource } from "@/lib/types";
import { formatPrice, formatTime } from "@/lib/format";
import { SwipeToConfirm } from "@/components/swipe-to-confirm";
import { AnimatePresence, motion } from "motion/react";

type Tab = "scan" | "search" | "door";

const RESULT_COPY: Record<ScanResult, { title: string; tone: "ok" | "bad" | "warn" }> = {
  valid: { title: "VALID TICKET", tone: "ok" },
  ok: { title: "CHECKED IN", tone: "ok" },
  already_used: { title: "ALREADY USED", tone: "bad" },
  unpaid: { title: "NOT PAID", tone: "warn" },
  cancelled: { title: "CANCELLED TICKET", tone: "bad" },
  wrong_event: { title: "WRONG EVENT", tone: "bad" },
  invalid: { title: "NOT A SASS TICKET", tone: "bad" },
};

const TONE_BG = { ok: "bg-ok", bad: "bg-bad", warn: "bg-warn" } as const;

export function ScanConsole(props: {
  eventId: string;
  title: string;
  defaultWalkInDollars: string;
  initialCounts: Counts;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>("scan");
  const [counts, setCounts] = useState(props.initialCounts);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/scan" className="text-xs text-muted underline">← Events</Link>
          <h1 className="text-xl font-display font-normal leading-tight">{props.title}</h1>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tabular-nums">{counts.checkedIn}<span className="text-base text-muted">/{counts.confirmed}</span></p>
          <p className="text-xs text-muted">checked in{counts.awaiting > 0 && ` · ${counts.awaiting} unpaid`}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-line p-1 text-sm font-semibold">
        {(["scan", "search", "door"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg py-2 ${tab === t ? "bg-surface shadow" : "text-muted"}`}
          >
            {t === "scan" ? "Scan" : t === "search" ? "Find name" : "Walk-in"}
          </button>
        ))}
      </div>

      {tab === "scan" && <ScanTab eventId={props.eventId} onCounts={setCounts} />}
      {tab === "search" && <SearchTab eventId={props.eventId} onCounts={setCounts} />}
      {tab === "door" && <DoorTab eventId={props.eventId} defaultDollars={props.defaultWalkInDollars} onCounts={setCounts} />}

      {props.isAdmin && (
        <a href={`/admin/events/${props.eventId}/export`} className="block text-center text-xs text-muted underline">
          Download guest list (CSV) for offline backup
        </a>
      )}
    </div>
  );
}

/**
 * Shows a scan / lookup result and stays until the door person acts:
 * valid → swipe to admit (or cancel); anything else → tap to dismiss.
 */
function ResultCard({
  res,
  error,
  onDismiss,
  onAdmit,
}: {
  res?: CheckInResponse;
  error?: string;
  onDismiss: () => void;
  onAdmit?: (ticketId: string) => Promise<boolean | void>;
}) {
  if (error) {
    return (
      <button onClick={onDismiss} className="w-full rounded-3xl bg-bad p-6 text-left text-white shadow-2xl">
        <p className="text-2xl font-extrabold">ERROR</p>
        <p className="mt-1">{error}</p>
        <p className="mt-4 text-sm opacity-80">Tap to continue</p>
      </button>
    );
  }
  if (!res) return null;
  const copy = RESULT_COPY[res.result];
  const t = res.ticket;
  const awaitingSwipe = res.result === "valid" && t && onAdmit;

  const body = (
    <>
      <p className="text-[13px] font-semibold tracking-[0.14em] opacity-90">{copy.title}</p>
      {t ? (
        <div className="mt-2 space-y-1">
          <p className="text-[1.9rem] font-bold leading-tight">{t.holder_name}</p>
          <p className="text-sm opacity-90">
            {t.is_member ? "Member ticket" : "Non-member ticket"} · {formatPrice(t.price_cents)}
            {t.source !== "online" && ` · ${t.source === "comp" ? "Comp" : "Door"}`}
          </p>
          {t.is_member && !t.member_now && <p className="text-sm font-semibold">⚠ Membership has since expired</p>}
          {res.result === "already_used" && t.checked_in_at && (
            <p className="text-sm font-semibold">First checked in at {formatTime(t.checked_in_at)}. Check ID, this may be a shared screenshot.</p>
          )}
          {res.result === "unpaid" && <p className="text-sm font-semibold">Ref {t.payment_reference}. Send to Finance or use Walk-in.</p>}
          {res.result === "valid" && <p className="text-sm opacity-90">Check their student ID matches this name, then swipe.</p>}
        </div>
      ) : (
        <p className="mt-2 text-lg font-semibold">{res.result === "wrong_event" ? "This ticket is for a different event." : "This QR isn't a SASS ticket."}</p>
      )}
    </>
  );

  if (awaitingSwipe) {
    return (
      <div className="w-full space-y-5 rounded-3xl bg-ok p-6 text-white shadow-2xl">
        <div>{body}</div>
        <SwipeToConfirm label="Swipe to check in" onConfirm={() => onAdmit(t.id)} />
        <button onClick={onDismiss} className="mx-auto block text-sm text-white/80 underline-offset-4 hover:underline">
          Not them? Cancel
        </button>
      </div>
    );
  }

  return (
    <button onClick={onDismiss} className={`w-full rounded-3xl p-6 text-left text-white shadow-2xl ${TONE_BG[copy.tone]}`}>
      {body}
      <p className="mt-4 text-sm opacity-80">{res.result === "ok" ? "Tap or wait to scan next" : "Tap to continue"}</p>
    </button>
  );
}

/**
 * Pop-up over the scanner: dims the screen and centres the result card.
 * Rejections: tap anywhere to dismiss. Valid tickets: a stray tap outside does nothing
 * (so nobody is turned away by accident); swipe to admit, or Cancel / Escape to back out.
 * After the swipe the card shows "Checked in" briefly, then fades away.
 */
export function ResultLayer(props: {
  res?: CheckInResponse;
  error?: string;
  onDismiss: () => void;
  onAdmit?: (ticketId: string) => Promise<boolean | void>;
}) {
  const open = !!(props.res || props.error);
  const awaitingSwipe = props.res?.result === "valid";
  const { onDismiss } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onDismiss]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="result-layer"
          role="dialog"
          aria-modal="true"
          aria-label="Ticket result"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          transition={{ duration: 0.18 }}
          onClick={(e) => { if (e.target === e.currentTarget && !awaitingSwipe) onDismiss(); }}
        >
          <motion.div
            className="w-full max-w-md"
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.35, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <ResultCard {...props} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Shared preview → swipe → admit flow for the Scan and Find name tabs. */
function useAdmission(eventId: string, onCounts: (c: Counts) => void, after?: () => void) {
  const [res, setRes] = useState<CheckInResponse | undefined>();
  const [error, setError] = useState<string | undefined>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setRes(undefined);
    setError(undefined);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const preview = useCallback(
    async (input: { qr?: string; ticketId?: string }) => {
      try {
        const out = await previewAction(eventId, input);
        if (out.error) setError(out.error);
        else {
          setRes(out.response);
          navigator.vibrate?.(out.response?.result === "valid" ? 40 : [200, 100, 200]);
        }
      } catch {
        setError("No connection. Use 'Find name' once back online, or the printed list.");
      }
    },
    [eventId],
  );

  // Step 2: the swipe. If someone else admitted this ticket in the meantime, show that instead.
  const admit = useCallback(
    async (ticketId: string) => {
      try {
        const out = await checkInAction(eventId, { ticketId });
        if (out.counts) onCounts(out.counts);
        if (out.error) {
          setError(out.error);
          return;
        }
        setRes(out.response);
        after?.();
        if (out.response?.result === "ok") timer.current = setTimeout(dismiss, 1100);
        else navigator.vibrate?.([200, 100, 200]);
      } catch {
        setError("No connection. The ticket was not checked in. Try again.");
      }
    },
    [eventId, onCounts, dismiss, after],
  );

  return { res, error, dismiss, preview, admit };
}

function ScanTab({ eventId, onCounts }: { eventId: string; onCounts: (c: Counts) => void }) {
  const { res, error, dismiss, preview, admit } = useAdmission(eventId, onCounts);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const showing = busy || !!res || !!error;

  const onScan = useCallback(
    async (codes: IDetectedBarcode[]) => {
      const raw = codes[0]?.rawValue;
      if (!raw || showing) return;
      setBusy(true);
      await preview({ qr: raw });
      setBusy(false);
    },
    [showing, preview],
  );

  return (
    <div className="space-y-3">
      {/* The camera stays paused while a result is on screen, so nothing changes under the door person's eyes. */}
      <div className="relative overflow-hidden rounded-3xl bg-black">
        <Scanner
          onScan={onScan}
          onError={(e) => setCameraError(e instanceof Error ? e.message : "Camera unavailable")}
          paused={showing}
          formats={["qr_code"]}
          allowMultiple
          scanDelay={1500}
          sound={false}
          constraints={{ facingMode: "environment" }}
          styles={{ container: { width: "100%", aspectRatio: "1 / 1" } }}
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-bold text-white">Checking…</div>
        )}
      </div>
      {cameraError && (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
          Camera problem: {cameraError}. Allow camera access in your browser settings (the site must be on https), or use &quot;Find name&quot;.
        </p>
      )}
      <ResultLayer res={res} error={error} onDismiss={dismiss} onAdmit={admit} />
    </div>
  );
}

function SearchTab({ eventId, onCounts }: { eventId: string; onCounts: (c: Counts) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [pending, start] = useTransition();
  const refresh = useCallback(() => start(async () => setRows(await searchTickets(eventId, q))), [eventId, q]);
  const { res, error, dismiss, preview, admit } = useAdmission(eventId, onCounts, refresh);

  useEffect(() => {
    const term = q;
    const h = setTimeout(() => {
      start(async () => setRows(await searchTickets(eventId, term)));
    }, 250);
    return () => clearTimeout(h);
  }, [q, eventId]);

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, email or reference (SASS-…)"
        className="input"
        autoFocus
      />
      <ResultLayer res={res} error={error} onDismiss={dismiss} onAdmit={admit} />
      {pending && <p className="text-sm text-muted">Searching…</p>}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{r.holder_name}</p>
              <p className="truncate text-xs text-muted">
                {r.is_member ? "Member" : "Non-member"} · {r.payment_reference}{r.holder_email && ` · ${r.holder_email}`}
              </p>
            </div>
            {r.checked_in_at ? (
              <span className="badge bg-ink/10 text-ink">In {formatTime(r.checked_in_at)}</span>
            ) : r.status === "awaiting_payment" ? (
              <span className="badge bg-warn/10 text-warn">Unpaid</span>
            ) : (
              <button
                onClick={() => preview({ ticketId: r.id })}
                disabled={!!res}
                className="btn-primary px-3 py-1.5"
              >
                Check in
              </button>
            )}
          </li>
        ))}
        {q.trim().length >= 2 && !pending && rows.length === 0 && <li className="p-3 text-sm text-muted">No match.</li>}
      </ul>
    </div>
  );
}

function DoorTab({ eventId, defaultDollars, onCounts }: { eventId: string; defaultDollars: string; onCounts: (c: Counts) => void }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [source, setSource] = useState<TicketSource>("walk_in");
  const [checkInNow, setCheckInNow] = useState(true);
  const [round, setRound] = useState(0); // remounts the slider after each ticket
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(): Promise<boolean> {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return false;
    const fd = new FormData(form);
    const out = await createDoorTicketAction(eventId, {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      dollars: source === "comp" ? "0" : String(fd.get("dollars") ?? "0"),
      source,
      checkIn: checkInNow,
      notes: String(fd.get("notes") ?? ""),
    });
    if (out.counts) onCounts(out.counts);
    setMsg(out);
    if (out.error) return false;
    form.reset();
    setRound((r) => r + 1);
    return true;
  }

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="card space-y-3">
      <p className="text-sm text-muted">
        For people paying at the door. Only add them once you&apos;ve <strong>seen the transfer land</strong> (or taken cash).
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-line p-1 text-sm font-semibold">
        <button type="button" onClick={() => setSource("walk_in")} className={`rounded-lg py-1.5 ${source === "walk_in" ? "bg-surface shadow" : "text-muted"}`}>Paid walk-in</button>
        <button type="button" onClick={() => setSource("comp")} className={`rounded-lg py-1.5 ${source === "comp" ? "bg-surface shadow" : "text-muted"}`}>Free / guest</button>
      </div>
      <div>
        <label className="label" htmlFor="name">Full name</label>
        <input id="name" name="name" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email (optional)</label>
        <input id="email" name="email" type="email" className="input" />
        <p className="hint">If it matches a membership, they&apos;re marked as a member.</p>
      </div>
      {source === "walk_in" && (
        <div>
          <label className="label" htmlFor="dollars">Amount paid (HK$)</label>
          <input id="dollars" name="dollars" inputMode="decimal" defaultValue={defaultDollars} className="input" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="notes">Note (optional)</label>
        <input id="notes" name="notes" placeholder="e.g. paid via FPS, ref from banking app" className="input" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={checkInNow} onChange={(e) => setCheckInNow(e.target.checked)} /> Check them in now
      </label>
      {msg.ok && <p className="animate-fade-up rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">{msg.ok}</p>}
      {msg.error && <p className="animate-fade-up rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{msg.error}</p>}
      <SwipeToConfirm
        key={round}
        variant="plain"
        label={checkInNow ? "Swipe to add & check in" : "Swipe to add ticket"}
        onConfirm={submit}
      />
    </form>
  );
}
