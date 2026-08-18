import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** What's empty. */
  title: string;
  /** Why it's empty and/or what happens next — kept honest to what the
   * backend actually does; never invents an action that isn't real. */
  description?: string;
  /** An existing, real action/link — omit rather than invent one. */
  action?: ReactNode;
}

/**
 * Replaces the old bare `<p className="dash-empty">No data available.</p>`
 * pattern used across the dashboard. Same information, same lack of
 * invented functionality — just answers what/why/what's-next instead of a
 * single flat sentence, with a small mark instead of nothing.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="dash-empty-state">
      <div className="mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2 7.5h14" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="cta">{action}</div>}
    </div>
  );
}
