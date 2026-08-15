import { test } from "node:test";
import assert from "node:assert/strict";
import { titleRules, headingRules, thinContentRule } from "./titles-and-meta";
import type { PageForAudit, WebsiteForAudit } from "@/lib/audit/types";

function fakeWebsite(): WebsiteForAudit {
  return {
    id: "w1",
    organization_id: "o1",
    name: "Test Site",
    base_url: "https://example.com",
    sitemap_url: null,
    robots_txt_available: true,
    sitemap_available: true,
    crawl_max_pages: 50,
    crawl_max_depth: 4,
    crawl_frequency_days: 7,
    next_crawl_at: null,
    status: "active",
    last_crawled_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function fakePage(overrides: Partial<PageForAudit> = {}): PageForAudit {
  return {
    id: overrides.id ?? "p1",
    website_id: "w1",
    url: "https://example.com/",
    url_hash: "hash1",
    path: "/",
    depth: 0,
    http_status: 200,
    redirect_chain: null,
    title: "A Perfectly Reasonable Title",
    meta_description: "A reasonable meta description that is long enough to be useful for search snippets.",
    h1: "Heading",
    headings: [{ level: 1, text: "Heading" }],
    word_count: 400,
    canonical_url: null,
    is_noindex: false,
    has_structured_data: false,
    structured_data_types: [],
    images_count: 0,
    images_missing_alt_count: 0,
    internal_links_count: 0,
    external_links_count: 0,
    is_orphan: false,
    raw_meta: {},
    first_seen_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-01-01T00:00:00Z",
    crawled_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("titleRules flags a missing title", () => {
  const page = fakePage({ title: null });
  const issues = titleRules({ website: fakeWebsite(), pages: [page], links: [] });
  assert.ok(issues.some((i) => i.issue_type === "MISSING_TITLE"));
});

test("titleRules flags duplicate titles across pages", () => {
  const a = fakePage({ id: "a", url: "https://example.com/a", title: "Same Title Everywhere" });
  const b = fakePage({ id: "b", url: "https://example.com/b", title: "Same Title Everywhere" });
  const issues = titleRules({ website: fakeWebsite(), pages: [a, b], links: [] });
  assert.ok(issues.some((i) => i.issue_type === "DUPLICATE_TITLE"));
});

test("titleRules does not flag a well-formed unique title", () => {
  const page = fakePage();
  const issues = titleRules({ website: fakeWebsite(), pages: [page], links: [] });
  assert.equal(issues.length, 0);
});

test("headingRules flags missing and multiple H1s", () => {
  const noH1 = fakePage({ id: "a", headings: [{ level: 2, text: "Sub" }] });
  const twoH1 = fakePage({ id: "b", headings: [{ level: 1, text: "One" }, { level: 1, text: "Two" }] });
  const issues = headingRules({ website: fakeWebsite(), pages: [noH1, twoH1], links: [] });
  assert.ok(issues.some((i) => i.issue_type === "MISSING_H1" && i.page_id === "a"));
  assert.ok(issues.some((i) => i.issue_type === "MULTIPLE_H1" && i.page_id === "b"));
});

test("thinContentRule flags pages under the word threshold", () => {
  const thin = fakePage({ word_count: 50 });
  const issues = thinContentRule({ website: fakeWebsite(), pages: [thin], links: [] });
  assert.ok(issues.some((i) => i.issue_type === "THIN_CONTENT"));
});
