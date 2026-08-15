import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDomainByPattern, classifyCompetitorDomain } from "./classify-domain";

test("classifyDomainByPattern recognises known directories", () => {
  assert.equal(classifyDomainByPattern("yell.com"), "DIRECTORY");
  assert.equal(classifyDomainByPattern("www.checkatrade.com"), "DIRECTORY");
});

test("classifyDomainByPattern recognises known marketplaces", () => {
  assert.equal(classifyDomainByPattern("amazon.co.uk"), "MARKETPLACE");
});

test("classifyDomainByPattern recognises known informational/government sites", () => {
  assert.equal(classifyDomainByPattern("hmrc.gov.uk"), "INFORMATIONAL");
});

test("classifyDomainByPattern folds Google properties and social networks into OTHER", () => {
  assert.equal(classifyDomainByPattern("google.co.uk"), "OTHER");
  assert.equal(classifyDomainByPattern("facebook.com"), "OTHER");
});

test("classifyDomainByPattern returns null for an unrecognised domain (defer to appearance-count logic)", () => {
  assert.equal(classifyDomainByPattern("some-landlord-accountant.co.uk"), null);
});

test("classifyDomainByPattern matches subdomains of known patterns", () => {
  assert.equal(classifyDomainByPattern("uk.trustpilot.com"), "DIRECTORY");
});

test("classifyCompetitorDomain: pattern match wins regardless of appearance count", () => {
  assert.equal(classifyCompetitorDomain("yell.com", 50), "DIRECTORY");
});

test("classifyCompetitorDomain: unrecognised domain below the appearance threshold -> UNKNOWN", () => {
  assert.equal(classifyCompetitorDomain("new-firm.co.uk", 1), "UNKNOWN");
});

test("classifyCompetitorDomain: unrecognised domain meeting the appearance threshold -> DIRECT_COMPETITOR", () => {
  assert.equal(classifyCompetitorDomain("rival-accountants.co.uk", 2), "DIRECT_COMPETITOR");
});
