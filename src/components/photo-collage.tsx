"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { id: string; src: string; alt: string };

// Column count follows the screen: 2 on phones, 3 on tablets, 4 on laptops.
const QUERIES = ["(min-width: 1024px)", "(min-width: 640px)"] as const;
function subscribe(cb: () => void) {
  const lists = QUERIES.map((q) => window.matchMedia(q));
  lists.forEach((l) => l.addEventListener("change", cb));
  return () => lists.forEach((l) => l.removeEventListener("change", cb));
}
const columnCount = () => (window.matchMedia(QUERIES[0]).matches ? 4 : window.matchMedia(QUERIES[1]).matches ? 3 : 2);

// How far each column drifts while the collage scrolls past, so the columns
// slide against each other. Outer columns move less than inner ones.
const DRIFT = [40, 110, 70, 130];
// Each photo lands at a slight tilt and straightens out, like prints tossed on a table.
const TILT = [-3, 2, -1.5, 3, -2.5, 1.5, -1, 2.5];

/**
 * A big masonry collage for an album page. Photos keep their own shape, fade
 * and straighten into place as they scroll in, and the columns drift at
 * different speeds. Tap a photo to open it full screen and swipe through.
 */
export function PhotoCollage({ items, label }: { items: Item[]; label: string }) {
  const cols = useSyncExternalStore(subscribe, columnCount, () => 2);
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const amp = reduce ? 0 : 1;
  const y0 = useTransform(scrollYProgress, [0, 1], [DRIFT[0] * amp, -DRIFT[0] * amp]);
  const y1 = useTransform(scrollYProgress, [0, 1], [DRIFT[1] * amp, -DRIFT[1] * amp]);
  const y2 = useTransform(scrollYProgress, [0, 1], [DRIFT[2] * amp, -DRIFT[2] * amp]);
  const y3 = useTransform(scrollYProgress, [0, 1], [DRIFT[3] * amp, -DRIFT[3] * amp]);
  const ys: MotionValue<number>[] = [y0, y1, y2, y3];

  const [open, setOpen] = useState<number | null>(null);

  // Deal photos into columns left to right, so the first ones you picked sit at the top.
  const columns: { item: Item; index: number }[][] = Array.from({ length: cols }, () => []);
  items.forEach((item, index) => columns[index % cols].push({ item, index }));

  return (
    <>
      <div ref={ref} className="flex items-start gap-2.5 pt-10 pb-20 sm:gap-4 sm:pt-12 sm:pb-28" role="list" aria-label={label}>
        {columns.map((col, c) => (
          <motion.div key={c} className="flex min-w-0 flex-1 flex-col gap-2.5 sm:gap-4" style={{ y: ys[c] }}>
            {col.map(({ item, index }) => (
              <motion.button
                key={item.id}
                type="button"
                role="listitem"
                onClick={() => setOpen(index)}
                className="group relative block w-full cursor-zoom-in overflow-hidden rounded-2xl bg-line shadow-[var(--shadow-lift)] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                initial={reduce ? false : { opacity: 0, y: 48, rotate: TILT[index % TILT.length], scale: 0.94 }}
                whileInView={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                viewport={{ once: true, margin: "0px 0px -8% 0px" }}
                transition={{ type: "spring", stiffness: 90, damping: 18, mass: 0.9 }}
                whileHover={reduce ? undefined : { y: -4, rotate: index % 2 ? 0.8 : -0.8 }}
                aria-label={`Open photo ${index + 1} of ${items.length}`}
              >
                {/* Public Storage URLs, already resized on upload. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.src}
                  alt={item.alt}
                  loading={index < cols * 2 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                  className="block min-h-32 w-full object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
                />
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#24112b]/45 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden />
              </motion.button>
            ))}
          </motion.div>
        ))}
      </div>
      <Lightbox items={items} index={open} onIndex={setOpen} />
    </>
  );
}

function Lightbox({ items, index, onIndex }: { items: Item[]; index: number | null; onIndex: (i: number | null) => void }) {
  const [dir, setDir] = useState(1);
  const go = useCallback(
    (step: 1 | -1) => {
      if (index === null) return;
      setDir(step);
      onIndex((index + step + items.length) % items.length);
    },
    [index, items.length, onIndex],
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  const item = index === null ? null : items[index];
  const neighbours = index === null ? [] : [items[(index + 1) % items.length], items[(index - 1 + items.length) % items.length]];

  return (
    <Dialog.Root open={index !== null} onOpenChange={(o) => !o && onIndex(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-[#0e0810]/92 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-0 z-50 flex flex-col outline-none transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
          <Dialog.Title className="sr-only">Photo {index !== null ? index + 1 : ""} of {items.length}</Dialog.Title>
          <div className="flex items-center justify-between px-4 py-3 text-sm text-white/70 sm:px-6">
            <span className="tabular-nums">{index !== null ? index + 1 : ""} / {items.length}</span>
            <Dialog.Close className="rounded-lg p-2 text-white/70 outline-none hover:bg-white/10 hover:text-white" aria-label="Close">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 pb-6 sm:px-16">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              {item && (
                <motion.img
                  key={item.id}
                  src={item.src}
                  alt={item.alt}
                  custom={dir}
                  variants={{
                    enter: (d: number) => ({ opacity: 0, x: d * 80, scale: 0.96 }),
                    center: { opacity: 1, x: 0, scale: 1 },
                    exit: (d: number) => ({ opacity: 0, x: d * -80, scale: 0.96 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.6}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -60 || info.velocity.x < -400) go(1);
                    else if (info.offset.x > 60 || info.velocity.x > 400) go(-1);
                  }}
                  draggable={false}
                  className="max-h-full max-w-full touch-pan-y select-none rounded-xl object-contain shadow-2xl"
                />
              )}
            </AnimatePresence>

            {items.length > 1 && (
              <>
                <NavButton side="left" onClick={() => go(-1)} />
                <NavButton side="right" onClick={() => go(1)} />
              </>
            )}
          </div>

          {/* Warm the next and previous photos so swiping feels instant. */}
          <div className="hidden" aria-hidden>
            {neighbours.map((n) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={n.id} src={n.src} alt="" />
            ))}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur transition hover:bg-white/20 active:scale-95 sm:block",
        side === "left" ? "left-3" : "right-3",
      )}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
