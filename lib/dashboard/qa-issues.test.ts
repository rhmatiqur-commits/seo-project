import { test } from "node:test";
import assert from "node:assert/strict";
import { groupQaIssuesBySeverity } from "./qa-issues";

test("splits issues into blocking and non-blocking (warning) groups", () => {
  const result = groupQaIssuesBySeverity([
    { severity: "blocking", message: "Missing H1" },
    { severity: "warning", message: "Meta description a bit short" },
    { severity: "blocking", message: "Content too short" },
  ]);
  assert.equal(result.blocking.length, 2);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.blocking[0]!.message, "Missing H1");
  assert.equal(result.warnings[0]!.message, "Meta description a bit short");
});

test("any non-'blocking' severity value is treated as a warning, not just the literal 'warning'", () => {
  const result = groupQaIssuesBySeverity([{ severity: "info", message: "FYI" }]);
  assert.equal(result.blocking.length, 0);
  assert.equal(result.warnings.length, 1);
});

test("empty input produces empty groups, not an error", () => {
  const result = groupQaIssuesBySeverity([]);
  assert.deepEqual(result, { blocking: [], warnings: [] });
});

test("all-blocking input produces an empty warnings group", () => {
  const result = groupQaIssuesBySeverity([
    { severity: "blocking", message: "A" },
    { severity: "blocking", message: "B" },
  ]);
  assert.equal(result.blocking.length, 2);
  assert.equal(result.warnings.length, 0);
});

test("preserves original order within each group", () => {
  const result = groupQaIssuesBySeverity([
    { severity: "blocking", message: "first blocking" },
    { severity: "warning", message: "first warning" },
    { severity: "blocking", message: "second blocking" },
    { severity: "warning", message: "second warning" },
  ]);
  assert.deepEqual(
    result.blocking.map((i) => i.message),
    ["first blocking", "second blocking"]
  );
  assert.deepEqual(
    result.warnings.map((i) => i.message),
    ["first warning", "second warning"]
  );
});
