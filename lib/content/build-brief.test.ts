import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContentBrief, suggestUrlSlug, type BuildContentBriefInput } from "./build-brief";

function baseInput(overrides: Partial<BuildContentBriefInput> = {}): BuildContentBriefInput {
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
    opportunity: {
      id: "opp-1",
      type: "CREATE_NEW_PAGE",
      title: "Create page for landlord accountant Coventry",
      description: "desc",
      rationale: "rationale",
    },
    detector: null,
    primaryKeyword: { id: "kw-1", text: "landlord accountant Coventry", searchIntent: "COMMERCIAL", location: "GB" },
    secondaryKeywords: [],
    existingPage: null,
    otherPages: [],
    searchConsoleRows: [],
    keywordMetrics: null,
    competitorPages: [],
    ...overrides,
  };
}

test("suggestUrlSlug produces a lowercase hyphenated slug under the base URL", () => {
  assert.equal(suggestUrlSlug("Landlord Accountant Coventry", "https://acme.example.com/"), "https://acme.example.com/landlord-accountant-coventry");
});

test("CREATE_NEW_PAGE: targetUrl is a recommended slug, existingPage is null", () => {
  const brief = buildContentBrief(baseInput());
  assert.equal(brief.targetUrl, "https://acme.example.com/landlord-accountant-coventry");
  assert.equal(brief.existingPage, null);
  assert.equal(brief.contentType, "CREATE_NEW_PAGE");
});

test("OPTIMISE_EXISTING_PAGE: targetUrl is the real existing page URL, never a guessed slug", () => {
  const brief = buildContentBrief(
    baseInput({
      opportunity: { id: "opp-2", type: "OPTIMISE_EXISTING_PAGE", title: "t", description: "d", rationale: "r" },
      existingPage: {
        id: "page-1",
        url: "https://acme.example.com/existing",
        title: "Existing title",
        metaDescription: null,
        h1: "Existing H1",
        headings: ["Heading one"],
        wordCount: 400,
      },
    })
  );
  assert.equal(brief.targetUrl, "https://acme.example.com/existing");
  assert.equal(brief.existingPage?.url, "https://acme.example.com/existing");
});

test("missingBusinessInfo flags every unconfigured business field, never invents a value", () => {
  const brief = buildContentBrief(baseInput());
  assert.ok(brief.website.businessDescription === null);
  assert.ok(brief.missingBusinessInfo.some((m) => m.includes("business_description")));
  assert.ok(brief.missingBusinessInfo.some((m) => m.includes("target_audience")));
  assert.ok(brief.missingBusinessInfo.some((m) => m.includes("brand_voice")));
  assert.ok(brief.missingBusinessInfo.some((m) => m.includes("cta")));
});

test("missingBusinessInfo omits configured fields", () => {
  const brief = buildContentBrief(
    baseInput({
      website: {
        name: "Acme Site",
        baseUrl: "https://acme.example.com",
        businessDescription: "We do landlord accounting.",
        targetAudience: "Landlords in Coventry",
        brandVoice: "Friendly, plain-English",
        contentConstraints: "Never promise guaranteed tax savings.",
      },
    })
  );
  assert.ok(!brief.missingBusinessInfo.some((m) => m.includes("business_description")));
  assert.ok(!brief.missingBusinessInfo.some((m) => m.includes("target_audience")));
});

test("internalLinkOpportunities only includes real pages scoring above the relevance bar, never invented URLs", () => {
  const brief = buildContentBrief(
    baseInput({
      otherPages: [
        { id: "p1", url: "/landlord-accountant-services", title: "Landlord Accountant Services", h1: null, headings: [], metaDescription: null },
        { id: "p2", url: "/unrelated-topic", title: "Completely Unrelated Topic", h1: null, headings: [], metaDescription: null },
      ],
    })
  );
  const urls = brief.internalLinkOpportunities.map((l) => l.sourcePageUrl);
  assert.ok(urls.includes("/landlord-accountant-services"));
  assert.ok(!urls.includes("/unrelated-topic"));
});

test("contentGaps includes the detector's own reasoning when a detector context exists", () => {
  const brief = buildContentBrief(
    baseInput({
      detector: { detectorType: "COMPETITOR_CONTENT_GAP", signals: { competitorDomain: "rival.com" }, reasoning: "rival.com ranks #2, client has no page." },
    })
  );
  assert.ok(brief.contentGaps.includes("rival.com ranks #2, client has no page."));
});

test("recommendedTopics aggregates deduped competitor major topics, bounded", () => {
  const brief = buildContentBrief(
    baseInput({
      competitorPages: [
        { domain: "a.com", url: "https://a.com/x", title: "A", wordCount: 500, majorTopics: ["tax relief", "self assessment"] },
        { domain: "b.com", url: "https://b.com/y", title: "B", wordCount: 600, majorTopics: ["self assessment", "hmo licensing"] },
      ],
    })
  );
  assert.deepEqual(brief.recommendedTopics, ["tax relief", "self assessment", "hmo licensing"]);
});

test("competitorPages never carries body text — only the structured metadata fields passed in", () => {
  const brief = buildContentBrief(
    baseInput({
      competitorPages: [{ domain: "a.com", url: "https://a.com/x", title: "A", wordCount: 500, majorTopics: ["tax relief"] }],
    })
  );
  assert.deepEqual(Object.keys(brief.competitorPages[0]!).sort(), ["domain", "majorTopics", "title", "url", "wordCount"].sort());
});
