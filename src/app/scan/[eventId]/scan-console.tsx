"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { checkInAction, createDoorTicketAction, searchTickets, type Counts, type SearchRow } from "../actions";
import type { CheckInResponse, ScanResult, TicketSource } from "@/lib/types";
import { formatPrice, formatTime } from "@/lib/format";

type Tab = "scan" | "search" | "door";

const RESULT_COPY: Record<ScanResult, { title: string; tone: "ok" | "bad" | "warn" }> = {
  ok: { title: "VALID: let them in", tone: "ok" },
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
  defaultWalkInPounds: string;
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
          <h1 className="text-xl font-extrabold leading-tight">{props.title}</h1>
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
      {tab === "door" && <DoorTab eventId={props.eventId} defaultPounds={props.defaultWalkInPounds} onCounts={setCounts} />}

      {props.isAdmin && (
        <a href={`/admin/events/${props.eventId}/export`} className="block text-center text-xs text-muted underline">
          Download guest list (CSV) for offline backup
        </a>
      )}
    </div>
  );
}

function ResultCard({ res, error, onDismiss }: { res?: CheckInResponse; error?: string; onDismiss: () => void }) {
  if (error) {
    return (
      <button onClick={onDismiss} className="w-full rounded-2xl bg-bad p-6 text-left text-white">
        <p className="text-2xl font-extrabold">ERROR</p>
        <p className="mt-1">{error}</p>
        <p className="mt-4 text-sm opacity-80">Tap to continue</p>
      </button>
    );
  }
  if (!res) return null;
  const copy = RESULT_COPY[res.result];
  const t = res.ticket;
  return (
    <button onClick={onDismiss} className={`w-full rounded-2xl p-6 text-left text-white ${TONE_BG[copy.tone]}`}>
      <p className="text-3xl font-extrabold leading-tight">{copy.title}</p>
      {t && (
        <div className="mt-3 space-y-1">
          <p className="text-2xl font-bold">{t.holder_name}</p>
          <p className="text-sm opacity-90">
            {t.is_member ? "Member ticket" : "Non-member ticket"} · {formatPrice(t.price_pence)}
            {t.source !== "online" && ` · ${t.source === "comp" ? "Comp" : "Door"}`}
          </p>
          {t.is_member && !t.member_now && (
            <p className="text-sm font-semibold">⚠ Membership has since expired</p>
          )}
          {res.result === "already_used" && t.checked_in_at && (
            <p className="text-sm font-semibold">First scanned at {formatTime(t.checked_in_at)}. Check ID, this may be a shared screenshot.</p>
          )}
          {res.result === "unpaid" && <p className="text-sm font-semibold">Ref {t.payment_reference}. Send to Finance or use Walk-in.</p>}
          {res.result === "ok" && <p className="text-sm opacity-90">If anything looks off, check their student ID matches this name.</p>}
        </div>
      )}
      <p className="mt-4 text-sm opacity-80">Tap to scan next</p>
    </button>
  );
}

function ScanTab({ eventId, onCounts }: { eventId: string; onCounts: (c: Counts) => void }) {
  const [res, setRes] = useState<CheckInResponse | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showing = busy || !!res || !!error;

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setRes(undefined);
    setError(undefined);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onScan = useCallback(
    async (codes: IDetectedBarcode[]) => {
      const raw = codes[0]?.rawValue;
      if (!raw || busy || res || error) return;
      setBusy(true);
      try {
        const out = await checkInAction(eventId, { qr: raw });
        if (out.counts) onCounts(out.counts);
        if (out.error) setError(out.error);
        else {
          setRes(out.response);
          if (out.response?.result === "ok") timer.current = setTimeout(dismiss, 2500);
          navigator.vibrate?.(out.response?.result === "ok" ? 80 : [200, 100, 200]);
        }
      } catch {
        setError("No connection. Use 'Find name' once back online, or the printed list.");
      } finally {
        setBusy(false);
      }
    },
    [busy, res, error, eventId, onCounts, dismiss],
  );

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-black">
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
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          Camera problem: {cameraError}. Allow camera access in your browser settings (the site must be on https), or use &quot;Find name&quot;.
        </p>
      )}
      <ResultCard res={res} error={error} onDismiss={dismiss} />
    </div>
  );
}

function SearchTab({ eventId, onCounts }: { eventId: string; onCounts: (c: Counts) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [res, setRes] = useState<CheckInResponse | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  useEffect(() => {
    const term = q;
    const h = setTimeout(() => {
      start(async () => setRows(await searchTickets(eventId, term)));
    }, 250);
    return () => clearTimeout(h);
  }, [q, eventId]);

  const checkIn = (ticketId: string) =>
    start(async () => {
      const out = await checkInAction(eventId, { ticketId });
      if (out.counts) onCounts(out.counts);
      setError(out.error);
      setRes(out.response);
      setRows(await searchTickets(eventId, q));
    });

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, email or reference (SASS-…)"
        className="input"
        autoFocus
      />
      <ResultCard res={res} error={error} onDismiss={() => { setRes(undefined); setError(undefined); }} />
      {pending && <p className="text-sm text-muted">Searching…</p>}
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
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
              <button onClick={() => checkIn(r.id)} disabled={pending} className="btn-primary px-3 py-1.5">Check in</button>
            )}
          </li>
        ))}
        {q.trim().length >= 2 && !pending && rows.length === 0 && <li className="p-3 text-sm text-muted">No match.</li>}
      </ul>
    </div>
  );
}

function DoorTab({ eventId, defaultPounds, onCounts }: { eventId: string; defaultPounds: string; onCounts: (c: Counts) => void }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const [source, setSource] = useState<TicketSource>("walk_in");
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (fd: FormData) =>
    start(async () => {
      const out = await createDoorTicketAction(eventId, {
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        pounds: source === "comp" ? "0" : String(fd.get("pounds") ?? "0"),
        source,
        checkIn: fd.get("check_in") === "on",
        notes: String(fd.get("notes") ?? ""),
      });
      if (out.counts) onCounts(out.counts);
      setMsg(out);
      if (out.ok) formRef.current?.reset();
    });

  return (
    <form ref={formRef} action={submit} className="card space-y-3">
      <p className="text-sm text-muted">
        For people paying at the door. Only submit once you&apos;ve <strong>seen the transfer land</strong> (or taken cash).
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
          <label className="label" htmlFor="pounds">Amount paid (£)</label>
          <input id="pounds" name="pounds" inputMode="decimal" defaultValue={defaultPounds} className="input" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="notes">Note (optional)</label>
        <input id="notes" name="notes" placeholder="e.g. paid via FPS, ref from banking app" className="input" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="check_in" defaultChecked /> Check them in now
      </label>
      {msg.ok && <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">{msg.ok}</p>}
      {msg.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{msg.error}</p>}
      <button disabled={pending} className="btn-primary w-full">{pending ? "Saving…" : "Add confirmed ticket"}</button>
    </form>
  );
}
