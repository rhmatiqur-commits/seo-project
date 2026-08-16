import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMarkdownLinks, isInternalLink, validateInternalLinks } from "./internal-links";

const BASE_URL = "https://acme.example.com";

test("extractMarkdownLinks finds every [text](href) pair", () => {
  const links = extractMarkdownLinks("See [our services](/services) and [pricing](https://acme.example.com/pricing \"Pricing\").");
  assert.deepEqual(
    links.map((l) => l.href),
    ["/services", "https://acme.example.com/pricing"]
  );
});

test("isInternalLink: relative paths and same-origin absolute URLs are internal", () => {
  assert.equal(isInternalLink("/services", BASE_URL), true);
  assert.equal(isInternalLink("https://acme.example.com/services", BASE_URL), true);
});

test("isInternalLink: external domains, anchors, and mailto are never internal", () => {
  assert.equal(isInternalLink("https://rival.com/services", BASE_URL), false);
  assert.equal(isInternalLink("#section", BASE_URL), false);
  assert.equal(isInternalLink("mailto:hello@acme.example.com", BASE_URL), false);
});

test("validateInternalLinks: a link to a real known page is valid", () => {
  const result = validateInternalLinks("Read about [our services](/services).", BASE_URL, ["/services", "/about"], []);
  assert.equal(result.validLinks.length, 1);
  assert.equal(result.invalidLinks.length, 0);
});

test("validateInternalLinks: a link to a page that does not exist is invalid — never silently accepted", () => {
  const result = validateInternalLinks("See [our made-up page](/totally-fabricated-page).", BASE_URL, ["/services", "/about"], []);
  assert.equal(result.invalidLinks.length, 1);
  assert.equal(result.invalidLinks[0]?.href, "/totally-fabricated-page");
});

test("validateInternalLinks: external links are never flagged as invalid internal links", () => {
  const result = validateInternalLinks("See [a competitor](https://rival.com/guide).", BASE_URL, ["/services"], []);
  assert.equal(result.invalidLinks.length, 0);
  assert.equal(result.validLinks.length, 0);
});

test("validateInternalLinks: reports suggested links that were never used, without failing them", () => {
  const result = validateInternalLinks("No links here.", BASE_URL, ["/services"], ["/services"]);
  assert.deepEqual(result.missingSuggested, ["/services"]);
});

test("validateInternalLinks: a suggested link that IS used is not reported as missing", () => {
  const result = validateInternalLinks("See [services](/services).", BASE_URL, ["/services"], ["/services"]);
  assert.deepEqual(result.missingSuggested, []);
});
