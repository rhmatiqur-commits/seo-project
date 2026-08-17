import { test } from "node:test";
import assert from "node:assert/strict";
import { CvCentralContentAdapter, DEFAULT_CVCENTRAL_CONFIG } from "./cvcentral-adapter";
import { ContentAdapterError } from "./content-adapter";
import type { AdapterPageInput } from "./content-adapter";

/**
 * Fixtures below are structurally faithful to the real
 * github.com/rhmatiqur-commits/cvcentral blog post/index shape (tag names,
 * class names, attribute names, and anchor sequences the splice functions
 * key off) — captured from direct, read-only inspection of that public
 * repository. Prose content is placeholder, not reproduced verbatim.
 */

const TEMPLATE_POST = `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8">
  <title>Old Title — CV Central</title>
  <meta name="description" content="Old description.">
  <meta property="og:title" content="Old Title">
  <meta property="og:description" content="Old description.">
  <meta property="og:url" content="https://cvcentral.io/blog/old-post.html">
  <link rel="canonical" href="https://cvcentral.io/blog/old-post.html">
  <script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"Old Title","description":"Old description.","datePublished":"01 January 2026","publisher":{"@type":"Organization","name":"CV Central","url":"https://cvcentral.io"}}
  </script>
  <style>:root{--bg:#0A0A14;}</style>
</head>
<body>
<nav><a href="../index.html" class="nav-logo">CV Central</a></nav>
<div class="article-wrap">
  <div class="breadcrumb">
    <a href="../index.html">CV Central</a><span>›</span>
    <a href="index.html">Blog</a><span>›</span>
    Old Title
  </div>
  <div class="article-tag">CV Guide</div>
  <h1 class="article-title">Old Title</h1>
  <div class="article-meta">
    <span>CV Central</span>
    <span class="meta-dot"></span>
    <span>01 January 2026</span>
    <span class="meta-dot"></span>
    <span>3 min read</span>
  </div>
  <div class="article-body">
<h2>Old Heading</h2>
<p>Old paragraph.</p>
  </div>
  <div class="article-cta">
    <h3>Put this into action</h3>
    <a href="../signup.html" class="btn-lime">Try free</a>
  </div>
  <a href="index.html" class="back-link">← Back to all guides</a>
</div>
<footer><div class="footer-inner">Footer content unchanged</div></footer>
<script>console.log('theme toggle');</script>
</body>
</html>`;

const BLOG_INDEX = `<!DOCTYPE html>
<html lang="en-GB">
<head><title>Blog — CV Central</title></head>
<body>
<section><h1>Guides</h1></section>
<div class="blog-grid" id="blogGrid">
  <a href="old-post.html" class="post-card">
    <div class="post-tag">CV Guide</div>
    <h2>Old Title</h2>
    <p>Old description.</p>
    <div class="post-meta">
      <span>01 January 2026</span>
      <span class="post-arrow">→</span>
    </div>
  </a>
</div>
</body>
</html>`;

function baseInput(overrides: Partial<AdapterPageInput> = {}): AdapterPageInput {
  return {
    contentType: "CREATE_NEW_PAGE",
    targetUrl: "https://cvcentral.io/blog/landlord-accountant-coventry.html",
    slug: "landlord-accountant-coventry",
    title: "Landlord Accountant Coventry: The Complete Guide (2026)",
    bodyMarkdown: "## Why Landlords Need a Specialist Accountant\n\nWe help landlords in Coventry manage their tax affairs.",
    metaDescription: "Specialist landlord accounting in Coventry — tax returns, allowable expenses, and more.",
    h1: "Landlord Accountant Coventry: The Complete Guide (2026)",
    ...overrides,
  };
}

function filesMap(entries: Record<string, string>): Map<string, { content: string; sha: string }> {
  return new Map(Object.entries(entries).map(([path, content]) => [path, { content, sha: `sha-${path}` }]));
}

test("filePathsToRead: CREATE_NEW_PAGE reads the target path, blog index, and template post", () => {
  const adapter = new CvCentralContentAdapter();
  const paths = adapter.filePathsToRead(baseInput());
  assert.deepEqual(paths, [`blog/landlord-accountant-coventry.html`, DEFAULT_CVCENTRAL_CONFIG.blogIndexPath, DEFAULT_CVCENTRAL_CONFIG.templatePostPath]);
});

test("filePathsToRead: OPTIMISE_EXISTING_PAGE reads the target path (from targetUrl) and the blog index", () => {
  const adapter = new CvCentralContentAdapter();
  const paths = adapter.filePathsToRead(baseInput({ contentType: "OPTIMISE_EXISTING_PAGE", targetUrl: "https://cvcentral.io/blog/old-post.html" }));
  assert.deepEqual(paths, ["blog/old-post.html", DEFAULT_CVCENTRAL_CONFIG.blogIndexPath]);
});

test("planFileChanges CREATE_NEW_PAGE: clones the template, splices metadata/body, and adds a blog-index card", () => {
  const adapter = new CvCentralContentAdapter();
  const existing = filesMap({ [DEFAULT_CVCENTRAL_CONFIG.templatePostPath]: TEMPLATE_POST, [DEFAULT_CVCENTRAL_CONFIG.blogIndexPath]: BLOG_INDEX });
  const plan = adapter.planFileChanges(baseInput(), existing);

  assert.equal(plan.files.length, 2);
  const post = plan.files.find((f) => f.path === "blog/landlord-accountant-coventry.html")!;
  assert.equal(post.operation, "create");
  assert.match(post.content, /<title>Landlord Accountant Coventry: The Complete Guide \(2026\) — CV Central<\/title>/);
  assert.match(post.content, /content="Specialist landlord accounting in Coventry/);
  assert.match(post.content, /href="https:\/\/cvcentral\.io\/blog\/landlord-accountant-coventry\.html"/);
  assert.match(post.content, /Why Landlords Need a Specialist Accountant/);
  // Nav/footer/style copied verbatim from the template, never regenerated:
  assert.match(post.content, /Footer content unchanged/);
  assert.match(post.content, /--bg:#0A0A14;/);

  const index = plan.files.find((f) => f.path === DEFAULT_CVCENTRAL_CONFIG.blogIndexPath)!;
  assert.equal(index.operation, "update");
  assert.match(index.content, /href="landlord-accountant-coventry\.html" class="post-card"/);
  assert.match(index.content, /href="old-post\.html" class="post-card"/); // original card preserved
});

test("planFileChanges CREATE_NEW_PAGE: JSON-LD headline/description/datePublished are patched, publisher block preserved", () => {
  const adapter = new CvCentralContentAdapter();
  const existing = filesMap({ [DEFAULT_CVCENTRAL_CONFIG.templatePostPath]: TEMPLATE_POST, [DEFAULT_CVCENTRAL_CONFIG.blogIndexPath]: BLOG_INDEX });
  const plan = adapter.planFileChanges(baseInput(), existing);
  const post = plan.files.find((f) => f.path.startsWith("blog/landlord"))!;
  const jsonLdMatch = /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/.exec(post.content);
  const data = JSON.parse(jsonLdMatch![1]!);
  assert.equal(data.headline, "Landlord Accountant Coventry: The Complete Guide (2026)");
  assert.equal(data.publisher.name, "CV Central");
  assert.notEqual(data.datePublished, "01 January 2026"); // a real new date, not the template's
});

test("planFileChanges CREATE_NEW_PAGE: refuses when a file already exists at the target path", () => {
  const adapter = new CvCentralContentAdapter();
  const existing = filesMap({
    "blog/landlord-accountant-coventry.html": "<html>already here</html>",
    [DEFAULT_CVCENTRAL_CONFIG.templatePostPath]: TEMPLATE_POST,
    [DEFAULT_CVCENTRAL_CONFIG.blogIndexPath]: BLOG_INDEX,
  });
  assert.throws(() => adapter.planFileChanges(baseInput(), existing), ContentAdapterError);
});

test("planFileChanges CREATE_NEW_PAGE: refuses when the template post is missing", () => {
  const adapter = new CvCentralContentAdapter();
  const existing = filesMap({ [DEFAULT_CVCENTRAL_CONFIG.blogIndexPath]: BLOG_INDEX });
  assert.throws(() => adapter.planFileChanges(baseInput(), existing), ContentAdapterError);
});

test("planFileChanges CREATE_NEW_PAGE: refuses when blog/index.html is missing (a new post must never be an orphan)", () => {
  const adapter = new CvCentralContentAdapter();
  const existing = filesMap({ [DEFAULT_CVCENTRAL_CONFIG.templatePostPath]: TEMPLATE_POST });
  assert.throws(() => adapter.planFileChanges(baseInput(), existing), ContentAdapterError);
});

test("planFileChanges OPTIMISE_EXISTING_PAGE: splices metadata/body, but never touches canonical/og:url or the original publish date", () => {
  const adapter = new CvCentralContentAdapter();
  const existing = filesMap({ "blog/old-post.html": TEMPLATE_POST, [DEFAULT_CVCENTRAL_CONFIG.blogIndexPath]: BLOG_INDEX });
  const input = baseInput({ contentType: "OPTIMISE_EXISTING_PAGE", targetUrl: "https://cvcentral.io/blog/old-post.html", title: "Refreshed Title (2026)", h1: "Refreshed Title (2026)" });
  const plan = adapter.planFileChanges(input, existing);

  const post = plan.files.find((f) => f.path === "blog/old-post.html")!;
  assert.equal(post.operation, "update");
  assert.match(post.content, /<title>Refreshed Title \(2026\) — CV Central<\/title>/);
  assert.match(post.content, /href="https:\/\/cvcentral\.io\/blog\/old-post\.html"/); // canonical/og:url unchanged
  assert.match(post.content, /01 January 2026/); // original publish date preserved
  assert.doesNotMatch(post.content, /3 min read/); // read time recalculated from the new body
});

test("planFileChanges OPTIMISE_EXISTING_PAGE: best-effort patches the matching post-card in blog/index.html", () => {
  const adapter = new CvCentralContentAdapter();
  const existing = filesMap({ "blog/old-post.html": TEMPLATE_POST, [DEFAULT_CVCENTRAL_CONFIG.blogIndexPath]: BLOG_INDEX });
  const input = baseInput({ contentType: "OPTIMISE_EXISTING_PAGE", targetUrl: "https://cvcentral.io/blog/old-post.html", title: "Refreshed Title (2026)" });
  const plan = adapter.planFileChanges(input, existing);
  const index = plan.files.find((f) => f.path === DEFAULT_CVCENTRAL_CONFIG.blogIndexPath);
  assert.ok(index);
  assert.match(index!.content, /<h2>Refreshed Title \(2026\)<\/h2>/);
});

test("planFileChanges OPTIMISE_EXISTING_PAGE: does not fail the whole change when the post-card isn't found in the index", () => {
  const adapter = new CvCentralContentAdapter();
  const emptyIndex = BLOG_INDEX.replace('href="old-post.html"', 'href="some-other-post.html"');
  const existing = filesMap({ "blog/old-post.html": TEMPLATE_POST, [DEFAULT_CVCENTRAL_CONFIG.blogIndexPath]: emptyIndex });
  const input = baseInput({ contentType: "OPTIMISE_EXISTING_PAGE", targetUrl: "https://cvcentral.io/blog/old-post.html" });
  const plan = adapter.planFileChanges(input, existing);
  assert.equal(plan.files.length, 1); // no index file included, since nothing to patch
});

test("planFileChanges OPTIMISE_EXISTING_PAGE: refuses a tool/app page outside the blog directory (scoped to blog posts only)", () => {
  const adapter = new CvCentralContentAdapter();
  const input = baseInput({ contentType: "OPTIMISE_EXISTING_PAGE", targetUrl: "https://cvcentral.io/cv-builder.html" });
  assert.throws(() => adapter.planFileChanges(input, filesMap({})), ContentAdapterError);
});

test("planFileChanges OPTIMISE_EXISTING_PAGE: refuses when the target file isn't found", () => {
  const adapter = new CvCentralContentAdapter();
  const input = baseInput({ contentType: "OPTIMISE_EXISTING_PAGE", targetUrl: "https://cvcentral.io/blog/missing-post.html" });
  assert.throws(() => adapter.planFileChanges(input, filesMap({})), ContentAdapterError);
});

test("validateFileChange: a well-formed spliced post passes", () => {
  const adapter = new CvCentralContentAdapter();
  const existing = filesMap({ [DEFAULT_CVCENTRAL_CONFIG.templatePostPath]: TEMPLATE_POST, [DEFAULT_CVCENTRAL_CONFIG.blogIndexPath]: BLOG_INDEX });
  const plan = adapter.planFileChanges(baseInput(), existing);
  const post = plan.files.find((f) => f.path.startsWith("blog/landlord"))!;
  const result = adapter.validateFileChange(post);
  assert.equal(result.valid, true);
});

test("validateFileChange: flags a file missing .article-body", () => {
  const adapter = new CvCentralContentAdapter();
  const result = adapter.validateFileChange({ path: "blog/broken.html", content: "<html><body>no article body here</body></html>", operation: "create" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("article-body")));
});

test("validateFileChange: flags unbalanced <html> tags", () => {
  const adapter = new CvCentralContentAdapter();
  const result = adapter.validateFileChange({ path: "blog/broken.html", content: '<html><body class="article-body"><title>x</title></body>', operation: "create" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Unbalanced")));
});
