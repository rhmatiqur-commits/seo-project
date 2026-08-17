import { parseFrontmatter, patchFrontmatterFields, serializeFrontmatter } from "@/lib/publishing/github/frontmatter";
import { ContentAdapterError } from "@/lib/publishing/github/content-adapter";
import type { AdapterPageInput, FileChange, FileChangePlan, FileChangeValidationResult, WebsiteContentAdapter } from "@/lib/publishing/github/content-adapter";

/**
 * Configuration contract for the generic Markdown adapter — this is exactly
 * "the CV-Central-specific configuration that still needs to be supplied"
 * (per spec, for when the target repository isn't reachable). Nothing about
 * CV Central's real structure is assumed; every field below has a
 * documented, sane default a real integrator overrides once they can
 * actually inspect the repository.
 */
export interface MarkdownAdapterConfig {
  /** Repo-relative directory content files live in, e.g. "content/blog" or "src/pages/blog". No leading/trailing slash. */
  contentDirectory: string;
  /** File extension without the dot, e.g. "md" or "mdx". */
  fileExtension: string;
  /** How a target URL maps to a filename within contentDirectory:
   *  - "slug": only the URL's last path segment is used (contentDirectory/my-post.md)
   *  - "full-path": the URL's full path (minus contentDirectory) is mirrored (contentDirectory/2025/my-post.md for "/2025/my-post") */
  routeStrategy: "slug" | "full-path";
  /** Frontmatter field names — every project's schema differs, so these are configurable rather than hard-coded to e.g. "title"/"description". */
  frontmatterFields: { title: string; description: string; slug: string };
}

export const DEFAULT_MARKDOWN_ADAPTER_CONFIG: MarkdownAdapterConfig = {
  contentDirectory: "content/pages",
  fileExtension: "md",
  routeStrategy: "slug",
  frontmatterFields: { title: "title", description: "description", slug: "slug" },
};

function pathSegments(url: string): string[] {
  try {
    return new URL(url, "https://placeholder.invalid").pathname.split("/").filter(Boolean);
  } catch {
    return url.split("/").filter(Boolean);
  }
}

function computeFilePath(config: MarkdownAdapterConfig, input: AdapterPageInput): string {
  const segments = pathSegments(input.targetUrl);
  const relative = config.routeStrategy === "slug" ? [input.slug || segments[segments.length - 1] || "untitled"] : segments.length > 0 ? segments : [input.slug || "untitled"];
  return `${config.contentDirectory}/${relative.join("/")}.${config.fileExtension}`;
}

/**
 * A real per-site adapter (framework-aware routing, real frontmatter schema,
 * image handling, sitemap updates, etc.) is what a reachable CV Central
 * repository would let this platform build — see this file's own doc
 * comment and README's "GitHub/Vercel Publishing Provider" section for
 * exactly what's still needed. Until then, this generic, config-driven
 * adapter is what's genuinely honest to ship: plain Markdown + frontmatter
 * files at a configurable path, patched (not blindly overwritten) on
 * OPTIMISE_EXISTING_PAGE.
 */
export class ConfigurableMarkdownContentAdapter implements WebsiteContentAdapter {
  readonly name = "configurable-markdown";
  private readonly config: MarkdownAdapterConfig;

  constructor(config: MarkdownAdapterConfig = DEFAULT_MARKDOWN_ADAPTER_CONFIG) {
    this.config = config;
  }

  filePathsToRead(input: AdapterPageInput): string[] {
    return [computeFilePath(this.config, input)];
  }

  planFileChanges(input: AdapterPageInput, existingFiles: ReadonlyMap<string, { content: string; sha: string }>): FileChangePlan {
    const path = computeFilePath(this.config, input);
    const existing = existingFiles.get(path) ?? null;
    const fieldNames = this.config.frontmatterFields;
    const frontmatterPatch: Record<string, string> = {
      [fieldNames.title]: input.title,
      [fieldNames.description]: input.metaDescription ?? "",
      [fieldNames.slug]: input.slug,
    };

    if (input.contentType === "CREATE_NEW_PAGE") {
      if (existing) {
        // A file already sits at the computed path — creating "new" content
        // here would silently overwrite something unrelated. Refuse rather
        // than guess (spec: "do not overwrite unrelated changes").
        throw new ContentAdapterError(`Refusing to create a new page at "${path}" — a file already exists there. Check the target URL/slug for a collision, or use OPTIMISE_EXISTING_PAGE if this is meant to update it.`);
      }
      const body = input.h1 ? `# ${input.h1}\n\n${input.bodyMarkdown}` : input.bodyMarkdown;
      const content = serializeFrontmatter(frontmatterPatch, body);
      return { files: [{ path, content, operation: "create" }], summary: `Create new page "${input.title}" at ${path}` };
    }

    // OPTIMISE_EXISTING_PAGE
    if (!existing) {
      throw new ContentAdapterError(`Cannot optimise "${input.targetUrl}" — no file was found at the expected path "${path}". The adapter's routeStrategy/contentDirectory configuration may not match this repository's real layout.`);
    }
    // Patch: replace only the frontmatter fields this adapter knows about
    // (preserving every other field/key order untouched) and replace the
    // body wholesale — content generation always produces a complete new
    // body, but unrelated frontmatter (dates, authors, custom flags the
    // adapter has no schema for) survives exactly as it was. This is the
    // "generate a patch rather than blindly replacing unrelated code" rule
    // applied to the one dimension a generic adapter can safely reason
    // about without knowing the site's real structure.
    const parsed = parseFrontmatter(existing.content);
    const body = input.h1 ? `# ${input.h1}\n\n${input.bodyMarkdown}` : input.bodyMarkdown;
    const content = parsed.fields ? patchFrontmatterFields(existing.content, frontmatterPatch).replace(/\n\n[\s\S]*$/, `\n\n${body.trimStart()}`) : serializeFrontmatter(frontmatterPatch, body);
    return { files: [{ path, content, operation: "update" }], summary: `Update existing page "${input.title}" at ${path}` };
  }

  validateFileChange(change: FileChange): FileChangeValidationResult {
    const errors: string[] = [];
    if (!change.path || change.path.includes("..")) errors.push(`Invalid file path: "${change.path}"`);
    if (!change.path.startsWith(`${this.config.contentDirectory}/`)) errors.push(`File path "${change.path}" is outside the configured content directory "${this.config.contentDirectory}"`);
    if (!change.content.trim()) errors.push("Generated file content is empty");
    const parsed = parseFrontmatter(change.content);
    if (!parsed.fields) errors.push("Generated file has no frontmatter block");
    else {
      const titleField = this.config.frontmatterFields.title;
      if (!parsed.fields[titleField]) errors.push(`Frontmatter is missing the "${titleField}" field`);
    }
    if (!parsed.body.trim()) errors.push("Generated file has no body content after the frontmatter block");
    return { valid: errors.length === 0, errors };
  }
}
