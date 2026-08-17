import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigurableMarkdownContentAdapter, DEFAULT_MARKDOWN_ADAPTER_CONFIG } from "./markdown-adapter";
import { parseFrontmatter } from "./frontmatter";
import { ContentAdapterError } from "./content-adapter";
import type { AdapterPageInput } from "./content-adapter";

function baseInput(overrides: Partial<AdapterPageInput> = {}): AdapterPageInput {
  return {
    contentType: "CREATE_NEW_PAGE",
    targetUrl: "/landlord-accountant-coventry",
    slug: "landlord-accountant-coventry",
    title: "Landlord Accountant Coventry",
    bodyMarkdown: "## Why choose us\n\nWe help landlords in Coventry.",
    metaDescription: "Specialist landlord accounting in Coventry.",
    h1: "Landlord Accountant Coventry",
    ...overrides,
  };
}

test("filePathsToRead: computes the configured content-directory path from the slug", () => {
  const adapter = new ConfigurableMarkdownContentAdapter();
  const paths = adapter.filePathsToRead(baseInput());
  assert.deepEqual(paths, [`${DEFAULT_MARKDOWN_ADAPTER_CONFIG.contentDirectory}/landlord-accountant-coventry.md`]);
});

test("planFileChanges: CREATE_NEW_PAGE with no existing file produces a single 'create' change with valid frontmatter", () => {
  const adapter = new ConfigurableMarkdownContentAdapter();
  const plan = adapter.planFileChanges(baseInput(), new Map());
  assert.equal(plan.files.length, 1);
  assert.equal(plan.files[0]!.operation, "create");
  const parsed = parseFrontmatter(plan.files[0]!.content);
  assert.equal(parsed.fields!.title, "Landlord Accountant Coventry");
  assert.equal(parsed.fields!.description, "Specialist landlord accounting in Coventry.");
  assert.match(parsed.body, /Why choose us/);
});

test("planFileChanges: CREATE_NEW_PAGE refuses to overwrite a file that already exists at the computed path", () => {
  const adapter = new ConfigurableMarkdownContentAdapter();
  const path = `${DEFAULT_MARKDOWN_ADAPTER_CONFIG.contentDirectory}/landlord-accountant-coventry.md`;
  const existing = new Map([[path, { content: '---\ntitle: "Unrelated existing page"\n---\nSomething else entirely.', sha: "abc123" }]]);
  assert.throws(() => adapter.planFileChanges(baseInput(), existing), ContentAdapterError);
});

test("planFileChanges: OPTIMISE_EXISTING_PAGE patches known frontmatter fields and replaces the body, preserving unrelated fields", () => {
  const adapter = new ConfigurableMarkdownContentAdapter();
  const path = `${DEFAULT_MARKDOWN_ADAPTER_CONFIG.contentDirectory}/landlord-accountant-coventry.md`;
  const existingContent = '---\nauthor: "Jane Doe"\ntitle: "Old Title"\ndescription: "Old description"\nslug: "landlord-accountant-coventry"\n---\n\nOld body content that will be replaced.';
  const existing = new Map([[path, { content: existingContent, sha: "sha-1" }]]);

  const plan = adapter.planFileChanges(baseInput({ contentType: "OPTIMISE_EXISTING_PAGE" }), existing);
  assert.equal(plan.files.length, 1);
  assert.equal(plan.files[0]!.operation, "update");

  const parsed = parseFrontmatter(plan.files[0]!.content);
  assert.equal(parsed.fields!.title, "Landlord Accountant Coventry"); // updated
  assert.equal(parsed.fields!.author, "Jane Doe"); // preserved, unrelated to the known fields
  assert.match(parsed.body, /Why choose us/); // new body
  assert.doesNotMatch(parsed.body, /Old body content/); // old body gone
});

test("planFileChanges: OPTIMISE_EXISTING_PAGE throws when no file was found at the expected path", () => {
  const adapter = new ConfigurableMarkdownContentAdapter();
  assert.throws(() => adapter.planFileChanges(baseInput({ contentType: "OPTIMISE_EXISTING_PAGE" }), new Map()), ContentAdapterError);
});

test("validateFileChange: valid file passes with no errors", () => {
  const adapter = new ConfigurableMarkdownContentAdapter();
  const plan = adapter.planFileChanges(baseInput(), new Map());
  const result = adapter.validateFileChange(plan.files[0]!);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateFileChange: flags a path outside the configured content directory", () => {
  const adapter = new ConfigurableMarkdownContentAdapter();
  const result = adapter.validateFileChange({ path: "elsewhere/page.md", content: '---\ntitle: "x"\n---\nbody', operation: "create" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("outside the configured content directory")));
});

test("validateFileChange: flags a path traversal attempt", () => {
  const adapter = new ConfigurableMarkdownContentAdapter();
  const result = adapter.validateFileChange({ path: "content/pages/../../etc/passwd.md", content: '---\ntitle: "x"\n---\nbody', operation: "create" });
  assert.equal(result.valid, false);
});

test("validateFileChange: flags missing frontmatter and missing title field", () => {
  const adapter = new ConfigurableMarkdownContentAdapter();
  const result = adapter.validateFileChange({ path: "content/pages/x.md", content: "just plain text, no frontmatter", operation: "create" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("no frontmatter block")));
});

test("validateFileChange: flags empty body content", () => {
  const adapter = new ConfigurableMarkdownContentAdapter();
  const result = adapter.validateFileChange({ path: "content/pages/x.md", content: '---\ntitle: "x"\n---\n\n', operation: "create" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("no body content")));
});
