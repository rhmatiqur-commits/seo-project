import { test } from "node:test";
import assert from "node:assert/strict";
import { getSearchConsoleDisplayState } from "./search-console-state";

test("no connection at all (null) -> NOT_CONNECTED", () => {
  assert.equal(getSearchConsoleDisplayState(null, 0), "NOT_CONNECTED");
});

test("connection missing (undefined) -> NOT_CONNECTED", () => {
  assert.equal(getSearchConsoleDisplayState(undefined, 0), "NOT_CONNECTED");
});

test("connection still pending site selection -> NOT_CONNECTED, even with rows somehow present", () => {
  assert.equal(getSearchConsoleDisplayState("pending_site_selection", 5), "NOT_CONNECTED");
});

test("connection in error state -> NOT_CONNECTED", () => {
  assert.equal(getSearchConsoleDisplayState("error", 0), "NOT_CONNECTED");
});

test("active connection, zero rows synced yet -> CONNECTED_NO_DATA", () => {
  assert.equal(getSearchConsoleDisplayState("active", 0), "CONNECTED_NO_DATA");
});

test("active connection, rows present -> CONNECTED_WITH_DATA", () => {
  assert.equal(getSearchConsoleDisplayState("active", 42), "CONNECTED_WITH_DATA");
});

test("active connection with exactly 1 row -> CONNECTED_WITH_DATA (not treated as insufficient)", () => {
  assert.equal(getSearchConsoleDisplayState("active", 1), "CONNECTED_WITH_DATA");
});
