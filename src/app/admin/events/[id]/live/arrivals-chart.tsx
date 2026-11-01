import { formatTime } from "@/lib/format";

/**
 * Check-ins per time bucket. Single series in SASS red, so no legend: the card title names it.
 * Bars sit on the baseline with 4px rounded tops and 2px gaps; each column is a hover/focus
 * target taller than its bar, with a tooltip. A hidden table carries the same numbers for
 * screen readers.
 */
export function ArrivalsChart({ buckets, minutes }: { buckets: { start: number; count: number }[]; minutes: number }) {
  if (buckets.length === 0) return <p className="py-10 text-center text-sm text-muted">The chart starts with the first check-in.</p>;
  const peak = Math.max(1, ...buckets.map((b) => b.count));
  const at = (ms: number) => formatTime(new Date(ms).toISOString());
  return (
    <>

                <div className="mt-2 flex h-48 items-end gap-[2px] border-b border-line pt-9" role="img" aria-label={`Arrivals per ${minutes} minutes. Peak ${peak}.`}>
                  {buckets.map((b) => (
                    <div key={b.start} className="group relative flex h-full flex-1 items-end" tabIndex={0} aria-label={`${at(b.start)}: ${b.count}`}>
                      <div
                        className="w-full rounded-t-[4px] bg-brand transition-[height] duration-500 group-hover:bg-brand-deep"
                        style={{ height: `${(b.count / peak) * 100}%`, minHeight: b.count ? 2 : 0 }}
                      />
                      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                        {at(b.start)} · {b.count}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-muted">
                  <span>{at(buckets[0].start)}</span>
                  <span>peak {peak}</span>
                  <span>{at(buckets[buckets.length - 1].start)}</span>
                </div>
                <table className="sr-only">
                  <caption>Arrivals per {minutes} minutes</caption>
                  <thead><tr><th>From</th><th>Check-ins</th></tr></thead>
                  <tbody>{buckets.map((b) => <tr key={b.start}><td>{at(b.start)}</td><td>{b.count}</td></tr>)}</tbody>
                </table>
                  </>
  );
}
