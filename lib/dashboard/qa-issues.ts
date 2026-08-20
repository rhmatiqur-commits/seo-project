/**
 * Phase 7.1E: groups a content_qa_results row's `issues` array by severity
 * so blocking problems (the ones actually gating approval) are visually
 * distinct from non-blocking warnings — QaIssue.severity already exists
 * (lib/content/qa/compute-result.ts) but was previously unused; every issue
 * was shown as one flat, capped list regardless of severity.
 */
export interface QaIssueLike {
  severity: string;
  message: string;
}

export interface GroupedQaIssues<T extends QaIssueLike> {
  blocking: T[];
  warnings: T[];
}

export function groupQaIssuesBySeverity<T extends QaIssueLike>(issues: readonly T[]): GroupedQaIssues<T> {
  return {
    blocking: issues.filter((i) => i.severity === "blocking"),
    warnings: issues.filter((i) => i.severity !== "blocking"),
  };
}
