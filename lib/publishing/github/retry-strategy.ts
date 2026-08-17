import { GITHUB_BRANCH_PREFIX } from "@/lib/publishing/limits";

/**
 * The GitHub-flow equivalent of lib/publishing/retry-strategy.ts's
 * decidePublishAction — "before retrying, determine whether the branch/
 * commit/PR was already created" (per spec: "this is extremely important...
 * the same approved content version should not produce duplicate pages").
 * Pure and unit-tested; the job handler gathers the inputs (what our own
 * content_publications row already knows, what a live GitHub lookup found)
 * and these functions decide what to do — no network, no DB, no GitHub
 * client dependency.
 */

/** Deterministic per-content-version branch name — a retry after a timeout
 * always computes the SAME name, so "does this already exist on GitHub" is
 * a meaningful, stable check rather than guessing at a randomly-suffixed
 * name from a prior attempt. */
export function computeBranchName(contentVersionId: string): string {
  return `${GITHUB_BRANCH_PREFIX}/${contentVersionId}`;
}

export type ResourceAction = "USE_KNOWN" | "ADOPT_EXISTING" | "CREATE_NEW";

export interface DecideBranchActionInput {
  /** branch_name already recorded on our own content_publications row, from a prior attempt in this same lineage. */
  knownBranchName: string | null;
  /** Whether a live GitHub lookup found a branch at the deterministic candidate name (see computeBranchName). */
  branchExistsOnGitHub: boolean;
}

export function decideBranchAction(input: DecideBranchActionInput): ResourceAction {
  if (input.knownBranchName) return "USE_KNOWN";
  if (input.branchExistsOnGitHub) return "ADOPT_EXISTING";
  return "CREATE_NEW";
}

export interface DecidePullRequestActionInput {
  /** pull_request_number already recorded on our own content_publications row. */
  knownPullRequestNumber: number | null;
  /** Result of GitHubClient.findPullRequestsForBranch for our branch, if any. */
  existingPullRequestForBranch: { number: number } | null;
}

export function decidePullRequestAction(input: DecidePullRequestActionInput): ResourceAction {
  if (input.knownPullRequestNumber) return "USE_KNOWN";
  if (input.existingPullRequestForBranch) return "ADOPT_EXISTING";
  return "CREATE_NEW";
}

export type MergeAction = "ALREADY_MERGED" | "SAFE_TO_MERGE" | "NOT_YET_MERGEABLE" | "BLOCKED";

export interface DecideMergeActionInput {
  pullRequestMerged: boolean;
  pullRequestState: "open" | "closed";
  /** null means GitHub hasn't finished computing mergeability yet — a real, common, non-error state right after opening/updating a PR. */
  mergeable: boolean | null;
}

/**
 * MERGE_TO_PRODUCTION's own idempotency/safety gate: a retry (e.g. after a
 * timeout on the merge call itself) must never attempt a second merge, and
 * must never merge a PR GitHub has flagged as unmergeable (conflicts,
 * failing required checks) without a human resolving that first.
 */
export function decideMergeAction(input: DecideMergeActionInput): MergeAction {
  if (input.pullRequestMerged) return "ALREADY_MERGED";
  if (input.pullRequestState === "closed") return "BLOCKED"; // closed without merging -- needs human attention, never silently retried
  if (input.mergeable === false) return "BLOCKED";
  if (input.mergeable === null) return "NOT_YET_MERGEABLE"; // caller should re-check shortly, not fail outright
  return "SAFE_TO_MERGE";
}
