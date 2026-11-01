"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { createClient } from "@/lib/supabase/browser";
import { formatTime } from "@/lib/format";

// Jagged edge for torn paper: alternating teeth along the top of an element.
const TEETH = 28;
const TORN_EDGE = `polygon(${[
  ...Array.from({ length: TEETH + 1 }, (_, i) => `${(i * 100) / TEETH}% ${i % 2 ? 0 : 7}px`),
  "100% 100%",
  "0 100%",
].join(", ")})`;

type Phase = "live" | "tug" | "torn" | "used";

/**
 * Lower half of the ticket. Watches the ticket while the page is open:
 * - waiting for payment → refreshes when Finance confirms, so the QR appears by itself;
 * - QR showing → when the door scan lands, the stub tears off along the perforation.
 * Asks Supabase directly (not our server), only while the screen is visible.
 */
export function LiveTicket({
  ticketId,
  status,
  checkedInAt,
  qr,
  payment,
  details,
  art,
}: {
  ticketId: string;
  status: "awaiting_payment" | "confirmed";
  checkedInAt: string | null;
  qr: React.ReactNode;
  payment: React.ReactNode;
  details: React.ReactNode;
  art: React.ReactNode;
}) {
  const router = useRouter();
  const [checkedAt, setCheckedAt] = useState(checkedInAt);
  const [phase, setPhase] = useState<Phase>(checkedInAt ? "used" : "live");
  const [animatedIn, setAnimatedIn] = useState(false);
  const watching = !checkedAt && (status === "confirmed" || status === "awaiting_payment");
  const busy = useRef(false);

  const poll = useCallback(async () => {
    if (busy.current || document.visibilityState !== "visible") return;
    busy.current = true;
    try {
      const { data } = await createClient()
        .from("tickets")
        .select("status, checked_in_at")
        .eq("id", ticketId)
        .maybeSingle<{ status: string; checked_in_at: string | null }>();
      if (!data) return;
      if (data.checked_in_at && status === "confirmed") {
        setCheckedAt(data.checked_in_at);
        setPhase("tug");
      } else if (data.status !== status) {
        router.refresh(); // paid → QR appears; cancelled → page shows it
      }
    } catch {
      // Offline or flaky venue Wi-Fi: try again on the next tick.
    } finally {
      busy.current = false;
    }
  }, [ticketId, status, router]);

  useEffect(() => {
    if (!watching) return;
    const every = status === "confirmed" ? 2500 : 15000;
    const timer = setInterval(poll, every);
    const onVisible = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [watching, status, poll]);

  // After a short tug, let the stub go.
  useEffect(() => {
    if (phase !== "tug") return;
    const t = setTimeout(() => setPhase("torn"), 360);
    return () => clearTimeout(t);
  }, [phase]);

  if (status === "awaiting_payment" && !checkedAt) {
    return <Stub>{payment}{details}</Stub>;
  }

  return (
    <AnimatePresence
      mode="wait"
      onExitComplete={() => {
        setPhase("used");
        setAnimatedIn(true);
        navigator.vibrate?.(40);
        router.refresh(); // status badge etc. catch up
      }}
    >
      {phase === "live" || phase === "tug" ? (
        <motion.div
          key="stub"
          style={{ transformOrigin: "0% 0%", clipPath: phase === "tug" ? TORN_EDGE : undefined }}
          animate={phase === "tug" ? { x: [0, -3, 3, -2, 0], rotate: [0, -0.8, 0.8, -0.4, 0] } : { x: 0, rotate: 0 }}
          transition={{ duration: 0.34, ease: "easeInOut" }}
          exit={{ y: 260, x: 40, rotate: 14, opacity: 0, transition: { duration: 0.8, ease: [0.55, 0, 0.85, 0.35] } }}
        >
          <Stub>{qr}{details}</Stub>
        </motion.div>
      ) : (
        <motion.div
          key="used"
          initial={animatedIn || phase === "torn" ? { opacity: 0, y: -16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          style={{ clipPath: TORN_EDGE }}
        >
          <Stub torn>
            <div className="py-4 text-center">
              {art}
              <p className="mt-4 font-medium">Checked in{checkedAt ? ` at ${formatTime(checkedAt)}` : ""}</p>
              <p className="text-sm text-muted">Enjoy the night!</p>
            </div>
            {details}
          </Stub>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stub({ children, torn }: { children: React.ReactNode; torn?: boolean }) {
  return <div className={`rounded-b-[28px] bg-surface px-6 pb-6 ${torn ? "pt-9" : "pt-7"}`}>{children}</div>;
}
