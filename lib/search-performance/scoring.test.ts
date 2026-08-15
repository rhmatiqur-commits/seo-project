import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSearchPerformanceScore,
  trafficSignalFromImpressions,
  getEffortForAction,
  shouldPromoteSearchPerformanceOpportunity,
} from "./scoring";

test("computeSearchPerformanceScore: higher business/commercial relevance increases the score", () => {
  const low = computeSearchPerformanceScore({ businessRelevance: 2, commercialValue: 2, opportunityMagnitude: 3, trafficSignal: 3, effort: 3 });
  const high = computeSearchPerformanceScore({ businessRelevance: 5, commercialValue: 5, opportunityMagnitude: 3, trafficSignal: 3, effort: 3 });
  assert.ok(high > low);
});

test("computeSearchPerformanceScore: higher effort reduces the score", () => {
  const cheap = computeSearchPerformanceScore({ businessRelevance: 4, commercialValue: 4, opportunityMagnitude: 4, trafficSignal: 4, effort: 1 });
  const expensive = computeSearchPerformanceScore({ businessRelevance: 4, commercialValue: 4, opportunityMagnitude: 4, trafficSignal: 4, effort: 5 });
  assert.ok(expensive < cheap);
});

test("computeSearchPerformanceScore never returns a negative score", () => {
  const score = computeSearchPerformanceScore({ businessRelevance: 1, commercialValue: 1, opportunityMagnitude: 1, trafficSignal: 1, effort: 5 });
  assert.ok(score >= 0);
});

test("trafficSignalFromImpressions increases with impressions but stays within 1-5", () => {
  assert.equal(trafficSignalFromImpressions(0), 1);
  const low = trafficSignalFromImpressions(50);
  const high = trafficSignalFromImpressions(50000);
  assert.ok(high > low);
  assert.ok(high <= 5);
  assert.ok(low >= 1);
});

test("getEffortForAction returns the fixed constant for known actions and a default otherwise", () => {
  assert.equal(getEffortForAction("IMPROVE_INTERNAL_LINKING"), 1);
  assert.equal(getEffortForAction("CREATE_NEW_PAGE"), 4);
  assert.equal(getEffortForAction("TECHNICAL_FIX"), 3);
});

test("shouldPromoteSearchPerformanceOpportunity: promotable action above threshold, not yet promoted -> true", () => {
  assert.equal(
    shouldPromoteSearchPerformanceOpportunity({ recommendedAction: "CREATE_NEW_PAGE", opportunityScore: 10, seoOpportunityId: null }),
    true
  );
});

test("shouldPromoteSearchPerformanceOpportunity: already promoted -> false (duplicate-task prevention)", () => {
  assert.equal(
    shouldPromoteSearchPerformanceOpportunity({ recommendedAction: "CREATE_NEW_PAGE", opportunityScore: 10, seoOpportunityId: "existing-task-id" }),
    false
  );
});

test("shouldPromoteSearchPerformanceOpportunity: below threshold -> false", () => {
  assert.equal(
    shouldPromoteSearchPerformanceOpportunity({ recommendedAction: "CREATE_NEW_PAGE", opportunityScore: 2, seoOpportunityId: null }),
    false
  );
});

test("shouldPromoteSearchPerformanceOpportunity: INVESTIGATE_OPPORTUNITY is never promoted regardless of score", () => {
  assert.equal(
    shouldPromoteSearchPerformanceOpportunity({ recommendedAction: "INVESTIGATE_OPPORTUNITY", opportunityScore: 20, seoOpportunityId: null }),
    false
  );
});
