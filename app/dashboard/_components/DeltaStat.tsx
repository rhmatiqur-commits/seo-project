export interface DeltaStatProps {
  label: string;
  value: string;
  delta?: { text: string; tone: "up" | "down" | "flat" };
  deltaSuffix?: string;
  /** A plain, uncoloured secondary line — used for metrics like average
   * position where a raw "previously X" is more honest than a coloured
   * up/down (a lower number is better, so a plain green/red arrow would
   * need its own inverted-tone logic; simpler and clearer to just state
   * the previous value). */
  secondary?: string;
}

/**
 * Phase 7.1F: the one stat-card-with-a-period-over-period-delta shape,
 * shared by Home and Reports so both render the exact same 28-day
 * comparison the exact same way — previously Reports had its own inline
 * markup for this and Home didn't show a delta at all.
 */
export function DeltaStat({ label, value, delta, deltaSuffix, secondary }: DeltaStatProps) {
  return (
    <div className="dash-card stat">
      <div className="dash-stat-label">{label}</div>
      <div className="dash-stat-value">{value}</div>
      {delta && (
        <div className={`dash-stat-delta ${delta.tone}`}>
          {delta.text}
          {deltaSuffix ? ` ${deltaSuffix}` : ""}
        </div>
      )}
      {secondary && (
        <div className="dash-muted" style={{ fontSize: "0.82rem" }}>
          {secondary}
        </div>
      )}
    </div>
  );
}
