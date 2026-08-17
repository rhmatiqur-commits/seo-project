/**
 * The site-specific content adapter layer (spec: "this is critical").
 * GitHubPublishingProvider must never assume "create article.md" or "create
 * page.tsx" — different code-based websites represent content completely
 * differently (framework, routing, file layout, frontmatter schema). This
 * file defines the boundary: everything GitHub-specific (branch/commit/PR/
 * merge) stays in lib/publishing/github/client.ts and
 * lib/publishing/github-provider.ts; everything site-specific (where pages
 * live, how they're named, how metadata is represented) lives behind
 * WebsiteContentAdapter.
 *
 *   GitHubPublishingProvider
 *           |
 *           v
 *   WebsiteContentAdapter  (this file's interface)
 *           |
 *           v
 *   a real per-site adapter (e.g. a future CV Central adapter)
 *
 * No CV-Central-specific file path, route pattern, or frontmatter field
 * appears anywhere in lib/publishing/github/* — the CV Central repository
 * was not reachable when this was written (verified: no code, no sibling
 * repo, no credentials anywhere on this machine — same check Phase 4 did
 * for CV Central's content-generation system). See README's "GitHub/Vercel
 * Publishing Provider" section for the exact configuration a real CV
 * Central adapter still needs supplied.
 */

export type AdapterContentType = "CREATE_NEW_PAGE" | "OPTIMISE_EXISTING_PAGE";

export interface AdapterPageInput {
  contentType: AdapterContentType;
  /** The route the page should live at (or already lives at), e.g. "/blog/my-post". */
  targetUrl: string;
  slug: string;
  title: string;
  /** content_versions.content — already Markdown, never HTML (the adapter decides how/whether to convert it). */
  bodyMarkdown: string;
  metaDescription: string | null;
  h1: string | null;
}

export interface FileChange {
  /** Repo-relative path, e.g. "content/blog/my-post.md" — never an absolute filesystem path. */
  path: string;
  content: string;
  operation: "create" | "update";
}

export interface FileChangePlan {
  files: FileChange[];
  /** Human-readable summary used for the commit message and PR description. */
  summary: string;
}

export interface FileChangeValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Thrown by planFileChanges when the adapter cannot safely proceed — e.g.
 * OPTIMISE_EXISTING_PAGE's target file wasn't found among the files the
 * caller read, or CREATE_NEW_PAGE's target path unexpectedly already has
 * content. Distinguished from a generic Error so job handlers can classify
 * it as a permanent (non-retryable) failure — retrying won't fix a
 * structural mismatch between the brief and the repository's real layout.
 */
export class ContentAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentAdapterError";
  }
}

export interface WebsiteContentAdapter {
  readonly name: string;

  /**
   * Which file paths this adapter needs to read before it can plan changes
   * (e.g. the existing page's own file). Lets the job handler batch its
   * GitHub reads — the adapter itself never calls GitHub directly, keeping
   * planFileChanges a pure function.
   */
  filePathsToRead(input: AdapterPageInput): string[];

  /**
   * Pure: decides exactly which files to create/modify. `existingFiles` is
   * keyed by the paths returned from filePathsToRead (whichever ones
   * actually existed — a CREATE_NEW_PAGE path legitimately won't). Never
   * calls GitHub, never has side effects, fully unit-testable.
   */
  planFileChanges(input: AdapterPageInput, existingFiles: ReadonlyMap<string, { content: string; sha: string }>): FileChangePlan;

  /** Basic structural validation of one planned file's content before it's
   * committed (spec: "Validate the generated files" / "Validate the
   * resulting file"). */
  validateFileChange(change: FileChange): FileChangeValidationResult;
}
