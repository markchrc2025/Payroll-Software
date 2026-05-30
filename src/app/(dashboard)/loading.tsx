export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 w-full animate-pulse">
      {/* Page title skeleton */}
      <div className="h-8 w-48 rounded-lg bg-[var(--line)]" />

      {/* Toolbar skeleton */}
      <div className="flex gap-3">
        <div className="h-9 flex-1 max-w-sm rounded-lg bg-[var(--line)]" />
        <div className="h-9 w-24 rounded-lg bg-[var(--line)]" />
        <div className="h-9 w-24 rounded-lg bg-[var(--line)]" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-[var(--line)] bg-white overflow-hidden">
        {/* Header row */}
        <div className="flex gap-4 px-4 py-3 border-b border-[var(--line)] bg-[var(--canvas)]">
          {[120, 180, 140, 120, 100, 110].map((w, i) => (
            <div key={i} className="h-4 rounded bg-[var(--line)]" style={{ width: w }} />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="flex gap-4 px-4 py-3 border-b border-[var(--line)] last:border-0">
            {[120, 180, 140, 120, 100, 110].map((w, i) => (
              <div key={i} className="h-4 rounded bg-[var(--line)]" style={{ width: w * (0.6 + Math.random() * 0.4) }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
