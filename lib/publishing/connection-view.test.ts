import { test } from "node:test";
import assert from "node:assert/strict";
import { toPublicConnection } from "./connection-view";

const EXPECTED_KEYS = [
  "id",
  "provider",
  "baseUrl",
  "username",
  "githubOwner",
  "githubRepo",
  "githubProductionBranch",
  "githubAccountLogin",
  "githubPublicationMode",
  "status",
  "lastTestedAt",
  "lastTestError",
].sort();

test("toPublicConnection never includes credential_secret_id or any other field beyond the known-safe set", () => {
  // Deliberately passed as `any` with an extra `credential_secret_id` (and a
  // couple of other server-only fields) to prove the function's OWN return
  // shape excludes them by construction, not because the input happened not
  // to have them.
  const row = {
    id: "conn-1",
    organization_id: "org-1",
    website_id: "site-1",
    provider: "wordpress",
    base_url: "https://cvcentral.io",
    username: "seo-bot",
    github_owner: null,
    github_repo: null,
    github_production_branch: null,
    github_account_login: null,
    github_publication_mode: "GITHUB_PULL_REQUEST",
    credential_secret_id: "11111111-1111-1111-1111-111111111111",
    status: "active",
    last_tested_at: "2026-08-16T00:00:00Z",
    last_test_error: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-16T00:00:00Z",
  };

  const publicView = toPublicConnection(row);

  assert.deepEqual(Object.keys(publicView).sort(), EXPECTED_KEYS);
  assert.equal(JSON.stringify(publicView).includes("credential_secret_id"), false);
  assert.equal(JSON.stringify(publicView).includes(row.credential_secret_id), false);
  assert.equal(JSON.stringify(publicView).includes("organization_id"), false);
});

test("toPublicConnection preserves the non-sensitive WordPress fields correctly", () => {
  const view = toPublicConnection({
    id: "conn-1",
    provider: "wordpress",
    base_url: "https://cvcentral.io",
    username: "seo-bot",
    github_owner: null,
    github_repo: null,
    github_production_branch: null,
    github_account_login: null,
    github_publication_mode: "GITHUB_PULL_REQUEST",
    status: "active",
    last_tested_at: null,
    last_test_error: null,
  });
  assert.equal(view.baseUrl, "https://cvcentral.io");
  assert.equal(view.username, "seo-bot");
  assert.equal(view.status, "active");
});

test("toPublicConnection preserves the non-sensitive GitHub fields, never the token, and leaves base_url/username null", () => {
  const row = {
    id: "conn-2",
    provider: "github",
    base_url: null,
    username: null,
    github_owner: "cv-central-org",
    github_repo: "cv-central-site",
    github_production_branch: "main",
    github_account_login: "seo-bot-app",
    github_publication_mode: "GITHUB_PULL_REQUEST",
    credential_secret_id: "22222222-2222-2222-2222-222222222222",
    status: "active",
    last_tested_at: "2026-08-17T00:00:00Z",
    last_test_error: null,
  };

  const view = toPublicConnection(row);
  assert.equal(view.baseUrl, null);
  assert.equal(view.username, null);
  assert.equal(view.githubOwner, "cv-central-org");
  assert.equal(view.githubRepo, "cv-central-site");
  assert.equal(view.githubProductionBranch, "main");
  assert.equal(view.githubAccountLogin, "seo-bot-app");
  assert.equal(view.githubPublicationMode, "GITHUB_PULL_REQUEST");
  assert.equal(JSON.stringify(view).includes("credential_secret_id"), false);
  assert.equal(JSON.stringify(view).includes(row.credential_secret_id), false);
});
