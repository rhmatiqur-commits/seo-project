import { markdownToHtml } from "@/lib/publishing/markdown";
import { ContentAdapterError } from "@/lib/publishing/github/content-adapter";
import type { AdapterPageInput, FileChange, FileChangePlan, FileChangeValidationResult, WebsiteContentAdapter } from "@/lib/publishing/github/content-adapter";

/**
 * The real CV Central adapter — built from directly inspecting
 * https://github.com/rhmatiqur-commits/cvcentral (read-only, no changes
 * made to that repository as part of this work). Findings that shape every
 * decision below:
 *
 *  - No framework, no build step. Every page is a hand-authored, fully
 *    self-contained static .html file — nav/footer/styles/scripts are
 *    duplicated inline in every single file, not shared via any
 *    templating/include system.
 *  - Blog posts (blog/*.html) are the only page family with a consistent,
 *    splice-able structure (title/meta description/OG/canonical/JSON-LD
 *    Article schema/h1.article-title/.article-meta/.article-body). Tool
 *    pages (cv-builder.html etc.) have a materially different, sparser
 *    shape (no canonical/OG/JSON-LD, external stylesheets, app-like body) —
 *    OPTIMISE_EXISTING_PAGE is scoped to blog posts only for now; a tool
 *    page is refused rather than guessed at.
 *  - A new blog post is only internally discoverable if a matching
 *    `<a class="post-card">` is also added to blog/index.html — creating
 *    just the post file produces an orphan page.
 *  - No sitemap.xml/robots.txt exists in the repo at all (flagged in the
 *    README, not something this adapter invents or fixes).
 *  - Never regenerates a full page from scratch (that would require
 *    reinventing the site's exact inline CSS custom properties/markup by
 *    guesswork). Every new page is built by *cloning* an existing, real
 *    blog post file (`templatePostPath`) and splicing in only the
 *    identified metadata/content regions — every other byte (nav, footer,
 *    <style> block, theme-toggle script) is copied verbatim.
 */

export interface CvCentralAdapterConfig {
  /** Directory blog posts live in. */
  blogDirectory: string;
  /** The blog listing page that must gain a new `.post-card` entry for a new post to be discoverable. */
  blogIndexPath: string;
  /** Production origin, for building absolute canonical/OG URLs. */
  siteOrigin: string;
  /**
   * Path (repo-relative) of a real, currently-published blog post used
   * purely as a *structural* clone source for a new post — its nav, footer,
   * <style> block, and scripts are copied byte-for-byte; none of its prose
   * content is ever reused. Point this at whichever post is currently most
   * representative of the live template; update it if the site's blog
   * template design changes.
   */
  templatePostPath: string;
  /** Average adult reading speed used for the "N min read" label. */
  wordsPerMinute: number;
}

export const DEFAULT_CVCENTRAL_CONFIG: CvCentralAdapterConfig = {
  blogDirectory: "blog",
  blogIndexPath: "blog/index.html",
  siteOrigin: "https://cvcentral.io",
  templatePostPath: "blog/the-complete-guide-to-cv-builder-uk-2026.html",
  wordsPerMinute: 200,
};

// ---------------------------------------------------------------------------
// Small, targeted splice helpers — each edits exactly one known region of a
// CV Central blog post, identified by a literal anchor observed in the real
// file, never a general HTML parse. Each throws ContentAdapterError with a
// specific reason when its anchor isn't found, rather than silently no-op-ing
// (a page whose title didn't actually get updated is worse than a loud failure).
// ---------------------------------------------------------------------------

function requireMatch(html: string, pattern: RegExp, what: string): RegExpExecArray {
  const match = pattern.exec(html);
  if (!match) throw new ContentAdapterError(`cvcentral adapter: could not find ${what} in the source file — its structure may have changed since this adapter was built.`);
  return match;
}

function escapeHtmlAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function replaceTitleTag(html: string, newTitle: string): string {
  requireMatch(html, /<title>[\s\S]*?<\/title>/, "the <title> tag");
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtmlAttr(newTitle)}</title>`);
}

/** Replaces the `content="..."` value of a `<meta>` tag identified by a
 * distinguishing attribute (e.g. `name="description"` or `property="og:title"`). */
function replaceMetaContent(html: string, identifyingAttr: string, newValue: string): string {
  const pattern = new RegExp(`(<meta[^>]*${identifyingAttr}[^>]*content=")[^"]*(")`, "i");
  requireMatch(html, pattern, `a <meta ${identifyingAttr}> tag`);
  return html.replace(pattern, `$1${escapeHtmlAttr(newValue)}$2`);
}

function replaceCanonical(html: string, newHref: string): string {
  const pattern = /(<link rel="canonical" href=")[^"]*(")/;
  requireMatch(html, pattern, "the canonical <link> tag");
  return html.replace(pattern, `$1${escapeHtmlAttr(newHref)}$2`);
}

/** Parses, patches, and re-serializes (compact, matching the original's
 * minified style) the Article JSON-LD block. `datePublished` is only passed
 * for a brand-new page — omit it to leave an existing post's original
 * publish date untouched. */
function replaceJsonLd(html: string, patch: { headline: string; description: string; datePublished?: string }): string {
  const pattern = /(<script type="application\/ld\+json">\s*)([\s\S]*?)(\s*<\/script>)/;
  const match = requireMatch(html, pattern, "the Article JSON-LD <script> block");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(match[2]!.trim());
  } catch {
    throw new ContentAdapterError("cvcentral adapter: the JSON-LD block did not parse as valid JSON.");
  }
  data.headline = patch.headline;
  data.description = patch.description;
  if (patch.datePublished) data.datePublished = patch.datePublished;
  return html.replace(pattern, `$1${JSON.stringify(data)}$3`);
}

function replaceArticleTitle(html: string, newTitle: string): string {
  const pattern = /(<h1 class="article-title">)[\s\S]*?(<\/h1>)/;
  requireMatch(html, pattern, 'the <h1 class="article-title"> heading');
  return html.replace(pattern, `$1${escapeHtmlAttr(newTitle)}$2`);
}

/** The breadcrumb's final segment is the plain-text article title, right
 * after the "Blog" crumb's arrow separator. */
function replaceBreadcrumbTitle(html: string, newTitle: string): string {
  const pattern = /(<a href="index\.html">Blog<\/a><span>›<\/span>\s*)[\s\S]*?(\s*<\/div>)/;
  requireMatch(html, pattern, "the breadcrumb's article-title segment");
  return html.replace(pattern, `$1${escapeHtmlAttr(newTitle)}$2`);
}

function formatCvCentralDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-GB", { month: "long" });
  return `${day} ${month} ${date.getFullYear()}`;
}

function estimateReadMinutes(text: string, wordsPerMinute: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / wordsPerMinute));
}

/** Rebuilds the whole `.article-meta` block (author is always the fixed "CV
 * Central" byline, matching every post observed) — used for a brand-new
 * post. For an existing post, only the read-time span is patched (see
 * patchArticleMetaReadTime below); the original publish date is preserved. */
function replaceArticleMeta(html: string, date: string, readMinutes: number): string {
  const pattern = /<div class="article-meta">[\s\S]*?<\/div>/;
  requireMatch(html, pattern, 'the <div class="article-meta"> block');
  const rebuilt = `<div class="article-meta">\n    <span>CV Central</span>\n    <span class="meta-dot"></span>\n    <span>${date}</span>\n    <span class="meta-dot"></span>\n    <span>${readMinutes} min read</span>\n  </div>`;
  return html.replace(pattern, rebuilt);
}

function patchArticleMetaReadTime(html: string, readMinutes: number): string {
  const pattern = /(<div class="article-meta">[\s\S]*?<span>)\d+ min read(<\/span>[\s\S]*?<\/div>)/;
  requireMatch(html, pattern, 'the "N min read" span inside .article-meta');
  return html.replace(pattern, `$1${readMinutes} min read$2`);
}

/** `.article-body`'s sibling is always `.article-cta` in every post
 * observed — used as the closing boundary instead of generic balanced-tag
 * matching (this file makes no HTML-parser assumption beyond this one
 * documented anchor). */
function replaceArticleBody(html: string, bodyHtml: string): string {
  const pattern = /(<div class="article-body">)[\s\S]*?(<\/div>\s*<div class="article-cta">)/;
  requireMatch(html, pattern, '.article-body (expected to be immediately followed by .article-cta)');
  return html.replace(pattern, `$1\n${bodyHtml}\n  $2`);
}

function slugFromCvCentralPath(path: string, blogDirectory: string): string {
  const prefix = `${blogDirectory}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length).replace(/\.html$/, "") : path.replace(/\.html$/, "");
}

// ---------------------------------------------------------------------------
// blog/index.html — the post-card list.
// ---------------------------------------------------------------------------

function buildPostCard(slug: string, title: string, description: string, date: string): string {
  return `  <a href="${escapeHtmlAttr(slug)}.html" class="post-card">
    <div class="post-tag">CV Guide</div>
    <h2>${escapeHtmlAttr(title)}</h2>
    <p>${escapeHtmlAttr(description)}</p>
    <div class="post-meta">
      <span>${date}</span>
      <span class="post-arrow">→</span>
    </div>
  </a>
`;
}

/** Inserted as the *first* card (newest-first) right after the grid's
 * opening tag — deliberately not "find the closing </div>", which would
 * need balanced-tag matching this file otherwise avoids entirely. */
function insertPostCard(html: string, cardHtml: string): string {
  const pattern = /(<div class="blog-grid" id="blogGrid">\n)/;
  requireMatch(html, pattern, 'blog/index.html\'s <div class="blog-grid" id="blogGrid"> opening tag');
  return html.replace(pattern, `$1${cardHtml}`);
}

/** Best-effort: patches an existing post's own card (title/excerpt) in the
 * blog index when that post is optimised. Never fails the whole change if
 * the card isn't found (e.g. a post that was never linked from the index in
 * the first place, or already-orphaned) — this is a nice-to-have
 * consistency fix, not a hard requirement the way the new-page card is. */
function patchPostCardIfPresent(html: string, slug: string, title: string, description: string): string {
  const pattern = new RegExp(`(<a href="${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.html" class="post-card">\\s*<div class="post-tag">[^<]*<\\/div>\\s*<h2>)[\\s\\S]*?(<\\/h2>\\s*<p>)[\\s\\S]*?(<\\/p>)`);
  const match = pattern.exec(html);
  if (!match) return html;
  return html.replace(pattern, `$1${escapeHtmlAttr(title)}$2${escapeHtmlAttr(description)}$3`);
}

// ---------------------------------------------------------------------------
// The adapter itself.
// ---------------------------------------------------------------------------

export class CvCentralContentAdapter implements WebsiteContentAdapter {
  readonly name = "cvcentral";
  private readonly config: CvCentralAdapterConfig;

  constructor(config: CvCentralAdapterConfig = DEFAULT_CVCENTRAL_CONFIG) {
    this.config = config;
  }

  private targetPostPath(input: AdapterPageInput): string {
    const url = new URL(input.targetUrl, this.config.siteOrigin);
    const pathname = url.pathname.replace(/^\/+/, "");
    return pathname || `${this.config.blogDirectory}/${input.slug}.html`;
  }

  filePathsToRead(input: AdapterPageInput): string[] {
    if (input.contentType === "CREATE_NEW_PAGE") {
      return [`${this.config.blogDirectory}/${input.slug}.html`, this.config.blogIndexPath, this.config.templatePostPath];
    }
    // OPTIMISE_EXISTING_PAGE — the index is read too (for the best-effort
    // card patch above), but its absence never blocks the change.
    return [this.targetPostPath(input), this.config.blogIndexPath];
  }

  planFileChanges(input: AdapterPageInput, existingFiles: ReadonlyMap<string, { content: string; sha: string }>): FileChangePlan {
    if (input.contentType === "CREATE_NEW_PAGE") return this.planCreate(input, existingFiles);
    return this.planOptimise(input, existingFiles);
  }

  private planCreate(input: AdapterPageInput, existingFiles: ReadonlyMap<string, { content: string; sha: string }>): FileChangePlan {
    const targetPath = `${this.config.blogDirectory}/${input.slug}.html`;
    if (existingFiles.has(targetPath)) {
      throw new ContentAdapterError(`Refusing to create a new post at "${targetPath}" — a file already exists there.`);
    }
    const template = existingFiles.get(this.config.templatePostPath);
    if (!template) {
      throw new ContentAdapterError(`cvcentral adapter: template post "${this.config.templatePostPath}" was not found — check the adapter's templatePostPath configuration.`);
    }

    const canonicalUrl = `${this.config.siteOrigin}/${targetPath}`;
    const bodyHtml = markdownToHtml(input.bodyMarkdown);
    const date = formatCvCentralDate(new Date());
    const readMinutes = estimateReadMinutes(input.bodyMarkdown, this.config.wordsPerMinute);

    let post = template.content;
    post = replaceTitleTag(post, `${input.title} — CV Central`);
    post = replaceMetaContent(post, 'name="description"', input.metaDescription ?? "");
    post = replaceMetaContent(post, 'property="og:title"', input.title);
    post = replaceMetaContent(post, 'property="og:description"', input.metaDescription ?? "");
    post = replaceMetaContent(post, 'property="og:url"', canonicalUrl);
    post = replaceCanonical(post, canonicalUrl);
    post = replaceJsonLd(post, { headline: input.title, description: input.metaDescription ?? "", datePublished: date });
    post = replaceArticleTitle(post, input.h1 ?? input.title);
    post = replaceBreadcrumbTitle(post, input.h1 ?? input.title);
    post = replaceArticleMeta(post, date, readMinutes);
    post = replaceArticleBody(post, bodyHtml);

    const files: FileChange[] = [{ path: targetPath, content: post, operation: "create" }];

    const blogIndex = existingFiles.get(this.config.blogIndexPath);
    if (!blogIndex) {
      throw new ContentAdapterError(`cvcentral adapter: "${this.config.blogIndexPath}" was not found — a new post cannot be linked internally without it.`);
    }
    const slug = slugFromCvCentralPath(targetPath, this.config.blogDirectory);
    const card = buildPostCard(slug, input.title, input.metaDescription ?? "", date);
    const updatedIndex = insertPostCard(blogIndex.content, card);
    files.push({ path: this.config.blogIndexPath, content: updatedIndex, operation: "update" });

    return { files, summary: `Create new blog post "${input.title}" at ${targetPath}, linked from ${this.config.blogIndexPath}` };
  }

  private planOptimise(input: AdapterPageInput, existingFiles: ReadonlyMap<string, { content: string; sha: string }>): FileChangePlan {
    const targetPath = this.targetPostPath(input);
    if (!targetPath.startsWith(`${this.config.blogDirectory}/`)) {
      throw new ContentAdapterError(
        `cvcentral adapter: OPTIMISE_EXISTING_PAGE is only supported for blog posts ("${this.config.blogDirectory}/*.html") in this phase — "${targetPath}" is a tool/app page with a different, unsplicable structure. Not implemented — see README.`
      );
    }
    const existing = existingFiles.get(targetPath);
    if (!existing) {
      throw new ContentAdapterError(`Cannot optimise "${input.targetUrl}" — no file was found at the expected path "${targetPath}".`);
    }

    const bodyHtml = markdownToHtml(input.bodyMarkdown);
    const readMinutes = estimateReadMinutes(input.bodyMarkdown, this.config.wordsPerMinute);

    let post = existing.content;
    post = replaceTitleTag(post, `${input.title} — CV Central`);
    post = replaceMetaContent(post, 'name="description"', input.metaDescription ?? "");
    post = replaceMetaContent(post, 'property="og:title"', input.title);
    post = replaceMetaContent(post, 'property="og:description"', input.metaDescription ?? "");
    // og:url/canonical deliberately untouched — an existing page's URL never
    // changes as a result of a content update (same rule
    // lib/publishing/url.ts's resolvePublicationTargetUrl already enforces
    // for WordPress).
    post = replaceJsonLd(post, { headline: input.title, description: input.metaDescription ?? "" }); // datePublished omitted -> preserved
    post = replaceArticleTitle(post, input.h1 ?? input.title);
    post = replaceBreadcrumbTitle(post, input.h1 ?? input.title);
    post = patchArticleMetaReadTime(post, readMinutes); // publish date preserved, only read-time updates
    post = replaceArticleBody(post, bodyHtml);

    const files: FileChange[] = [{ path: targetPath, content: post, operation: "update" }];

    const blogIndex = existingFiles.get(this.config.blogIndexPath);
    if (blogIndex) {
      const slug = slugFromCvCentralPath(targetPath, this.config.blogDirectory);
      const updatedIndex = patchPostCardIfPresent(blogIndex.content, slug, input.title, input.metaDescription ?? "");
      if (updatedIndex !== blogIndex.content) {
        files.push({ path: this.config.blogIndexPath, content: updatedIndex, operation: "update" });
      }
    }

    return { files, summary: `Update existing blog post "${input.title}" at ${targetPath}` };
  }

  validateFileChange(change: FileChange): FileChangeValidationResult {
    const errors: string[] = [];
    if (!change.path || change.path.includes("..")) errors.push(`Invalid file path: "${change.path}"`);
    if (!change.content.includes("<html")) errors.push("Generated file does not look like a full HTML document (missing <html>)");
    if (change.path.endsWith(".html") && change.path !== this.config.blogIndexPath) {
      if (!change.content.includes("<title>")) errors.push("Generated post is missing a <title> tag");
      if (!change.content.includes('class="article-body"')) errors.push('Generated post is missing its .article-body content region');
    }
    const openTags = (change.content.match(/<html[\s>]/g) ?? []).length;
    const closeTags = (change.content.match(/<\/html>/g) ?? []).length;
    if (openTags !== closeTags) errors.push("Unbalanced <html>/</html> tags — the splice may have corrupted the document structure");
    return { valid: errors.length === 0, errors };
  }
}
