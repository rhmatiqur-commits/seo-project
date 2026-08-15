import { test } from "node:test";
import assert from "node:assert/strict";
import { mapDataForSeoError } from "./errors";

test("mapDataForSeoError classifies 401/403 as auth errors", () => {
  assert.equal(mapDataForSeoError(401).kind, "auth");
  assert.equal(mapDataForSeoError(403).kind, "auth");
});

test("mapDataForSeoError classifies 429 and 5xx as transient (retry-worthy)", () => {
  assert.equal(mapDataForSeoError(429).kind, "transient");
  assert.equal(mapDataForSeoError(500).kind, "transient");
  assert.equal(mapDataForSeoError(503).kind, "transient");
});

test("mapDataForSeoError classifies a DataForSEO 4xxxx envelope status as permanent", () => {
  assert.equal(mapDataForSeoError(200, 40501, "Invalid Field").kind, "permanent");
});

test("mapDataForSeoError falls back to permanent for anything else", () => {
  assert.equal(mapDataForSeoError(400).kind, "permanent");
});

test("mapDataForSeoError messages never include credentials (only status/message)", () => {
  const err = mapDataForSeoError(401);
  assert.ok(!err.message.includes("DATAFORSEO_LOGIN="));
  assert.ok(err.message.includes("DATAFORSEO_LOGIN")); // mentions the var name, not a value
});
