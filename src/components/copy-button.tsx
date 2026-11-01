"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy } from "lucide-react";

/** Copies text (e.g. the FPS reference) with a small confirmation tick. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked (old browsers, insecure context); the text is still visible to copy by hand.
    }
  }
  return (
    <button type="button" onClick={copy} className="btn-ghost px-3 py-1.5 text-xs" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? "done" : "copy"}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.14 }}
          className="flex items-center gap-1.5"
        >
          {copied ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copied" : label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
