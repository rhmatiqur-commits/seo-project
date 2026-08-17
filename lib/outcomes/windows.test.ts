import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBaselineWindowDays, computeBaselineDateRange, isMeasurementWindowDue, dueMeasurementWindows, computeMeasurementDateRange } from "./windows";

test("pickBaselineWindowDays: 28+ days of history -> 28-day default window", () => {
  assert.equal(pickBaselineWindowDays(40), 28);
  assert.equal(pickBaselineWindowDays(28), 28);
});

test("pickBaselineWindowDays: between 7 and 28 days of history -> 7-day fallback window", () => {
  assert.equal(pickBaselineWindowDays(7), 7);
  assert.equal(pickBaselineWindowDays(20), 7);
});

test("pickBaselineWindowDays: fewer than 7 days of history -> null (insufficient, skip baseline capture)", () => {
  assert.equal(pickBaselineWindowDays(3), null);
  assert.equal(pickBaselineWindowDays(0), null);
});

test("computeBaselineDateRange: ends the day before the action, spans the requested window", () => {
  const executedAt = new Date("2026-08-15T00:00:00.000Z");
  const range = computeBaselineDateRange(executedAt, 7);
  assert.equal(range.end, "2026-08-14");
  assert.equal(range.start, "2026-08-08");
});

test("isMeasurementWindowDue: false before the window elapses, true once it has", () => {
  const executedAt = new Date("2026-08-01T00:00:00.000Z");
  assert.equal(isMeasurementWindowDue(executedAt, 7, new Date("2026-08-06T00:00:00.000Z")), false);
  assert.equal(isMeasurementWindowDue(executedAt, 7, new Date("2026-08-08T00:00:00.000Z")), true);
  assert.equal(isMeasurementWindowDue(executedAt, 7, new Date("2026-08-08T00:00:00.000Z")), true);
});

test("isMeasurementWindowDue: never called successful before its window elapses (exact boundary)", () => {
  const executedAt = new Date("2026-08-01T00:00:00.000Z");
  const exactlyDue = new Date(executedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  assert.equal(isMeasurementWindowDue(executedAt, 7, exactlyDue), true);
  const oneMsEarly = new Date(exactlyDue.getTime() - 1);
  assert.equal(isMeasurementWindowDue(executedAt, 7, oneMsEarly), false);
});

test("dueMeasurementWindows: only returns windows that have actually elapsed, ascending", () => {
  const executedAt = new Date("2026-07-01T00:00:00.000Z");
  const now = new Date("2026-07-16T00:00:00.000Z"); // 15 days later
  assert.deepEqual(dueMeasurementWindows(executedAt, now, [7, 14, 28, 56]), [7, 14]);
});

test("computeMeasurementDateRange: starts on the execution date, spans the requested window", () => {
  const executedAt = new Date("2026-08-01T00:00:00.000Z");
  const range = computeMeasurementDateRange(executedAt, 7);
  assert.equal(range.start, "2026-08-01");
  assert.equal(range.end, "2026-08-07");
});
