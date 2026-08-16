import { test } from "node:test";
import assert from "node:assert/strict";
import { toPublicConnection } from "./connection-view";

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
    credential_secret_id: "11111111-1111-1111-1111-111111111111",
    status: "active",
    last_tested_at: "2026-08-16T00:00:00Z",
    last_test_error: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-16T00:00:00Z",
  };

  const publicView = toPublicConnection(row);

  assert.deepEqual(Object.keys(publicView).sort(), ["baseUrl", "id", "lastTestError", "lastTestedAt", "provider", "status", "username"].sort());
  assert.equal(JSON.stringify(publicView).includes("credential_secret_id"), false);
  assert.equal(JSON.stringify(publicView).includes(row.credential_secret_id), false);
  assert.equal(JSON.stringify(publicView).includes("organization_id"), false);
});

test("toPublicConnection preserves the non-sensitive fields correctly", () => {
  const view = toPublicConnection({
    id: "conn-1",
    provider: "wordpress",
    base_url: "https://cvcentral.io",
    username: "seo-bot",
    status: "active",
    last_tested_at: null,
    last_test_error: null,
  });
  assert.equal(view.baseUrl, "https://cvcentral.io");
  assert.equal(view.username, "seo-bot");
  assert.equal(view.status, "active");
});
