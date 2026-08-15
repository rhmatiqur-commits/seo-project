import { test } from "node:test";
import assert from "node:assert/strict";
import { getExpectedCtrForPosition, ctrGapPercent } from "./expected-ctr";

test("getExpectedCtrForPosition decreases as position gets worse", () => {
  const pos1 = getExpectedCtrForPosition(1);
  const pos5 = getExpectedCtrForPosition(5);
  const pos20 = getExpectedCtrForPosition(20);
  assert.ok(pos1 > pos5);
  assert.ok(pos5 > pos20);
});

test("getExpectedCtrForPosition rounds fractional positions", () => {
  assert.equal(getExpectedCtrForPosition(4.6), getExpectedCtrForPosition(5));
});

test("getExpectedCtrForPosition falls back for positions beyond the table", () => {
  assert.equal(getExpectedCtrForPosition(50), getExpectedCtrForPosition(21));
});

test("ctrGapPercent is 0 when actual CTR meets or beats the benchmark", () => {
  const expected = getExpectedCtrForPosition(10);
  assert.equal(ctrGapPercent(expected, 10), 0);
  assert.equal(ctrGapPercent(expected * 2, 10), 0);
});

test("ctrGapPercent is ~100 when actual CTR is zero despite impressions", () => {
  assert.equal(ctrGapPercent(0, 10), 100);
});

test("ctrGapPercent reflects a partial shortfall proportionally", () => {
  const expected = getExpectedCtrForPosition(5);
  const halfActual = expected / 2;
  assert.equal(ctrGapPercent(halfActual, 5), 50);
});
