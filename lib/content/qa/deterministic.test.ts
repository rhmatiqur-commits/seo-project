import { test } from "node:test";
import assert from "node:assert/strict";
import { runDeterministicChecks, type DeterministicQaInput } from "./deterministic";
import type { ContentBrief } from "../brief-types";

function baseBrief(overrides: Partial<ContentBrief> = {}): ContentBrief {
  return {
    organization: { name: "Acme Ltd" },
    website: {
      name: "Acme Site",
      baseUrl: "https://acme.example.com",
      businessDescription: null,
      targetAudience: null,
      brandVoice: null,
      contentConstraints: null,
    },
    opportunity: { id: "opp-1", type: "CREATE_NEW_PAGE", title: "t", description: "d", rationale: "r" },
    detector: null,
    primaryKeyword: { id: "kw-1", text: "landlord accountant" },
    secondaryKeywords: [],
    searchIntent: "COMMERCIAL",
    targetLocation: "GB",
    contentType: "CREATE_NEW_PAGE",
    targetUrl: "https://acme.example.com/landlord-accountant",
    existingPage: null,
    searchConsole: [],
    keywordMetrics: null,
    competitorPages: [],
    contentGaps: [],
    recommendedTopics: [],
    internalLinkOpportunities: [],
    cta: null,
    missingBusinessInfo: [],
    ...overrides,
  };
}

const GOOD_METADATA = {
  seoTitle: "Landlord Accountant Services in Coventry | Acme",
  metaDescription: "Specialist landlord accountant services in Coventry, helping landlords stay compliant and save time on their annual tax return.",
  suggestedUrl: "https://acme.example.com/landlord-accountant",
  h1: "Landlord Accountant Services",
};

function longEnoughBody(extra = ""): string {
  const filler = Array.from({ length: 60 }, (_, i) => `This is genuinely useful sentence number ${i} covering a related, unrelated filler topic in some depth.`).join(" ");
  return `## Overview\n\nOur landlord accountant support helps busy landlords stay compliant. ${filler}\n\n## Why it matters\n\n${extra}`;
}

test("a well-formed draft passes every blocking check", () => {
  const input: DeterministicQaInput = {
    body: longEnoughBody(),
    metadata: GOOD_METADATA,
    brief: baseBrief(),
    knownPageUrls: ["https://acme.example.com/landlord-accountant"],
  };
  const results = runDeterministicChecks(input);
  const blockingFailures = results.filter((r) => r.severity === "blocking" && !r.passed);
  assert.deepEqual(blockingFailures, []);
});

test("empty/very short content fails the length check", () => {
  const results = runDeterministicChecks({
    body: "Too short.",
    metadata: GOOD_METADATA,
    brief: baseBrief(),
    knownPageUrls: [],
  });
  const check = results.find((r) => r.id === "empty_or_short_content");
  assert.equal(check?.passed, false);
});

test("missing primary keyword fails the presence check", () => {
  const results = runDeterministicChecks({
    body: longEnoughBody().replace(/landlord accountant/gi, "generic topic"),
    metadata: GOOD_METADATA,
    brief: baseBrief(),
    knownPageUrls: [],
  });
  const check = results.find((r) => r.id === "primary_keyword_presence");
  assert.equal(check?.passed, false);
});

test("placeholder text is caught and blocking", () => {
  const results = runDeterministicChecks({
    body: longEnoughBody("[insert client testimonial here]"),
    metadata: GOOD_METADATA,
    brief: baseBrief(),
    knownPageUrls: [],
  });
  const check = results.find((r) => r.id === "placeholder_text");
  assert.equal(check?.passed, false);
});

test("a link to a page that doesn't exist fails internal_link_validity (blocking)", () => {
  const results = runDeterministicChecks({
    body: longEnoughBody("See our [fabricated page](/does-not-exist).") ,
    metadata: GOOD_METADATA,
    brief: baseBrief(),
    knownPageUrls: ["https://acme.example.com/landlord-accountant"],
  });
  const check = results.find((r) => r.id === "internal_link_validity");
  assert.equal(check?.passed, false);
});

test("a link to a real known page passes internal_link_validity", () => {
  const results = runDeterministicChecks({
    body: longEnoughBody("See our [other services](/services)."),
    metadata: GOOD_METADATA,
    brief: baseBrief(),
    knownPageUrls: ["https://acme.example.com/landlord-accountant", "/services"],
  });
  const check = results.find((r) => r.id === "internal_link_validity");
  assert.equal(check?.passed, true);
});

test("keyword stuffing is caught when density is excessive", () => {
  const stuffed = "landlord accountant ".repeat(40) + longEnoughBody();
  const results = runDeterministicChecks({
    body: stuffed,
    metadata: GOOD_METADATA,
    brief: baseBrief(),
    knownPageUrls: [],
  });
  const check = results.find((r) => r.id === "keyword_stuffing");
  assert.equal(check?.passed, false);
});

test("an invented pricing claim trips the business-claim safeguard", () => {
  const results = runDeterministicChecks({
    body: longEnoughBody("Our service starts from £49 per month, guaranteed savings."),
    metadata: GOOD_METADATA,
    brief: baseBrief(),
    knownPageUrls: [],
  });
  const failures = results.filter((r) => r.id.startsWith("business_claim_safeguard") && !r.passed);
  assert.ok(failures.length > 0);
});

test("recommended topics with zero coverage is blocking, partial coverage is only a warning", () => {
  const brief = baseBrief({ recommendedTopics: ["tax relief", "self assessment"] });
  const zeroCoverage = runDeterministicChecks({
    body: longEnoughBody(),
    metadata: GOOD_METADATA,
    brief,
    knownPageUrls: [],
  });
  const zeroCheck = zeroCoverage.find((r) => r.id === "required_topic_coverage");
  assert.equal(zeroCheck?.passed, false);
  assert.equal(zeroCheck?.severity, "blocking");

  const partialCoverage = runDeterministicChecks({
    body: longEnoughBody("This covers tax relief in detail."),
    metadata: GOOD_METADATA,
    brief,
    knownPageUrls: [],
  });
  const partialCheck = partialCoverage.find((r) => r.id === "required_topic_coverage");
  assert.equal(partialCheck?.severity, "warning");
});
