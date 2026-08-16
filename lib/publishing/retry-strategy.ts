/**
 * The core "before retrying an uncertain publication, determine whether the
 * page was already created" decision (per spec: "this is critical"). Pure
 * and unit-tested — the job handlers (create-draft.ts/publish-content.ts)
 * gather the inputs (does our own content_publications row already know an
 * external_id; is this a retry; did a slug lookup find something) and this
 * function decides what to do, so the actual duplicate-prevention logic is
 * testable without a WordPress site or a database.
 */

export type PublishAction = "USE_EXISTING" | "ADOPT_FOUND" | "CREATE_NEW";

export interface DecidePublishActionInput {
  /** external_id already recorded on our own content_publications row, from a prior attempt in this same lineage. */
  existingExternalId: string | null;
  /** jobs.retry_count for the current job — 0 on a first attempt. */
  retryCount: number;
  /** Result of calling provider.findBySlug() — only consulted on a retry with no known external_id. */
  foundExistingBySlug: { externalId: string } | null;
}

export function decidePublishAction(input: DecidePublishActionInput): PublishAction {
  if (input.existingExternalId) return "USE_EXISTING";
  if (input.retryCount > 0 && input.foundExistingBySlug) return "ADOPT_FOUND";
  return "CREATE_NEW";
}
