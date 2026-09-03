import { test } from "node:test";
import assert from "node:assert/strict";
import { getComparisonWindow, summarizeSearchConsoleRows, computeDelta, buildDailySearchConsoleSeries, DEFAULT_COMPARISON_WINDOW_DAYS } from "./delta";

test("DEFAULT_COMPARISON_WINDOW_DAYS is 28", () => {
  assert.equal(DEFAULT_COMPARISON_WINDOW_DAYS, 28);
});

test("getComparisonWindow: current window ends exactly at 'now'", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const win = getComparisonWindow(now);
  assert.equal(win.currentEnd, "2026-08-22");
});

test("getComparisonWindow: current window starts 28 days before now by default", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const win = getComparisonWindow(now);
  assert.equal(win.currentStart, "2026-07-25");
});

test("getComparisonWindow: previous window is the same length, immediately before the current window with no gap or overlap", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const win = getComparisonWindow(now);
  // previousEnd should be exactly one day before currentStart
  const currentStart = new Date(win.currentStart);
  const previousEnd = new Date(win.previousEnd);
  const gapDays = (currentStart.getTime() - previousEnd.getTime()) / (24 * 60 * 60 * 1000);
  assert.equal(gapDays, 1);
});

test("getComparisonWindow: respects a custom window length", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const win = getComparisonWindow(now, 7);
  assert.equal(win.currentStart, "2026-08-15");
});

test("summarizeSearchConsoleRows: sums clicks and impressions across rows", () => {
  const result = summarizeSearchConsoleRows([
    { clicks: 10, impressions: 100, position: 5 },
    { clicks: 5, impressions: 50, position: 8 },
  ]);
  assert.equal(result.clicks, 15);
  assert.equal(result.impressions, 150);
});

test("summarizeSearchConsoleRows: position is impression-weighted, not a plain average", () => {
  // row A: position 2 with 90 impressions, row B: position 20 with 10 impressions
  // plain average would be 11; impression-weighted should be much closer to 2
  const result = summarizeSearchConsoleRows([
    { clicks: 0, impressions: 90, position: 2 },
    { clicks: 0, impressions: 10, position: 20 },
  ]);
  assert.equal(result.position, 3.8);
});

test("summarizeSearchConsoleRows: rows with a null position are excluded from the position average but still count toward clicks/impressions", () => {
  const result = summarizeSearchConsoleRows([
    { clicks: 3, impressions: 30, position: null },
    { clicks: 2, impressions: 20, position: 5 },
  ]);
  assert.equal(result.clicks, 5);
  assert.equal(result.impressions, 50);
  assert.equal(result.position, 5);
});

test("summarizeSearchConsoleRows: empty input produces zero counts and a null position", () => {
  const result = summarizeSearchConsoleRows([]);
  assert.deepEqual(result, { clicks: 0, impressions: 0, position: null });
});

test("computeDelta: previous zero, current positive -> 'New'", () => {
  assert.deepEqual(computeDelta(10, 0), { text: "New", tone: "flat" });
});

test("computeDelta: both zero -> flat dash, not 'New'", () => {
  assert.deepEqual(computeDelta(0, 0), { text: "-", tone: "flat" });
});

test("computeDelta: increase produces a '+' percentage with an 'up' tone", () => {
  const result = computeDelta(120, 100);
  assert.equal(result.tone, "up");
  assert.equal(result.text, "+20%");
});

test("computeDelta: decrease produces a negative percentage with a 'down' tone", () => {
  const result = computeDelta(80, 100);
  assert.equal(result.tone, "down");
  assert.equal(result.text, "-20%");
});

test("computeDelta: no change -> 'No change' with a flat tone", () => {
  assert.deepEqual(computeDelta(100, 100), { text: "No change", tone: "flat" });
});

test("buildDailySearchConsoleSeries: one point per day across the range, inclusive of both ends", () => {
  const series = buildDailySearchConsoleSeries([], "2026-08-01", "2026-08-04");
  assert.equal(series.length, 4);
  assert.deepEqual(
    series.map((p) => p.date),
    ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"]
  );
});

test("buildDailySearchConsoleSeries: a day with no rows is zero, not skipped", () => {
  const series = buildDailySearchConsoleSeries([], "2026-08-01", "2026-08-02");
  assert.deepEqual(series, [
    { date: "2026-08-01", clicks: 0, impressions: 0 },
    { date: "2026-08-02", clicks: 0, impressions: 0 },
  ]);
});

test("buildDailySearchConsoleSeries: multiple rows on the same date (different queries/pages) are summed", () => {
  const series = buildDailySearchConsoleSeries(
    [
      { date: "2026-08-01", clicks: 3, impressions: 30, position: 4 },
      { date: "2026-08-01", clicks: 2, impressions: 10, position: 8 },
    ],
    "2026-08-01",
    "2026-08-01"
  );
  assert.deepEqual(series, [{ date: "2026-08-01", clicks: 5, impressions: 40 }]);
});

test("buildDailySearchConsoleSeries: a single-day range returns exactly one point", () => {
  const series = buildDailySearchConsoleSeries([], "2026-08-05", "2026-08-05");
  assert.deepEqual(series, [{ date: "2026-08-05", clicks: 0, impressions: 0 }]);
});
