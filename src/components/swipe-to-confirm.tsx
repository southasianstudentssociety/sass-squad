"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { ChevronsRight, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const HANDLE = 56;
const PAD = 4;

/**
 * "Slide to answer"-style confirmation. Drag the handle all the way right to confirm;
 * letting go early springs it back, so a stray tap can't trigger it.
 * Keyboard: focus the handle and press Enter or →.
 * onConfirm may return false (or throw) to spring back, e.g. if a form is invalid.
 */
export function SwipeToConfirm({
  label,
  onConfirm,
  disabled = false,
  variant = "onColor",
}: {
  label: string;
  onConfirm: () => Promise<boolean | void> | boolean | void;
  disabled?: boolean;
  /** onColor: white track on a coloured card. plain: brand-coloured track on a white card. */
  variant?: "onColor" | "plain";
}) {
  const track = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(0);
  const [state, setState] = useState<"idle" | "confirming">("idle");
  const x = useMotionValue(0);
  const labelOpacity = useTransform(x, [0, Math.max(1, max * 0.55)], [1, 0]);
  const fill = useTransform(x, (v) => v + HANDLE + PAD);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setMax(Math.max(0, el.clientWidth - HANDLE - PAD * 2));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function confirm() {
    if (state !== "idle" || disabled) return;
    setState("confirming");
    await animate(x, max, { type: "spring", stiffness: 500, damping: 40 });
    navigator.vibrate?.(30);
    let ok: boolean | void = true;
    try {
      ok = await onConfirm();
    } catch {
      ok = false;
    }
    if (ok === false) {
      setState("idle");
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }

  const onColor = variant === "onColor";
  return (
    <div
      ref={track}
      className={cn(
        "relative h-16 w-full touch-pan-y overflow-hidden rounded-full select-none",
        onColor ? "bg-white/20 ring-1 ring-white/30" : "bg-brand-soft ring-1 ring-brand/15",
        disabled && "opacity-50",
      )}
    >
      <motion.div
        aria-hidden
        className={cn("absolute inset-y-0 left-0 rounded-full", onColor ? "bg-white/25" : "bg-brand/15")}
        style={{ width: fill }}
      />
      <motion.span
        aria-hidden
        style={{ opacity: labelOpacity }}
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center pl-12 text-[15px] font-semibold tracking-wide",
          onColor ? "text-white" : "text-brand",
        )}
      >
        {/* Shimmer: explicit colours, because the text itself is transparent so the gradient can show through. */}
        <span
          className="bg-[length:250%_100%] bg-clip-text text-transparent [animation:shimmer_2.4s_linear_infinite]"
          style={{
            backgroundImage: onColor
              ? "linear-gradient(90deg, rgb(255 255 255 / 0.8) 40%, #fff 50%, rgb(255 255 255 / 0.8) 60%)"
              : "linear-gradient(90deg, var(--brand) 40%, color-mix(in oklab, var(--brand) 45%, white) 50%, var(--brand) 60%)",
          }}
        >
          {label}
        </span>
      </motion.span>
      <motion.button
        type="button"
        aria-label={`${label} (or press Enter)`}
        disabled={disabled || state === "confirming"}
        drag={state === "idle" && !disabled ? "x" : false}
        dragConstraints={{ left: 0, right: max }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, width: HANDLE, height: HANDLE, top: PAD, left: PAD }}
        onDragEnd={() => {
          if (x.get() >= max * 0.85) confirm();
          else animate(x, 0, { type: "spring", stiffness: 500, damping: 35 });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "ArrowRight") {
            e.preventDefault();
            confirm();
          }
        }}
        whileTap={{ scale: 0.96 }}
        className={cn(
          "absolute flex cursor-grab items-center justify-center rounded-full shadow-[0_2px_8px_rgb(0_0_0/0.18)] outline-none active:cursor-grabbing",
          onColor ? "bg-white text-ok" : "bg-brand text-white",
          "focus-visible:ring-4 focus-visible:ring-white/60",
        )}
      >
        {state === "confirming" ? <LoaderCircle className="size-6 animate-spin" /> : <ChevronsRight className="size-7" />}
      </motion.button>
    </div>
  );
}
