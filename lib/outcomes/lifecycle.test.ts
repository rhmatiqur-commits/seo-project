import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPageLifecycleStage } from "./lifecycle";

test("classifyPageLifecycleStage: no impressions ever, within the discovery grace period -> NEW", () => {
  const stage = classifyPageLifecycleStage({ daysSincePublish: 3, hasEverHadImpressions: false, currentWindowImpressions: 0, impressionsChangePct: null, clicksChangePct: null });
  assert.equal(stage, "NEW");
});

test("classifyPageLifecycleStage: no impressions ever, past the discovery grace period -> DISCOVERED", () => {
  const stage = classifyPageLifecycleStage({ daysSincePublish: 30, hasEverHadImpressions: false, currentWindowImpressions: 0, impressionsChangePct: null, clicksChangePct: null });
  assert.equal(stage, "DISCOVERED");
});

test("classifyPageLifecycleStage: first window with real impressions and no prior window to compare -> VISIBLE", () => {
  const stage = classifyPageLifecycleStage({ daysSincePublish: 20, hasEverHadImpressions: true, currentWindowImpressions: 50, impressionsChangePct: null, clicksChangePct: null });
  assert.equal(stage, "VISIBLE");
});

test("classifyPageLifecycleStage: impressions/clicks growing meaningfully vs the previous window -> GROWING", () => {
  const stage = classifyPageLifecycleStage({ daysSincePublish: 40, hasEverHadImpressions: true, currentWindowImpressions: 200, impressionsChangePct: 40, clicksChangePct: 10 });
  assert.equal(stage, "GROWING");
});

test("classifyPageLifecycleStage: flat vs the previous window -> STABLE", () => {
  const stage = classifyPageLifecycleStage({ daysSincePublish: 60, hasEverHadImpressions: true, currentWindowImpressions: 200, impressionsChangePct: 2, clicksChangePct: 1 });
  assert.equal(stage, "STABLE");
});

test("classifyPageLifecycleStage: impressions and clicks both declining meaningfully -> DECLINING", () => {
  const stage = classifyPageLifecycleStage({ daysSincePublish: 80, hasEverHadImpressions: true, currentWindowImpressions: 40, impressionsChangePct: -35, clicksChangePct: -30 });
  assert.equal(stage, "DECLINING");
});

test("classifyPageLifecycleStage: had impressions before, zero in the current window -> DECLINING", () => {
  const stage = classifyPageLifecycleStage({ daysSincePublish: 90, hasEverHadImpressions: true, currentWindowImpressions: 0, impressionsChangePct: -100, clicksChangePct: -100 });
  assert.equal(stage, "DECLINING");
});
