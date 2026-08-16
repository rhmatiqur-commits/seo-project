import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPathSegments, slugFromUrl, isValidSlug, resolvePublicationTargetUrl } from "./url";

test("extractPathSegments strips leading/trailing slashes from an absolute URL", () => {
  assert.deepEqual(extractPathSegments("https://cvcentral.io/international-cv-guide"), ["international-cv-guide"]);
  assert.deepEqual(extractPathSegments("https://cvcentral.io/blog/my-post/"), ["blog", "my-post"]);
});

test("extractPathSegments falls back to treating a bare path as segments", () => {
  assert.deepEqual(extractPathSegments("/foo/bar"), ["foo", "bar"]);
});

test("slugFromUrl returns the last path segment", () => {
  assert.equal(slugFromUrl("https://cvcentral.io/international-cv-guide"), "international-cv-guide");
  assert.equal(slugFromUrl("https://cvcentral.io/blog/my-post/"), "my-post");
});

test("isValidSlug accepts lowercase-hyphenated slugs, rejects spaces/uppercase/special characters", () => {
  assert.equal(isValidSlug("international-cv-guide"), true);
  assert.equal(isValidSlug("a"), true);
  assert.equal(isValidSlug("My Page"), false);
  assert.equal(isValidSlug("has_underscore"), false);
  assert.equal(isValidSlug(""), false);
  assert.equal(isValidSlug("trailing-"), false);
});

test("resolvePublicationTargetUrl: OPTIMISE_EXISTING_PAGE always uses the real existing URL, never the brief's recommendation", () => {
  const result = resolvePublicationTargetUrl({
    contentType: "OPTIMISE_EXISTING_PAGE",
    existingPageUrl: "https://cvcentral.io/real-existing-page",
    briefTargetUrl: "https://cvcentral.io/ai-recommended-different-slug",
  });
  assert.equal(result, "https://cvcentral.io/real-existing-page");
});

test("resolvePublicationTargetUrl: CREATE_NEW_PAGE uses the brief's recommended URL", () => {
  const result = resolvePublicationTargetUrl({
    contentType: "CREATE_NEW_PAGE",
    existingPageUrl: null,
    briefTargetUrl: "https://cvcentral.io/new-page",
  });
  assert.equal(result, "https://cvcentral.io/new-page");
});
