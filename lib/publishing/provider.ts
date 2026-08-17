/**
 * Abstraction around whatever CMS actually receives the published page.
 * Call sites (lib/jobs/handlers/create-draft.ts, publish-content.ts) depend
 * only on this interface, never on WordPress specifics — same reasoning as
 * lib/ai/provider.ts and lib/content/provider.ts. The initial implementation
 * is lib/publishing/wordpress-provider.ts; Webflow/Shopify/custom-CMS
 * providers are future implementations behind this same interface (not
 * built in Phase 5 — see README).
 */

export type PublicationPageStatus = "draft" | "publish";

/**
 * Structured content for a git-based provider (Phase 6A's
 * GitHubPublishingProvider) — a flat title/bodyHtml/slug isn't enough to
 * plan a WebsiteContentAdapter's file changes (which page type, which
 * target URL, the raw Markdown before HTML conversion). Optional: WordPress
 * (and any future flat-CMS provider) ignores this field entirely; a
 * git-based provider requires it and throws a clear error if it's missing,
 * rather than guessing.
 */
export interface GitPublishInput {
  contentVersionId: string;
  contentType: "CREATE_NEW_PAGE" | "OPTIMISE_EXISTING_PAGE";
  targetUrl: string;
  /** content_versions.content, before any HTML conversion — the adapter decides how/whether to convert it. */
  bodyMarkdown: string;
  h1: string | null;
  /** A branch already known from a prior attempt in this lineage (from content_publications.branch_name) — omit on a genuine first attempt. */
  knownBranchName?: string | null;
  pullRequestBody?: string;
}

export interface PublishPageInput {
  title: string;
  /** Already-converted HTML — the provider never sees our Markdown. Ignored by git-based providers (see `git.bodyMarkdown` instead). */
  bodyHtml: string;
  /** Maps to WordPress's native `excerpt` field — never a SEO-plugin-specific meta field (see README). */
  excerpt: string | null;
  slug: string;
  status: PublicationPageStatus;
  git?: GitPublishInput;
}

export interface PublishedPageResult {
  externalId: string;
  url: string;
  status: PublicationPageStatus;
  /** A non-sensitive subset of the provider's response, safe to store in content_publications.provider_response_metadata — never credentials. */
  raw: Record<string, unknown>;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/** Optional richer status for providers whose publication isn't a single
 * flat "draft/publish" flag (Phase 6A's GitHub/PR-based flow — merged state
 * + best-effort deployment/preview info). WordPress has no equivalent
 * concept, so this stays outside PublishedPageResult rather than forcing
 * every provider to populate fields that don't apply to it. */
export interface PublicationStatusResult {
  merged: boolean;
  previewUrl: string | null;
  /** Provider-specific label (e.g. "success"/"pending"/"failure" from GitHub's Statuses API) — informational only, never authoritative over `merged`. */
  deploymentState: string | null;
}

export interface PublishingProvider {
  readonly name: string;
  testConnection(): Promise<ConnectionTestResult>;
  createDraft(input: PublishPageInput): Promise<PublishedPageResult>;
  /** Creates-and-publishes in one call when no existingExternalId is given; otherwise flips that existing page from draft to published (never creates a second page). For a git-based provider, "publish" means merging an already-open PR — existingExternalId (the PR number) is required, not optional in practice. */
  publish(input: PublishPageInput, existingExternalId?: string | null): Promise<PublishedPageResult>;
  update(externalId: string, input: PublishPageInput): Promise<PublishedPageResult>;
  getPublishedPage(externalId: string): Promise<PublishedPageResult | null>;
  /** The retry-safety primitive — checked before ever creating a page on a retry (see lib/publishing/retry-strategy.ts). Git-based providers may legitimately no-op this (see lib/publishing/github/provider.ts) since their own branch/PR-level idempotency check is more precise than a slug lookup. */
  findBySlug(slug: string): Promise<PublishedPageResult | null>;
  /** Sets the page back to draft. Never deletes anything — no destructive rollback in Phase 5 (see README). */
  unpublish(externalId: string): Promise<PublishedPageResult>;
  /** Optional: richer, multi-stage status (Phase 6A). Providers whose publication is always a simple two-state flag (WordPress) don't implement this. */
  getPublicationStatus?(externalId: string): Promise<PublicationStatusResult | null>;
}
