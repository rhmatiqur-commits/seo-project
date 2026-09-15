import { test } from "node:test";
import assert from "node:assert/strict";
import { isRateLimited } from "./rate-limit";

test("allows requests under the limit", () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 5; i++) {
    assert.equal(isRateLimited(key, 1_000_000), false);
  }
});

test("blocks once the limit is exceeded within the window", () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 30; i++) {
    assert.equal(isRateLimited(key, 2_000_000), false);
  }
  assert.equal(isRateLimited(key, 2_000_000), true, "the 31st request in the same instant should be blocked");
});

test("allows requests again once the window has passed", () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 30; i++) {
    assert.equal(isRateLimited(key, 3_000_000), false);
  }
  assert.equal(isRateLimited(key, 3_000_000), true);
  // 61 seconds later -- outside the 60s window, so the earlier hits no
  // longer count against the limit.
  assert.equal(isRateLimited(key, 3_000_000 + 61_000), false);
});

test("tracks separate keys independently", () => {
  const keyA = `test-a-${Math.random()}`;
  const keyB = `test-b-${Math.random()}`;
  for (let i = 0; i < 30; i++) {
    assert.equal(isRateLimited(keyA, 4_000_000), false);
  }
  assert.equal(isRateLimited(keyA, 4_000_000), true);
  // keyB has its own budget, untouched by keyA's usage.
  assert.equal(isRateLimited(keyB, 4_000_000), false);
});
