export interface TrendChartPoint {
  date: string;
  value: number;
}

export interface TrendChartProps {
  points: TrendChartPoint[];
  /** CSS custom property reference, e.g. "var(--dash-primary)". */
  color: string;
  /** Accessible label — what the line represents. */
  label: string;
  /** For metrics where a lower number is better (e.g. average position) —
   * flips which end of the scale renders near the top, so "better" still
   * reads as "higher on the chart" the same way it does for every other
   * metric, instead of a falling ranking looking like a rising line. */
  invert?: boolean;
}

/**
 * Phase 7.2I: a small, dependency-free inline-SVG line chart — no charting
 * library, consistent with this app's existing zero-dependency approach
 * (see lib/publishing/markdown.ts, lib/crawler/*). Renders a filled area
 * under the line, a faint zero baseline, and an emphasized endpoint dot on
 * the most recent value, so a flat-zero series (real, expected for a new or
 * low-traffic page) still reads as "a real chart with no activity yet"
 * rather than a blank box that looks broken.
 *
 * Pure presentation: takes an already-aggregated daily series
 * (lib/dashboard/delta.ts's buildDailySearchConsoleSeries) — no data
 * fetching, no new query.
 */
export function TrendChart({ points, color, label, invert }: TrendChartProps) {
  const width = 600;
  const height = 120;
  const padding = 8;
  const max = Math.max(1, ...points.map((p) => p.value));

  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const toXY = (i: number, value: number) => {
    const x = padding + i * stepX;
    const fraction = (value / max) * (height - padding * 2);
    const y = invert ? padding + fraction : height - padding - fraction;
    return [x, y] as const;
  };

  const linePoints = points.map((p, i) => toXY(i, p.value));
  const linePath = linePoints.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaPath =
    linePoints.length > 0
      ? `${linePath} L ${linePoints[linePoints.length - 1]![0].toFixed(1)} ${(height - padding).toFixed(1)} L ${linePoints[0]![0].toFixed(1)} ${(height - padding).toFixed(1)} Z`
      : "";

  const last = points[points.length - 1];
  const lastXY = linePoints[linePoints.length - 1];

  const gradientId = `trend-fill-${label.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label} over the last ${points.length} days, ending at ${last?.value ?? 0}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--dash-border)" strokeWidth="1" />
      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
      {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="1.75" />}
      {lastXY && <circle cx={lastXY[0]} cy={lastXY[1]} r="3" fill={color} />}
    </svg>
  );
}
