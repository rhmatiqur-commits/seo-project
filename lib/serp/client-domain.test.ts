import { test } from "node:test";
import assert from "node:assert/strict";
import { isClientDomain } from "./client-domain";

test("isClientDomain matches an exact domain", () => {
  assert.equal(isClientDomain("cvcentral.io", "cvcentral.io"), true);
});

test("isClientDomain ignores a www. prefix on either side", () => {
  assert.equal(isClientDomain("www.cvcentral.io", "cvcentral.io"), true);
  assert.equal(isClientDomain("cvcentral.io", "www.cvcentral.io"), true);
});

test("isClientDomain is case-insensitive", () => {
  assert.equal(isClientDomain("CVCentral.io", "cvcentral.io"), true);
});

test("isClientDomain returns false for a different domain", () => {
  assert.equal(isClientDomain("rival.co.uk", "cvcentral.io"), false);
});

test("isClientDomain does not falsely match a subdomain of the client's domain", () => {
  assert.equal(isClientDomain("blog.cvcentral.io", "cvcentral.io"), false);
});
