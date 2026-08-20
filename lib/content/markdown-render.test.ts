import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdownBlocks } from "./markdown-render";

test("plain paragraph with no markdown constructs", () => {
  const blocks = parseMarkdownBlocks("Just a plain sentence.");
  assert.deepEqual(blocks, [{ type: "paragraph", inline: [{ type: "text", text: "Just a plain sentence." }] }]);
});

test("## produces a level-2 heading (the only level the generation prompt actually instructs)", () => {
  const blocks = parseMarkdownBlocks("## Section title");
  assert.deepEqual(blocks, [{ type: "heading", level: 2, inline: [{ type: "text", text: "Section title" }] }]);
});

test("# and ### also parse, at their respective levels", () => {
  assert.equal((parseMarkdownBlocks("# Top")[0] as { level: number }).level, 1);
  assert.equal((parseMarkdownBlocks("### Sub")[0] as { level: number }).level, 3);
});

test("consecutive plain lines merge into one paragraph, separated by a space", () => {
  const blocks = parseMarkdownBlocks("Line one\nLine two");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.type, "paragraph");
  assert.deepEqual((blocks[0] as { inline: { text: string }[] }).inline, [{ type: "text", text: "Line one Line two" }]);
});

test("a blank line separates two paragraphs", () => {
  const blocks = parseMarkdownBlocks("First para.\n\nSecond para.");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]!.type, "paragraph");
  assert.equal(blocks[1]!.type, "paragraph");
});

test("bold and italic parse as distinct inline segment types", () => {
  const blocks = parseMarkdownBlocks("Some **bold** and *italic* text.");
  const inline = (blocks[0] as { inline: { type: string; text?: string }[] }).inline;
  assert.deepEqual(
    inline.map((s) => s.type),
    ["text", "bold", "text", "italic", "text"]
  );
  assert.equal(inline[1]!.text, "bold");
  assert.equal(inline[3]!.text, "italic");
});

test("markdown links parse with text and href kept separate", () => {
  const blocks = parseMarkdownBlocks("See [our guide](/blog/guide) for more.");
  const inline = (blocks[0] as { inline: { type: string; text?: string; href?: string }[] }).inline;
  const link = inline.find((s) => s.type === "link");
  assert.deepEqual(link, { type: "link", text: "our guide", href: "/blog/guide" });
});

test("consecutive '- ' lines become one unordered list block", () => {
  const blocks = parseMarkdownBlocks("- First\n- Second\n- Third");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.type, "list");
  const list = blocks[0] as { ordered: boolean; items: { text?: string }[][] };
  assert.equal(list.ordered, false);
  assert.equal(list.items.length, 3);
  assert.equal(list.items[0]![0]!.text, "First");
});

test("'* ' is also a valid bullet marker", () => {
  const blocks = parseMarkdownBlocks("* One\n* Two");
  assert.equal(blocks[0]!.type, "list");
  assert.equal((blocks[0] as { items: unknown[] }).items.length, 2);
});

test("numbered lines become one ordered list block", () => {
  const blocks = parseMarkdownBlocks("1. First step\n2. Second step");
  assert.equal(blocks[0]!.type, "list");
  const list = blocks[0] as { ordered: boolean; items: unknown[] };
  assert.equal(list.ordered, true);
  assert.equal(list.items.length, 2);
});

test("switching from bullet to numbered mid-document starts a new list block", () => {
  const blocks = parseMarkdownBlocks("- bullet one\n1. numbered one");
  assert.equal(blocks.length, 2);
  assert.equal((blocks[0] as { ordered: boolean }).ordered, false);
  assert.equal((blocks[1] as { ordered: boolean }).ordered, true);
});

test("a fenced code block is captured verbatim and not treated as prose", () => {
  const blocks = parseMarkdownBlocks("```\nconst x = 1;\n```");
  assert.deepEqual(blocks, [{ type: "code", text: "const x = 1;" }]);
});

test("an unclosed fence still returns its content rather than throwing or hanging", () => {
  const blocks = parseMarkdownBlocks("```\nunterminated");
  assert.equal(blocks[0]!.type, "code");
  assert.equal((blocks[0] as { text: string }).text, "unterminated");
});

test("a realistic mixed document produces heading, paragraph, and list blocks in document order", () => {
  const markdown = ["## Why this matters", "", "This page **helps** customers understand the process.", "", "- Step one", "- Step two", "", "See [pricing](/pricing) for details."].join("\n");
  const blocks = parseMarkdownBlocks(markdown);
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["heading", "paragraph", "list", "paragraph"]
  );
});

test("empty input produces no blocks", () => {
  assert.deepEqual(parseMarkdownBlocks(""), []);
});

test("bold immediately followed by more text does not leak asterisks into surrounding text", () => {
  const blocks = parseMarkdownBlocks("**Bold**ish word");
  const inline = (blocks[0] as { inline: { type: string; text: string }[] }).inline;
  assert.equal(inline[0]!.type, "bold");
  assert.equal(inline[0]!.text, "Bold");
  assert.equal(inline[1]!.text, "ish word");
});
