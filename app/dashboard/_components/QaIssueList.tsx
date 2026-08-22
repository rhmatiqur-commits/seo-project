import { groupQaIssuesBySeverity, type QaIssueLike } from "@/lib/dashboard/qa-issues";

const MAX_WARNINGS_SHOWN = 5;

export interface QaIssueListProps {
  issues: QaIssueLike[];
}

/**
 * Phase 7.1E: replaces the old flat, capped-at-5, severity-blind issue list
 * with two groups — what's actually blocking approval, and what's merely
 * worth a look. QaIssue.severity already existed (lib/content/qa/compute-
 * result.ts) but nothing rendered it before this.
 */
export function QaIssueList({ issues }: QaIssueListProps) {
  const { blocking, warnings } = groupQaIssuesBySeverity(issues);
  if (blocking.length === 0 && warnings.length === 0) return null;
  const shownWarnings = warnings.slice(0, MAX_WARNINGS_SHOWN);
  const hiddenWarningCount = warnings.length - shownWarnings.length;

  return (
    <div>
      {blocking.length > 0 && (
        <div style={{ marginBottom: warnings.length > 0 ? 10 : 0 }}>
          <div className="dash-muted" style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 4 }}>
            Needs to change before this can be approved
          </div>
          {blocking.map((issue, i) => (
            <div key={i} style={{ fontSize: "0.85rem" }}>
              &bull; {issue.message}
            </div>
          ))}
        </div>
      )}
      {shownWarnings.length > 0 && (
        <div>
          <div className="dash-muted" style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 4 }}>
            Worth a look
          </div>
          {shownWarnings.map((issue, i) => (
            <div key={i} className="dash-muted" style={{ fontSize: "0.85rem" }}>
              &bull; {issue.message}
            </div>
          ))}
          {hiddenWarningCount > 0 && (
            <div className="dash-muted" style={{ fontSize: "0.8rem", marginTop: 2 }}>
              +{hiddenWarningCount} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
