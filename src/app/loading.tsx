// Shown instantly while a page's data loads, so navigation never feels stuck.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-9 w-2/3 max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card space-y-3">
            <div className="skeleton aspect-[16/9] w-full" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
