import { test } from "node:test";
import assert from "node:assert/strict";
import { isContentEligibleOpportunityType } from "./eligibility";
import type { OpportunityType } from "@/lib/supabase/types";

test("CREATE_NEW_PAGE and OPTIMISE_EXISTING_PAGE are content-eligible", () => {
  assert.equal(isContentEligibleOpportunityType("CREATE_NEW_PAGE"), true);
  assert.equal(isContentEligibleOpportunityType("OPTIMISE_EXISTING_PAGE"), true);
});

test("non-content opportunity types are not eligible", () => {
  const ineligible: OpportunityType[] = [
    "TECHNICAL_FIX",
    "INTERNAL_LINKING",
    "RESEARCH_REQUIRED",
    "IMPROVE_CTR",
    "INVESTIGATE_DECLINE",
    "INVESTIGATE_OPPORTUNITY",
    "IMPROVE_INTERNAL_LINKING",
  ];
  for (const type of ineligible) {
    assert.equal(isContentEligibleOpportunityType(type), false, `expected ${type} to be ineligible`);
  }
});
