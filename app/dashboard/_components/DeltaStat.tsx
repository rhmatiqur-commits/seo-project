import type { DeltaResult } from "@/lib/dashboard/delta";

export interface DeltaStatProps {
  label: string;
  value: string;
  /** Omit when there's nothing meaningful to compare against (see `helper`). */
  delta?: DeltaResult;
  /** A plain-text secondary line used instead of a delta chip — e.g.
   * average position, which Reports has always shown as "previously X"
   * rather than a coloured up/down chip (a numeric decrease is an
   * improvement for position, the opposite of clicks/impressions/CTR, so
   * this avoids a second, inverted delta convention). */
  helper?: string;
}

/** The stat-tile + period-over-period delta pattern Reports originated —
 * generalised into one component so Home and Reports render it identically
 * instead of each hand-rolling the same markup. */
export function DeltaStat({ label, value, delta, helper }: DeltaStatProps) {
  return (
    <div className="dash-card stat">
      <div className="dash-stat-label">{label}</div>
      <div className="dash-stat-value">{value}</div>
      {delta && <div className={`dash-stat-delta ${delta.tone}`}>{delta.text} vs previous period</div>}
      {!delta && helper && (
        <div className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 4 }}>
          {helper}
        </div>
      )}
    </div>
  );
}
