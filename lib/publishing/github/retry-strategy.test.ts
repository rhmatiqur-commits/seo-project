import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBranchName, decideBranchAction, decidePullRequestAction, decideMergeAction } from "./retry-strategy";

test("computeBranchName: deterministic for the same content_version_id (stable across retries)", () => {
  assert.equal(computeBranchName("cv-1"), computeBranchName("cv-1"));
});

test("computeBranchName: differs across content versions", () => {
  assert.notEqual(computeBranchName("cv-1"), computeBranchName("cv-2"));
});

test("decideBranchAction: a known branch_name from our own row always wins — never re-derive/re-create", () => {
  assert.equal(decideBranchAction({ knownBranchName: "seo-platform/cv-1", branchExistsOnGitHub: true }), "USE_KNOWN");
  assert.equal(decideBranchAction({ knownBranchName: "seo-platform/cv-1", branchExistsOnGitHub: false }), "USE_KNOWN");
});

test("decideBranchAction: no known branch, but one already exists on GitHub at the deterministic name -> adopt it", () => {
  assert.equal(decideBranchAction({ knownBranchName: null, branchExistsOnGitHub: true }), "ADOPT_EXISTING");
});

test("decideBranchAction: genuinely first attempt -> create new", () => {
  assert.equal(decideBranchAction({ knownBranchName: null, branchExistsOnGitHub: false }), "CREATE_NEW");
});

test("decidePullRequestAction: a known pull_request_number always wins", () => {
  assert.equal(decidePullRequestAction({ knownPullRequestNumber: 42, existingPullRequestForBranch: null }), "USE_KNOWN");
});

test("decidePullRequestAction: no known PR, but one already exists for our branch -> adopt it (duplicate-PR prevention)", () => {
  assert.equal(decidePullRequestAction({ knownPullRequestNumber: null, existingPullRequestForBranch: { number: 7 } }), "ADOPT_EXISTING");
});

test("decidePullRequestAction: genuinely first attempt -> create new", () => {
  assert.equal(decidePullRequestAction({ knownPullRequestNumber: null, existingPullRequestForBranch: null }), "CREATE_NEW");
});

test("decideMergeAction: already merged -> ALREADY_MERGED, never a second merge attempt", () => {
  assert.equal(decideMergeAction({ pullRequestMerged: true, pullRequestState: "closed", mergeable: null }), "ALREADY_MERGED");
});

test("decideMergeAction: closed without merging -> BLOCKED, needs human attention", () => {
  assert.equal(decideMergeAction({ pullRequestMerged: false, pullRequestState: "closed", mergeable: null }), "BLOCKED");
});

test("decideMergeAction: open and explicitly unmergeable (conflicts) -> BLOCKED, never merged automatically", () => {
  assert.equal(decideMergeAction({ pullRequestMerged: false, pullRequestState: "open", mergeable: false }), "BLOCKED");
});

test("decideMergeAction: mergeability not yet computed by GitHub -> NOT_YET_MERGEABLE, not a failure", () => {
  assert.equal(decideMergeAction({ pullRequestMerged: false, pullRequestState: "open", mergeable: null }), "NOT_YET_MERGEABLE");
});

test("decideMergeAction: open and mergeable -> SAFE_TO_MERGE", () => {
  assert.equal(decideMergeAction({ pullRequestMerged: false, pullRequestState: "open", mergeable: true }), "SAFE_TO_MERGE");
});
