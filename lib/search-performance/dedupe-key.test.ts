import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDedupeKey } from "./dedupe-key";

test("buildDedupeKey is stable for identical inputs (duplicate-opportunity prevention)", () => {
  const input = { detectorType: "PAGE_TWO_OPPORTUNITY" as const, keywordId: "kw-1", pageId: "pg-1", relatedPageId: null };
  assert.equal(buildDedupeKey(input), buildDedupeKey({ ...input }));
});

test("buildDedupeKey differs when the detector type differs", () => {
  const base = { keywordId: "kw-1", pageId: "pg-1" };
  assert.notEqual(
    buildDedupeKey({ detectorType: "PAGE_TWO_OPPORTUNITY", ...base }),
    buildDedupeKey({ detectorType: "MISSING_PAGE", ...base })
  );
});

test("buildDedupeKey differs when the keyword differs", () => {
  const base = { detectorType: "DECLINING_KEYWORD" as const, pageId: null };
  assert.notEqual(buildDedupeKey({ ...base, keywordId: "kw-1" }), buildDedupeKey({ ...base, keywordId: "kw-2" }));
});

test("buildDedupeKey treats null and undefined keyword/page ids the same way", () => {
  const a = buildDedupeKey({ detectorType: "CONTENT_GAP", keywordId: null, pageId: undefined });
  const b = buildDedupeKey({ detectorType: "CONTENT_GAP" });
  assert.equal(a, b);
});

test("buildDedupeKey distinguishes internal-link opportunities by the related page", () => {
  const base = { detectorType: "INTERNAL_LINK_OPPORTUNITY" as const, pageId: "pg-target" };
  assert.notEqual(
    buildDedupeKey({ ...base, relatedPageId: "pg-source-a" }),
    buildDedupeKey({ ...base, relatedPageId: "pg-source-b" })
  );
});
