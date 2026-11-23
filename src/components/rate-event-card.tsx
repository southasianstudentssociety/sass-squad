"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitFeedback } from "@/app/tickets/[id]/feedback-actions";

const WORDS = ["", "Not great", "Okay", "Good", "Great", "Loved it"];
const EASE = [0.22, 1, 0.36, 1] as const;
const key = (eventId: string) => `sass:rate-card:${eventId}`;
const noop = () => () => {};

// Little sparks that burst out of a star when it's picked.
const BURST = [0, 60, 120, 180, 240, 300].map((deg) => ({ x: Math.cos((deg * Math.PI) / 180) * 22, y: Math.sin((deg * Math.PI) / 180) * 22 }));

/**
 * "How was <event>?" under the home banner, for people who were checked in
 * and haven't rated yet. Tap a star and it opens up for an optional comment.
 * Uses the same submit_feedback RPC as the ticket page; "Not now" hides it
 * in this browser.
 */
export function RateEventCard({ eventId, eventName, firstName }: { eventId: string; eventName: string; firstName?: string }) {
  const reduce = useReducedMotion() ?? false;
  const hiddenBefore = useSyncExternalStore(
    noop,
    () => {
      try {
        return localStorage.getItem(key(eventId)) === "1";
      } catch {
        return false;
      }
    },
    () => true, // server: render nothing
  );
  const [hidden, setHidden] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = hover || rating;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(key(eventId), "1");
    } catch {}
  };

  function submit(fd: FormData) {
    fd.set("event_id", eventId);
    fd.set("rating", String(rating));
    setError(null);
    start(async () => {
      const res = await submitFeedback(fd);
      if (res.error) setError(res.error);
      else {
        setDone(true);
        try {
          localStorage.setItem(key(eventId), "1");
        } catch {}
      }
    });
  }

  return (
    <AnimatePresence initial>
      {!hiddenBefore && !hidden && (
        <motion.section
          key="rate"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.4 }}
          className="-mx-4 sm:mx-0"
          aria-label={`Rate ${eventName}`}
        >
          <div className="relative overflow-hidden border-y border-[#3a1a3a] bg-[linear-gradient(100deg,#24112b_0%,#2e1430_55%,#4a1c38_100%)] px-5 py-5 text-white shadow-[0_18px_50px_-24px_rgb(90_31_58/0.6)] sm:rounded-3xl sm:border sm:px-8 sm:py-6">
            <div className="absolute -right-10 -bottom-16 size-56 rounded-full bg-accent/25 blur-3xl" aria-hidden />

            {!done && (
              <button
                type="button"
                onClick={dismiss}
                className="absolute top-2.5 right-2.5 z-10 rounded-full p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
                aria-label="Not now"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}

            <AnimatePresence mode="wait" initial={false}>
              {done ? (
                <motion.div
                  key="thanks"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="relative flex items-center gap-4"
                >
                  <div className="flex shrink-0 gap-0.5" aria-hidden>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={cn("size-5", n <= rating ? "fill-sass-yellow text-sass-yellow" : "text-white/20")} strokeWidth={1.5} />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Thank you{firstName ? `, ${firstName}` : ""}!</p>
                    <p className="text-sm text-white/60">ExCo reads every one of these. You can change it from your ticket.</p>
                  </div>
                  <button type="button" onClick={dismiss} className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white">Close</button>
                </motion.div>
              ) : (
                <motion.form key="form" action={submit} exit={{ opacity: 0 }} className="relative">
                  <div className="flex flex-col gap-3 pr-6 sm:flex-row sm:items-center sm:gap-6 sm:pr-8">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-sass-yellow uppercase">You were there</p>
                      <p className="mt-1 font-brand text-2xl leading-tight sm:text-[1.7rem]">How was {eventName}?</p>
                    </div>

                    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <motion.button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={rating === n}
                          aria-label={`${n} star${n > 1 ? "s" : ""}: ${WORDS[n]}`}
                          onClick={() => setRating(n)}
                          onMouseEnter={() => setHover(n)}
                          whileTap={{ scale: 0.8 }}
                          animate={{ scale: shown >= n ? 1.12 : 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 18 }}
                          className="relative rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-sass-yellow"
                        >
                          <Star
                            className={cn(
                              "size-8 transition-[color,fill,filter] duration-200 sm:size-9",
                              shown >= n ? "fill-sass-yellow text-sass-yellow drop-shadow-[0_0_10px_rgb(255_220_100/0.7)]" : "text-white/25",
                            )}
                            strokeWidth={1.5}
                          />
                          {rating === n && !reduce && (
                            <span className="pointer-events-none absolute inset-0" aria-hidden>
                              {BURST.map((b, i) => (
                                <motion.span
                                  key={`${n}-${i}`}
                                  className="absolute top-1/2 left-1/2 size-1.5 rounded-full bg-sass-yellow"
                                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                                  animate={{ x: b.x, y: b.y, opacity: 0, scale: 0.4 }}
                                  transition={{ duration: 0.55, ease: "easeOut" }}
                                />
                              ))}
                            </span>
                          )}
                        </motion.button>
                      ))}
                      <span className="ml-1 hidden w-20 text-sm text-white/60 sm:inline">{WORDS[shown]}</span>
                    </div>
                  </div>

                  {/* Opens once they've picked a rating. */}
                  <AnimatePresence initial={false}>
                    {rating > 0 && (
                      <motion.div
                        key="more"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.35, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 pt-4">
                          <textarea
                            name="comment"
                            rows={3}
                            maxLength={1000}
                            placeholder="What should we keep, or change next time? (optional)"
                            className="w-full rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-base text-white outline-none placeholder:text-white/40 focus:border-sass-yellow/60"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-sm text-white/70">
                              <input type="checkbox" name="anonymous" className="accent-sass-yellow" /> Don&apos;t show my name to ExCo
                            </label>
                            <button
                              className="rounded-xl bg-sass-yellow px-5 py-2.5 text-sm font-semibold text-[#2a1a05] transition hover:brightness-105 active:scale-[0.97] disabled:opacity-60"
                              disabled={pending}
                            >
                              {pending ? "Sending…" : "Send"}
                            </button>
                          </div>
                          {error && <p role="alert" className="text-sm text-sass-pink">{error}</p>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
