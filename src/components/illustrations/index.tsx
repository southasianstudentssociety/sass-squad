import { ILLUSTRATIONS, type IllustrationName } from "./data";

/**
 * Decorative unDraw illustration. Static SVG from our own repo (not user input),
 * so inlining it is safe. Colour the accent with a text-* class (default: SASS red).
 */
export function Illustration({ name, className = "" }: { name: IllustrationName; className?: string }) {
  return (
    <div
      aria-hidden
      className={`illustration pointer-events-none select-none text-brand ${className}`}
      dangerouslySetInnerHTML={{ __html: ILLUSTRATIONS[name] }}
    />
  );
}

/** Calm empty state: illustration, a line of text, optional action. */
export function EmptyState({
  illustration,
  title,
  children,
  action,
}: {
  illustration: IllustrationName;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex animate-fade-up flex-col items-center px-6 py-12 text-center">
      <Illustration name={illustration} className="mb-6 w-40 opacity-90 sm:w-48" />
      <p className="text-base font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
