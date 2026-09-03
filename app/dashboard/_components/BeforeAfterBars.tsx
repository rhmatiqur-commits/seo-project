export interface BeforeAfterBarsProps {
  baseline: number;
  current: number;
  /** CSS custom property reference, e.g. "var(--dash-primary)". */
  color: string;
  /** What this is measuring — used only for the accessible label. */
  label: string;
}

/**
 * Phase 7.2I: a small, dependency-free inline-SVG two-bar comparison —
 * baseline (faded) vs. current (solid) — for the Outcomes page, where each
 * action has exactly two data points (a baseline window and one measurement
 * window), not a daily series like Reports/Home's TrendChart. Purely
 * presentational: takes numbers the page already computed (baseline_metrics
 * / current_metrics off the outcome row) and pairs with the existing
 * "X → Y" text line rather than replacing it, so the exact figures stay
 * visible alongside the shape of the change.
 */
export function BeforeAfterBars({ baseline, current, color, label }: BeforeAfterBarsProps) {
  const width = 120;
  const height = 56;
  const barTop = 4;
  const barBottom = 44;
  const barWidth = 36;
  const gap = 20;
  const max = Math.max(1, baseline, current);

  const baselineHeight = (baseline / max) * (barBottom - barTop);
  const currentHeight = (current / max) * (barBottom - barTop);
  const baselineX = width / 2 - gap / 2 - barWidth;
  const currentX = width / 2 + gap / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}: ${baseline} before, ${current} now`}
      style={{ width: "100%", maxWidth: 120, height: "auto", display: "block" }}
    >
      <line x1="0" y1={barBottom} x2={width} y2={barBottom} stroke="var(--dash-border)" strokeWidth="1" />
      <rect x={baselineX} y={barBottom - baselineHeight} width={barWidth} height={Math.max(baselineHeight, 1)} fill={color} opacity="0.35" rx="2" />
      <rect x={currentX} y={barBottom - currentHeight} width={barWidth} height={Math.max(currentHeight, 1)} fill={color} rx="2" />
      <text x={baselineX + barWidth / 2} y={height - 4} textAnchor="middle" fontSize="9" fill="var(--dash-text-muted)">
        Before
      </text>
      <text x={currentX + barWidth / 2} y={height - 4} textAnchor="middle" fontSize="9" fill="var(--dash-text-muted)">
        Now
      </text>
    </svg>
  );
}
