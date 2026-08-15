import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchAnalyticsRow, normalizeSearchAnalyticsRows } from "./normalize";

test("normalizeSearchAnalyticsRow maps a full raw row to the stored shape", () => {
  const row = { keys: ["2026-08-01", "cv builder uk", "https://cvcentral.io/cv-builder"], clicks: 12, impressions: 340, ctr: 0.0353, position: 4.2 };
  assert.deepEqual(normalizeSearchAnalyticsRow(row), {
    date: "2026-08-01",
    query: "cv builder uk",
    page_url: "https://cvcentral.io/cv-builder",
    clicks: 12,
    impressions: 340,
    ctr: 0.0353,
    position: 4.2,
  });
});

test("normalizeSearchAnalyticsRow defaults missing numeric fields to 0/null", () => {
  const row = { keys: ["2026-08-01", "cv builder uk", "https://cvcentral.io/cv-builder"] };
  assert.deepEqual(normalizeSearchAnalyticsRow(row), {
    date: "2026-08-01",
    query: "cv builder uk",
    page_url: "https://cvcentral.io/cv-builder",
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: null,
  });
});

test("normalizeSearchAnalyticsRow returns null when the date dimension is missing", () => {
  assert.equal(normalizeSearchAnalyticsRow({ keys: [] }), null);
  assert.equal(normalizeSearchAnalyticsRow({}), null);
});

test("normalizeSearchAnalyticsRow handles a dimension subset (no query/page requested)", () => {
  const row = { keys: ["2026-08-01"], clicks: 5, impressions: 50, ctr: 0.1, position: 8 };
  assert.deepEqual(normalizeSearchAnalyticsRow(row, ["date"]), {
    date: "2026-08-01",
    query: null,
    page_url: null,
    clicks: 5,
    impressions: 50,
    ctr: 0.1,
    position: 8,
  });
});

test("normalizeSearchAnalyticsRows drops invalid rows but keeps valid ones", () => {
  const rows = [
    { keys: ["2026-08-01", "cv builder", "https://cvcentral.io/a"], clicks: 3, impressions: 10, ctr: 0.3, position: 2 },
    { keys: [] },
    { keys: ["2026-08-02", "cv template", "https://cvcentral.io/b"], clicks: 1, impressions: 5, ctr: 0.2, position: 6 },
  ];
  const result = normalizeSearchAnalyticsRows(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.date, "2026-08-01");
  assert.equal(result[1]?.date, "2026-08-02");
});
