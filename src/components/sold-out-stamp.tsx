/**
 * A tilted red rubber stamp laid over the ticket prices when an event is
 * marked Sold out. The SVG filter roughens only the ink (border and words) so
 * it reads as a real stamp; the paper behind it stays solid so the prices
 * underneath don't show through. Decorative: the text below says the same.
 */
export function SoldOutStamp() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <svg width="0" height="0" className="absolute">
        <filter id="sold-out-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 1.3" result="speckle" />
          <feComposite in="SourceGraphic" in2="speckle" operator="in" />
        </filter>
      </svg>
      <div className="relative animate-stamp">
        <div className="absolute inset-0 rounded-xl bg-surface/75 shadow-[var(--shadow-soft)]" />
        <div className="relative rounded-xl border-[5px] border-double border-brand px-4 py-1.5 text-brand sm:px-6 sm:py-2" style={{ filter: "url(#sold-out-ink)" }}>
          <p className="whitespace-nowrap text-center text-[2rem] font-black sm:text-[2.6rem] leading-none tracking-[0.12em] uppercase">Sold out</p>
          <p className="mt-1 whitespace-nowrap text-center text-[9px] font-bold tracking-[0.4em] sm:text-[10px] uppercase">· SASS · Admit none ·</p>
        </div>
      </div>
    </div>
  );
}
