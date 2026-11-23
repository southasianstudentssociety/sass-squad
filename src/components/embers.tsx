import { cn } from "@/lib/utils";

// Fixed positions (not random) so the server and browser render the same thing.
const EMBERS = [
  { l: 6, d: 0, t: 6.5, s: 4, x: 14 },
  { l: 14, d: 2.8, t: 7.5, s: 3, x: -10 },
  { l: 23, d: 1.2, t: 6, s: 5, x: 18 },
  { l: 31, d: 4.1, t: 8, s: 3, x: -6 },
  { l: 40, d: 0.6, t: 7, s: 4, x: 10 },
  { l: 48, d: 3.3, t: 6.8, s: 3, x: -16 },
  { l: 57, d: 1.9, t: 7.8, s: 5, x: 8 },
  { l: 65, d: 5, t: 6.2, s: 3, x: -12 },
  { l: 73, d: 0.3, t: 7.4, s: 4, x: 16 },
  { l: 81, d: 2.2, t: 6.6, s: 3, x: -8 },
  { l: 89, d: 3.9, t: 8.2, s: 5, x: 12 },
  { l: 95, d: 1.5, t: 7, s: 3, x: -14 },
];

/** Little glowing sparks drifting up from the bottom of their (relative, overflow-hidden) parent. Still for reduced motion. */
export function Embers({ className, count = EMBERS.length }: { className?: string; count?: number }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden", className)} aria-hidden>
      {EMBERS.slice(0, count).map((e, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full bg-sass-yellow shadow-[0_0_8px_2px_rgb(255_200_80/0.7)]"
          style={{
            left: `${e.l}%`,
            width: e.s,
            height: e.s,
            animation: `ember-rise ${e.t}s ease-out ${e.d}s infinite both`,
            ["--ember-drift" as string]: `${e.x}px`,
          }}
        />
      ))}
    </div>
  );
}
