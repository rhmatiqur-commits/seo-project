import { mapWordPressError } from "@/lib/publishing/errors";
import { WORDPRESS_REQUEST_TIMEOUT_MS, WORDPRESS_SLUG_LOOKUP_PER_PAGE } from "@/lib/publishing/limits";
import type { ConnectionTestResult, PublishedPageResult, PublishingProvider, PublishPageInput } from "@/lib/publishing/provider";

export interface WordPressConnectionConfig {
  baseUrl: string;
  username: string;
  applicationPassword: string;
}

interface WpPageResponse {
  id: number;
  link: string;
  slug: string;
  status: string;
}

interface WpErrorBody {
  code?: string;
  message?: string;
}

/**
 * Official WordPress REST API only (no scraping) — the WP REST API's own
 * `/wp/v2/pages` resource, authenticated via HTTP Basic Auth with a
 * WordPress Application Password (WordPress's own official mechanism for
 * exactly this — never the account's normal login password). Credentials
 * are never logged: every thrown error carries only the WP response's
 * `.message` text, never the request itself.
 */
export class WordPressPublishingProvider implements PublishingProvider {
  readonly name = "wordpress";
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: WordPressConnectionConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.authHeader = `Basic ${Buffer.from(`${config.username}:${config.applicationPassword}`).toString("base64")}`;
  }

  private async request(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: unknown }> {
    const url = `${this.baseUrl}/wp-json/wp/v2${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method ?? "GET",
        headers: {
          Authorization: this.authHeader,
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(WORDPRESS_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Network error / timeout — never reached WordPress at all. The
      // message is our own AbortSignal/fetch error text, never anything
      // containing the Authorization header.
      throw mapWordPressError(null, error instanceof Error ? error.message : String(error));
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const detail = (body as WpErrorBody | null)?.message;
      throw mapWordPressError(response.status, detail);
    }
    return { status: response.status, body };
  }

  private mapPage(page: WpPageResponse): PublishedPageResult {
    return {
      externalId: String(page.id),
      // WordPress has more statuses than our two-state model (pending/
      // private/future/trash) -- anything that isn't literally 'publish'
      // collapses to 'draft' here, documented, not a silent misclassification.
      status: page.status === "publish" ? "publish" : "draft",
      url: page.link,
      raw: { id: page.id, slug: page.slug, status: page.status, link: page.link },
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.request("/users/me");
      return { ok: true, message: "Connected successfully." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not connect to WordPress.";
      return { ok: false, message };
    }
  }

  async createDraft(input: PublishPageInput): Promise<PublishedPageResult> {
    // Always forced to 'draft' regardless of what the caller passed --
    // "creating a draft should never make the content publicly visible" is
    // enforced here, not just by convention at the call site.
    const { body } = await this.request("/pages", {
      method: "POST",
      body: { title: input.title, content: input.bodyHtml, excerpt: input.excerpt ?? "", slug: input.slug, status: "draft" },
    });
    return this.mapPage(body as WpPageResponse);
  }

  async publish(input: PublishPageInput, existingExternalId?: string | null): Promise<PublishedPageResult> {
    if (existingExternalId) {
      // Flips the *same* page from draft to published -- never a second page.
      const { body } = await this.request(`/pages/${existingExternalId}`, {
        method: "POST",
        body: { title: input.title, content: input.bodyHtml, excerpt: input.excerpt ?? "", slug: input.slug, status: "publish" },
      });
      return this.mapPage(body as WpPageResponse);
    }
    const { body } = await this.request("/pages", {
      method: "POST",
      body: { title: input.title, content: input.bodyHtml, excerpt: input.excerpt ?? "", slug: input.slug, status: "publish" },
    });
    return this.mapPage(body as WpPageResponse);
  }

  async update(externalId: string, input: PublishPageInput): Promise<PublishedPageResult> {
    const { body } = await this.request(`/pages/${externalId}`, {
      method: "POST",
      body: { title: input.title, content: input.bodyHtml, excerpt: input.excerpt ?? "", status: input.status },
      // Slug deliberately omitted on update -- see lib/publishing/url.ts's
      // resolvePublicationTargetUrl: existing-page updates never change the URL.
    });
    return this.mapPage(body as WpPageResponse);
  }

  async getPublishedPage(externalId: string): Promise<PublishedPageResult | null> {
    try {
      const { body } = await this.request(`/pages/${externalId}?context=edit`);
      return this.mapPage(body as WpPageResponse);
    } catch (error) {
      if (error instanceof Error && error.name === "WordPressApiError" && (error as { kind?: string }).kind === "NOT_FOUND") return null;
      throw error;
    }
  }

  async findBySlug(slug: string): Promise<PublishedPageResult | null> {
    // status=any (rather than the unauthenticated default of published-only)
    // so our own prior draft attempt is found too -- this is the retry-safety
    // check, and a draft we created is exactly what it needs to catch.
    const { body } = await this.request(`/pages?slug=${encodeURIComponent(slug)}&status=any&per_page=${WORDPRESS_SLUG_LOOKUP_PER_PAGE}&context=edit`);
    const pages = body as WpPageResponse[];
    if (!Array.isArray(pages) || pages.length === 0) return null;
    return this.mapPage(pages[0]!);
  }

  async unpublish(externalId: string): Promise<PublishedPageResult> {
    const { body } = await this.request(`/pages/${externalId}`, { method: "POST", body: { status: "draft" } });
    return this.mapPage(body as WpPageResponse);
  }
}
