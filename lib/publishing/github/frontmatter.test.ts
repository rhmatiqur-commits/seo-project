import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, serializeFrontmatter, patchFrontmatterFields } from "./frontmatter";

test("parseFrontmatter: extracts fields and body from a well-formed block", () => {
  const source = '---\ntitle: "Hello World"\ndescription: "A page"\n---\n\nBody text here.';
  const result = parseFrontmatter(source);
  assert.deepEqual(result.fields, { title: "Hello World", description: "A page" });
  assert.equal(result.body, "Body text here.");
});

test("parseFrontmatter: returns null fields when there is no frontmatter block at all", () => {
  const result = parseFrontmatter("Just plain content, no frontmatter.");
  assert.equal(result.fields, null);
  assert.equal(result.body, "Just plain content, no frontmatter.");
});

test("parseFrontmatter: unquotes escaped quotes and backslashes", () => {
  const source = '---\ntitle: "She said \\"hi\\""\n---\nbody';
  const result = parseFrontmatter(source);
  assert.equal(result.fields!.title, 'She said "hi"');
});

test("serializeFrontmatter: round-trips through parseFrontmatter", () => {
  const fields = { title: "My Title", description: "My description" };
  const serialized = serializeFrontmatter(fields, "The body.");
  const parsed = parseFrontmatter(serialized);
  assert.deepEqual(parsed.fields, fields);
  assert.equal(parsed.body, "The body.");
});

test("serializeFrontmatter: quotes every value regardless of whether it strictly needs it", () => {
  const serialized = serializeFrontmatter({ title: "Simple" }, "body");
  assert.match(serialized, /title: "Simple"/);
});

test("patchFrontmatterFields: updates only the given keys, preserves every other field and its order", () => {
  const source = '---\nauthor: "Jane"\ntitle: "Old Title"\ndate: "2026-01-01"\n---\n\nOld body.';
  const patched = patchFrontmatterFields(source, { title: "New Title" });
  const parsed = parseFrontmatter(patched);
  assert.equal(parsed.fields!.title, "New Title");
  assert.equal(parsed.fields!.author, "Jane");
  assert.equal(parsed.fields!.date, "2026-01-01");
  assert.equal(parsed.body, "Old body.");
});

test("patchFrontmatterFields: adds a key that wasn't previously present", () => {
  const source = '---\ntitle: "Title"\n---\nbody';
  const patched = patchFrontmatterFields(source, { description: "New description" });
  const parsed = parseFrontmatter(patched);
  assert.equal(parsed.fields!.description, "New description");
});

test("patchFrontmatterFields: creates a frontmatter block from scratch when the source had none", () => {
  const patched = patchFrontmatterFields("Just plain content.", { title: "Added Title" });
  const parsed = parseFrontmatter(patched);
  assert.equal(parsed.fields!.title, "Added Title");
});
