import { test } from "node:test";
import assert from "node:assert/strict";
import { getComparisonWindow, summarizeSearchConsoleRows, computeDelta, DEFAULT_COMPARISON_WINDOW_DAYS } from "./delta";

test("DEFAULT_COMPARISON_WINDOW_DAYS is 28, matching Reports' original window", () => {
  assert.equal(DEFAULT_COMPARISON_WINDOW_DAYS, 28);
});

test("getComparisonWindow: current window ends today, spans exactly windowDays back", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");
  const w = getComparisonWindow(28, now);
  assert.equal(w.currentEnd, "2026-08-18");
  assert.equal(w.currentStart, "2026-07-21"); // 28 days before
});

test("getComparisonWindow: previous window immediately precedes the current one, same length, no overlap", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");
  const w = getComparisonWindow(28, now);
  assert.equal(w.previousEnd, "2026-07-20"); // the day before currentStart
  assert.equal(w.previousStart, "2026-06-22"); // 28 days before previousEnd
});

test("getComparisonWindow: a smaller window produces proportionally smaller ranges", () => {
  const now = new Date("2026-08-18T00:00:00.000Z");
  const w = getComparisonWindow(7, now);
  assert.equal(w.currentStart, "2026-08-11");
  assert.equal(w.previousEnd, "2026-08-10");
  assert.equal(w.previousStart, "2026-08-03");
});

test("summarizeSearchConsoleRows: sums clicks and impressions across rows", () => {
  const result = summarizeSearchConsoleRows([
    { clicks: 10, impressions: 100, position: 5 },
    { clicks: 5, impressions: 50, position: 8 },
  ]);
  assert.equal(result.clicks, 15);
  assert.equal(result.impressions, 150);
});

test("summarizeSearchConsoleRows: position is impressions-weighted, not a plain average", () => {
  // 900 impressions at position 2, 100 impressions at position 20 -> weighted mean close to 2, not 11
  const result = summarizeSearchConsoleRows([
    { clicks: 1, impressions: 900, position: 2 },
    { clicks: 1, impressions: 100, position: 20 },
  ]);
  assert.equal(result.position, 3.8); // (900*2 + 100*20) / 1000 = 3.8
});

test("summarizeSearchConsoleRows: rows with a null position are excluded from the position average, not treated as 0", () => {
  const result = summarizeSearchConsoleRows([
    { clicks: 1, impressions: 100, position: null },
    { clicks: 1, impressions: 100, position: 10 },
  ]);
  assert.equal(result.position, 10);
});

test("summarizeSearchConsoleRows: empty input returns zeros and a null position", () => {
  assert.deepEqual(summarizeSearchConsoleRows([]), { clicks: 0, impressions: 0, position: null });
});

test("computeDelta: previous 0, current > 0 -> 'New', flat tone", () => {
  const d = computeDelta(10, 0);
  assert.equal(d.text, "New");
  assert.equal(d.tone, "flat");
});

test("computeDelta: previous 0, current 0 -> '-', flat tone", () => {
  const d = computeDelta(0, 0);
  assert.equal(d.text, "-");
  assert.equal(d.tone, "flat");
});

test("computeDelta: an increase is reported as a positive percentage with 'up' tone", () => {
  const d = computeDelta(150, 100);
  assert.equal(d.text, "+50%");
  assert.equal(d.tone, "up");
});

test("computeDelta: a decrease is reported as a negative percentage with 'down' tone", () => {
  const d = computeDelta(50, 100);
  assert.equal(d.text, "-50%");
  assert.equal(d.tone, "down");
});

test("computeDelta: no change at all -> 'No change', flat tone", () => {
  const d = computeDelta(100, 100);
  assert.equal(d.text, "No change");
  assert.equal(d.tone, "flat");
});
