import { test } from "node:test";
import assert from "node:assert/strict";
import { brokenPagesRule, brokenInternalLinksRule, orphanPagesRule } from "./links";
import type { LinkForAudit, PageForAudit, WebsiteForAudit } from "@/lib/audit/types";

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
    keyword_discovery_frequency_days: 30,
    next_keyword_discovery_at: null,
    search_console_sync_frequency_days: 1,
    next_search_console_sync_at: null,
    serp_fetch_frequency_days: 7,
    next_serp_fetch_at: null,
    default_serp_location: null,
    status: "active",
    last_crawled_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function fakePage(overrides: Partial<PageForAudit> = {}): PageForAudit {
  return {
    id: "p1",
    website_id: "w1",
    url: "https://example.com/",
    url_hash: "hash1",
    path: "/",
    depth: 0,
    http_status: 200,
    redirect_chain: null,
    title: "Title",
    meta_description: "Description",
    h1: "H1",
    headings: [],
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

function fakeLink(overrides: Partial<LinkForAudit> = {}): LinkForAudit {
  return {
    id: "l1",
    website_id: "w1",
    source_page_id: "p1",
    target_url: "https://example.com/broken",
    target_page_id: "p2",
    anchor_text: "link",
    is_internal: true,
    is_external: false,
    http_status: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("brokenPagesRule flags 4xx/5xx pages by severity", () => {
  const notFound = fakePage({ id: "a", http_status: 404 });
  const serverError = fakePage({ id: "b", http_status: 500 });
  const ok = fakePage({ id: "c", http_status: 200 });
  const issues = brokenPagesRule({ website: fakeWebsite(), pages: [notFound, serverError, ok], links: [] });
  assert.equal(issues.length, 2);
  assert.equal(issues.find((i) => i.page_id === "a")?.severity, "high");
  assert.equal(issues.find((i) => i.page_id === "b")?.severity, "critical");
});

test("brokenInternalLinksRule flags links pointing at broken pages", () => {
  const source = fakePage({ id: "p1", http_status: 200 });
  const brokenTarget = fakePage({ id: "p2", url: "https://example.com/gone", http_status: 404 });
  const link = fakeLink({ target_page_id: "p2" });
  const issues = brokenInternalLinksRule({ website: fakeWebsite(), pages: [source, brokenTarget], links: [link] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.issue_type, "BROKEN_INTERNAL_LINK");
});

test("orphanPagesRule flags pages marked is_orphan", () => {
  const orphan = fakePage({ id: "a", is_orphan: true });
  const linked = fakePage({ id: "b", is_orphan: false });
  const issues = orphanPagesRule({ website: fakeWebsite(), pages: [orphan, linked], links: [] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.page_id, "a");
});
