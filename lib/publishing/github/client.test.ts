import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHubClient } from "./client";
import { PersonalAccessTokenAuth } from "./auth";
import { GitHubApiError } from "./errors";

/**
 * Every test mocks globalThis.fetch with node:test's built-in `t.mock` —
 * auto-restored after each test, no live GitHub calls anywhere here, same
 * convention as lib/publishing/wordpress-provider.test.ts.
 */

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function client(): GitHubClient {
  return new GitHubClient(new PersonalAccessTokenAuth("ghp_super_secret_token"));
}

test("every request carries a Bearer Authorization header built from the injected token", async (t) => {
  let capturedAuth = "";
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedAuth = (init.headers as Record<string, string>).Authorization ?? "";
    return jsonResponse(200, { login: "seo-bot" });
  });
  await client().getAuthenticatedUser();
  assert.equal(capturedAuth, "Bearer ghp_super_secret_token");
});

test("getAuthenticatedUser: returns the login", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, { login: "seo-bot-app" }));
  const user = await client().getAuthenticatedUser();
  assert.equal(user.login, "seo-bot-app");
});

test("listRepositories: maps the raw response onto GitHubRepoSummary[]", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(200, [{ name: "cv-central", full_name: "cv-central-org/cv-central", owner: { login: "cv-central-org" }, default_branch: "main", private: true, html_url: "https://github.com/cv-central-org/cv-central" }])
  );
  const repos = await client().listRepositories();
  assert.equal(repos.length, 1);
  assert.equal(repos[0]!.fullName, "cv-central-org/cv-central");
  assert.equal(repos[0]!.defaultBranch, "main");
});

test("getRepository: returns null on 404 rather than throwing", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(404, { message: "Not Found" }));
  const repo = await client().getRepository("owner", "missing-repo");
  assert.equal(repo, null);
});

test("getRepository: propagates a non-404 error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(401, { message: "Bad credentials" }));
  await assert.rejects(() => client().getRepository("owner", "repo"), GitHubApiError);
});

test("getBranch: returns the commit sha when found", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, { name: "main", commit: { sha: "abc123" } }));
  const branch = await client().getBranch("owner", "repo", "main");
  assert.equal(branch!.sha, "abc123");
});

test("getBranch: returns null when not found (the idempotency check's core primitive)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(404, { message: "Branch not found" }));
  const branch = await client().getBranch("owner", "repo", "seo-platform/cv-1");
  assert.equal(branch, null);
});

test("createBranch: posts the ref with the given sha", async (t) => {
  let capturedBody: { ref?: string; sha?: string } = {};
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedBody = JSON.parse(init.body as string);
    return jsonResponse(201, {});
  });
  await client().createBranch("owner", "repo", "seo-platform/cv-1", "base-sha");
  assert.equal(capturedBody.ref, "refs/heads/seo-platform/cv-1");
  assert.equal(capturedBody.sha, "base-sha");
});

test("createBranch: an 'already exists' 422 is surfaced as a GitHubApiError (not swallowed) for the caller/retry-strategy to handle", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(422, { message: "Reference already exists" }));
  await assert.rejects(() => client().createBranch("owner", "repo", "seo-platform/cv-1", "sha"), GitHubApiError);
});

test("getFileContent: decodes base64 content and returns the blob sha", async (t) => {
  const encoded = Buffer.from("---\ntitle: \"x\"\n---\nBody", "utf8").toString("base64");
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, { path: "content/pages/x.md", content: encoded, encoding: "base64", sha: "blob-sha-1" }));
  const file = await client().getFileContent("owner", "repo", "content/pages/x.md", "main");
  assert.match(file!.content, /Body/);
  assert.equal(file!.sha, "blob-sha-1");
});

test("getFileContent: returns null (not an error) when the file doesn't exist yet — a genuinely new page", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(404, { message: "Not Found" }));
  const file = await client().getFileContent("owner", "repo", "content/pages/new.md", "seo-platform/cv-2");
  assert.equal(file, null);
});

test("putFileContents: base64-encodes the content and includes the blob sha only when updating", async (t) => {
  let capturedBody: { content?: string; sha?: string } = {};
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedBody = JSON.parse(init.body as string);
    return jsonResponse(200, { commit: { sha: "new-commit-sha" } });
  });
  const result = await client().putFileContents("owner", "repo", "content/pages/x.md", { message: "Update x", content: "new content", branch: "seo-platform/cv-1", sha: "old-blob-sha" });
  assert.equal(Buffer.from(capturedBody.content!, "base64").toString("utf8"), "new content");
  assert.equal(capturedBody.sha, "old-blob-sha");
  assert.equal(result.commitSha, "new-commit-sha");
});

test("putFileContents: omits sha entirely for a brand-new file", async (t) => {
  let capturedBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedBody = JSON.parse(init.body as string);
    return jsonResponse(201, { commit: { sha: "first-commit-sha" } });
  });
  await client().putFileContents("owner", "repo", "content/pages/new.md", { message: "Add new", content: "content", branch: "seo-platform/cv-2" });
  assert.equal("sha" in capturedBody, false);
});

test("findPullRequestsForBranch: queries by head=owner:branch and maps results", async (t) => {
  let capturedUrl = "";
  t.mock.method(globalThis, "fetch", async (url: string) => {
    capturedUrl = url;
    return jsonResponse(200, [{ number: 5, html_url: "https://github.com/owner/repo/pull/5", state: "open", merged: false, mergeable: true, head: { sha: "h1", ref: "seo-platform/cv-1" }, base: { ref: "main" } }]);
  });
  const prs = await client().findPullRequestsForBranch("owner", "repo", "seo-platform/cv-1");
  assert.match(capturedUrl, /head=owner%3Aseo-platform%2Fcv-1/);
  assert.equal(prs.length, 1);
  assert.equal(prs[0]!.number, 5);
});

test("createPullRequest: posts title/head/base/body and maps the response", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(201, { number: 9, html_url: "https://github.com/owner/repo/pull/9", state: "open", merged: false, mergeable: null, head: { sha: "h9", ref: "seo-platform/cv-9" }, base: { ref: "main" } })
  );
  const pr = await client().createPullRequest("owner", "repo", { title: "SEO: New page", head: "seo-platform/cv-9", base: "main", body: "desc" });
  assert.equal(pr.number, 9);
  assert.equal(pr.mergeable, null);
});

test("mergePullRequest: defaults to squash merge and returns the merge commit sha", async (t) => {
  let capturedBody: { merge_method?: string } = {};
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    capturedBody = JSON.parse(init.body as string);
    return jsonResponse(200, { merged: true, sha: "merge-commit-sha", message: "Pull Request successfully merged" });
  });
  const result = await client().mergePullRequest("owner", "repo", 9, { commitTitle: "Merge #9" });
  assert.equal(capturedBody.merge_method, "squash");
  assert.equal(result.merged, true);
  assert.equal(result.sha, "merge-commit-sha");
});

test("mergePullRequest: a blocked merge (405) is surfaced as a GitHubApiError, never silently reported as merged", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(405, { message: "Pull Request is not mergeable" }));
  await assert.rejects(() => client().mergePullRequest("owner", "repo", 9, { commitTitle: "Merge #9" }), GitHubApiError);
});

test("getDeploymentSignal: detects a Vercel preview URL from the classic Statuses API", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/status")) {
      return jsonResponse(200, { state: "success", statuses: [{ state: "success", context: "vercel", target_url: "https://cv-central-git-seo-platform-cv-1.vercel.app" }] });
    }
    return jsonResponse(200, { check_runs: [] });
  });
  const signal = await client().getDeploymentSignal("owner", "repo", "sha1");
  assert.equal(signal.vercelPreviewUrl, "https://cv-central-git-seo-platform-cv-1.vercel.app");
  assert.equal(signal.vercelState, "success");
});

test("getDeploymentSignal: falls back to Checks API when no classic status carries a Vercel context", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/status")) return jsonResponse(200, { state: "pending", statuses: [] });
    return jsonResponse(200, { check_runs: [{ name: "Vercel", status: "completed", conclusion: "success", details_url: "https://cv-central-git-seo-platform-cv-2.vercel.app" }] });
  });
  const signal = await client().getDeploymentSignal("owner", "repo", "sha2");
  assert.equal(signal.vercelPreviewUrl, "https://cv-central-git-seo-platform-cv-2.vercel.app");
});

test("getDeploymentSignal: returns nulls (not an error) when nothing has posted a status yet", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, { state: "pending", statuses: [], check_runs: [] }));
  const signal = await client().getDeploymentSignal("owner", "repo", "sha3");
  assert.equal(signal.vercelPreviewUrl, null);
});

test("a rate-limited 403 (x-ratelimit-remaining: 0) is classified as retryable RATE_LIMIT, not permanent AUTH", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0" }));
  try {
    await client().getAuthenticatedUser();
    assert.fail("expected a rejection");
  } catch (error) {
    assert.ok(error instanceof GitHubApiError);
    assert.equal(error.kind, "RATE_LIMIT");
    assert.equal(error.retryable, true);
  }
});

test("a network-level failure never leaks the token in the thrown message", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch failed: getaddrinfo ENOTFOUND api.github.com");
  });
  try {
    await client().getAuthenticatedUser();
    assert.fail("expected a rejection");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.equal((error as Error).message.includes("ghp_super_secret_token"), false);
  }
});
