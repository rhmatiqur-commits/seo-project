/**
 * Static skeleton pieces for loading.tsx boundaries. Deliberately plain
 * (grey blocks, no shimmer sweep) — the audit's own guidance was "avoid
 * excessive animation"; the pulse defined in dashboard.css already
 * respects prefers-reduced-motion on its own.
 */
export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="dash-grid dash-grid-cols-4" style={{ marginBottom: 24 }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="dash-skel dash-skel-stat" />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return <div className="dash-skel dash-skel-card" style={{ marginBottom: 20, borderRadius: "var(--dash-radius)" }} aria-hidden="true" />;
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="dash-card" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="dash-skel dash-skel-row" style={{ width: `${88 - i * 6}%` }} />
      ))}
    </div>
  );
}

/** A generic full-page skeleton — stat row + a card + a table — used as the
 * shared loading.tsx fallback since every dashboard route is
 * force-dynamic and none had any loading state before this. */
export function DashboardPageSkeleton() {
  return (
    <div>
      <div className="dash-skel dash-skel-row" style={{ width: "40%", height: 26, marginBottom: 8 }} />
      <div className="dash-skel dash-skel-row" style={{ width: "60%", height: 14, marginBottom: 24 }} />
      <SkeletonStatRow />
      <SkeletonCard />
      <SkeletonTable />
    </div>
  );
}
