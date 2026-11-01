"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitFeedback } from "./feedback-actions";

const WORDS = ["", "Not great", "Okay", "Good", "Great", "Loved it"];

export function FeedbackForm({ eventId, initial }: { eventId: string; initial: { rating: number; comment: string | null; anonymous: boolean } | null }) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [saved, setSaved] = useState(!!initial);
  const [editing, setEditing] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = hover || rating;

  function submit(fd: FormData) {
    fd.set("rating", String(rating));
    setError(null);
    start(async () => {
      const res = await submitFeedback(fd);
      if (res.error) setError(res.error);
      else { setSaved(true); setEditing(false); }
    });
  }

  return (
    <div className="card space-y-4 p-5">
      <AnimatePresence mode="wait" initial={false}>
        {!editing ? (
          <motion.div key="thanks" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{saved ? "Thanks for the feedback!" : "How was it?"}</p>
              <p className="text-sm text-muted">You rated it {rating}/5{initial?.anonymous ? " (anonymously)" : ""}.</p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="btn-ghost px-3 py-1.5 text-xs">Change</button>
          </motion.div>
        ) : (
          <motion.form key="form" action={submit} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <input type="hidden" name="event_id" value={eventId} />
            <div>
              <p className="font-medium">How was it?</p>
              <p className="text-sm text-muted">ExCo reads every one of these.</p>
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
                  whileTap={{ scale: 0.85 }}
                  animate={{ scale: shown >= n ? 1.08 : 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  className="rounded-lg p-1"
                >
                  <Star className={cn("size-8 transition-colors", shown >= n ? "fill-accent text-accent" : "text-line")} strokeWidth={1.5} />
                </motion.button>
              ))}
              <span className="ml-2 text-sm text-muted">{WORDS[shown]}</span>
            </div>
            <textarea name="comment" rows={3} maxLength={1000} defaultValue={initial?.comment ?? ""} placeholder="Anything we should keep, or change next time? (optional)" className="input" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="anonymous" defaultChecked={initial?.anonymous ?? false} /> Don&apos;t show my name to ExCo</label>
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            <button className="btn-primary" disabled={!rating || pending}>{pending ? "Sending…" : "Send"}</button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
