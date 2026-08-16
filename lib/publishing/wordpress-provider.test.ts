import { test } from "node:test";
import assert from "node:assert/strict";
import { WordPressPublishingProvider } from "./wordpress-provider";

/**
 * Every test mocks globalThis.fetch with node:test's built-in `t.mock` —
 * auto-restored after each test, no live WordPress calls anywhere here, per
 * spec ("Do not make unit tests depend on a real WordPress installation").
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function provider(): WordPressPublishingProvider {
  return new WordPressPublishingProvider({ baseUrl: "https://cvcentral.io", username: "seo-bot", applicationPassword: "abcd 1234 efgh 5678" });
}

test("testConnection: 200 from /users/me is ok", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, { id: 1 }));
  const result = await provider().testConnection();
  assert.equal(result.ok, true);
});

test("testConnection: 401 is reported as not ok, without exposing the credential in the message", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(401, { code: "rest_forbidden", message: "invalid credentials" }));
  const result = await provider().testConnection();
  assert.equal(result.ok, false);
  assert.equal(result.message.includes("abcd 1234 efgh 5678"), false);
});

test("createDraft: always sends status=draft to WordPress regardless of caller input, and never makes the page live", async (t) => {
  let capturedBody: Record<string, unknown> | null = null;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedBody = JSON.parse(init.body as string);
    return jsonResponse(201, { id: 42, link: "https://cvcentral.io/?page_id=42", slug: "new-page", status: "draft" });
  });
  const result = await provider().createDraft({ title: "T", bodyHtml: "<p>x</p>", excerpt: "e", slug: "new-page", status: "publish" });
  assert.equal((capturedBody as unknown as { status: string }).status, "draft");
  assert.equal(result.status, "draft");
  assert.equal(result.externalId, "42");
});

test("publish: with no existingExternalId, creates a new page with status=publish", async (t) => {
  let capturedMethod = "";
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedMethod = init.method ?? "GET";
    return jsonResponse(201, { id: 7, link: "https://cvcentral.io/new-page", slug: "new-page", status: "publish" });
  });
  const result = await provider().publish({ title: "T", bodyHtml: "<p>x</p>", excerpt: null, slug: "new-page", status: "publish" }, null);
  assert.equal(capturedMethod, "POST");
  assert.equal(result.status, "publish");
  assert.equal(result.externalId, "7");
});

test("publish: with an existingExternalId, updates that same page instead of creating a second one", async (t) => {
  let capturedUrl = "";
  t.mock.method(globalThis, "fetch", async (url: string) => {
    capturedUrl = url;
    return jsonResponse(200, { id: 42, link: "https://cvcentral.io/existing-draft", slug: "existing-draft", status: "publish" });
  });
  const result = await provider().publish({ title: "T", bodyHtml: "<p>x</p>", excerpt: null, slug: "existing-draft", status: "publish" }, "42");
  assert.ok(capturedUrl.includes("/pages/42"));
  assert.equal(result.externalId, "42");
});

test("findBySlug: returns the matching page when WordPress finds one", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, [{ id: 99, link: "https://cvcentral.io/x", slug: "x", status: "draft" }]));
  const result = await provider().findBySlug("x");
  assert.equal(result?.externalId, "99");
});

test("findBySlug: returns null when nothing matches (empty array), not an error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, []));
  const result = await provider().findBySlug("nonexistent");
  assert.equal(result, null);
});

test("getPublishedPage: 404 returns null rather than throwing", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(404, { code: "rest_page_invalid_id", message: "Invalid page ID." }));
  const result = await provider().getPublishedPage("999999");
  assert.equal(result, null);
});

test("a 409 conflict throws a permanent (non-retryable) error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(409, { code: "rest_page_slug_exists", message: "A page with this slug already exists." }));
  await assert.rejects(
    () => provider().createDraft({ title: "T", bodyHtml: "<p>x</p>", excerpt: null, slug: "dup", status: "draft" }),
    (err: unknown) => {
      assert.equal((err as { retryable?: boolean }).retryable, false);
      return true;
    }
  );
});

test("a 429 rate limit throws a retryable error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(429, { code: "rest_rate_limited", message: "Too many requests." }));
  await assert.rejects(
    () => provider().createDraft({ title: "T", bodyHtml: "<p>x</p>", excerpt: null, slug: "x", status: "draft" }),
    (err: unknown) => {
      assert.equal((err as { retryable?: boolean }).retryable, true);
      return true;
    }
  );
});

test("a 5xx server error throws a retryable error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(503, { message: "Service unavailable" }));
  await assert.rejects(
    () => provider().createDraft({ title: "T", bodyHtml: "<p>x</p>", excerpt: null, slug: "x", status: "draft" }),
    (err: unknown) => {
      assert.equal((err as { retryable?: boolean }).retryable, true);
      return true;
    }
  );
});

test("a network-level failure (fetch throws, e.g. timeout) is classified as retryable", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("The operation was aborted due to timeout");
  });
  await assert.rejects(
    () => provider().testConnection().then((r) => (r.ok ? Promise.resolve() : Promise.reject(new Error(r.message)))),
    () => true
  );
  // testConnection itself never throws (it returns {ok:false}); verify the
  // underlying classification directly via createDraft, which does throw.
  await assert.rejects(
    () => provider().createDraft({ title: "T", bodyHtml: "<p>x</p>", excerpt: null, slug: "x", status: "draft" }),
    (err: unknown) => {
      assert.equal((err as { retryable?: boolean }).retryable, true);
      assert.equal((err as { kind?: string }).kind, "NETWORK");
      return true;
    }
  );
});

test("the Authorization header is Basic-auth encoded from username:applicationPassword and never appears in a thrown error message", async (t) => {
  let capturedAuth = "";
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedAuth = (init.headers as Record<string, string>).Authorization ?? "";
    return jsonResponse(401, { message: "bad credentials" });
  });
  try {
    await provider().createDraft({ title: "T", bodyHtml: "<p>x</p>", excerpt: null, slug: "x", status: "draft" });
    assert.fail("expected to throw");
  } catch (error) {
    const expected = `Basic ${Buffer.from("seo-bot:abcd 1234 efgh 5678").toString("base64")}`;
    assert.equal(capturedAuth, expected);
    assert.equal((error as Error).message.includes("abcd 1234 efgh 5678"), false);
    assert.equal((error as Error).message.includes(expected), false);
  }
});

test("update: never includes a slug field, so an existing page's URL is never changed by an update call", async (t) => {
  let capturedBody: Record<string, unknown> | null = null;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedBody = JSON.parse(init.body as string);
    return jsonResponse(200, { id: 5, link: "https://cvcentral.io/existing", slug: "existing", status: "publish" });
  });
  await provider().update("5", { title: "T", bodyHtml: "<p>x</p>", excerpt: null, slug: "should-be-ignored", status: "publish" });
  assert.equal(Object.prototype.hasOwnProperty.call(capturedBody as unknown as object, "slug"), false);
});
