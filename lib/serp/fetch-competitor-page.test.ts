import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMajorTopics } from "./major-topics";

test("extractMajorTopics surfaces the most frequent meaningful words", () => {
  const topics = extractMajorTopics(["Landlord Accountant Coventry", "Landlord Tax Returns", "Coventry Landlord Advice"]);
  assert.ok(topics.includes("landlord"));
  assert.ok(topics.includes("coventry"));
});

test("extractMajorTopics filters out stopwords and short words", () => {
  const topics = extractMajorTopics(["The Best Way To Do This For You"]);
  assert.ok(!topics.includes("the"));
  assert.ok(!topics.includes("to"));
  assert.ok(!topics.includes("do"));
});

test("extractMajorTopics handles null entries without crashing", () => {
  const topics = extractMajorTopics([null, "Cover Letter Generator", null]);
  assert.ok(topics.includes("cover"));
});

test("extractMajorTopics respects the limit", () => {
  const topics = extractMajorTopics(["alpha beta gamma delta epsilon zeta eta theta"], 3);
  assert.equal(topics.length, 3);
});

test("extractMajorTopics returns an empty array for all-stopword or empty input", () => {
  assert.deepEqual(extractMajorTopics([]), []);
  assert.deepEqual(extractMajorTopics(["the a an of to"]), []);
});
