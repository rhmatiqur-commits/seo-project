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

export interface PublishPageInput {
  title: string;
  /** Already-converted HTML — the provider never sees our Markdown. */
  bodyHtml: string;
  /** Maps to WordPress's native `excerpt` field — never a SEO-plugin-specific meta field (see README). */
  excerpt: string | null;
  slug: string;
  status: PublicationPageStatus;
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

export interface PublishingProvider {
  readonly name: string;
  testConnection(): Promise<ConnectionTestResult>;
  createDraft(input: PublishPageInput): Promise<PublishedPageResult>;
  /** Creates-and-publishes in one call when no existingExternalId is given; otherwise flips that existing page from draft to published (never creates a second page). */
  publish(input: PublishPageInput, existingExternalId?: string | null): Promise<PublishedPageResult>;
  update(externalId: string, input: PublishPageInput): Promise<PublishedPageResult>;
  getPublishedPage(externalId: string): Promise<PublishedPageResult | null>;
  /** The retry-safety primitive — checked before ever creating a page on a retry (see lib/publishing/retry-strategy.ts). */
  findBySlug(slug: string): Promise<PublishedPageResult | null>;
  /** Sets the page back to draft. Never deletes anything — no destructive rollback in Phase 5 (see README). */
  unpublish(externalId: string): Promise<PublishedPageResult>;
}
