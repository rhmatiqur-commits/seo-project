import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "./markdown";

test("headings # through ###### convert to h1-h6", () => {
  assert.equal(markdownToHtml("# Title"), "<h1>Title</h1>");
  assert.equal(markdownToHtml("## Section"), "<h2>Section</h2>");
  assert.equal(markdownToHtml("###### Deep"), "<h6>Deep</h6>");
});

test("a plain paragraph becomes a <p>", () => {
  assert.equal(markdownToHtml("Just a sentence."), "<p>Just a sentence.</p>");
});

test("blank-line-separated blocks become separate elements", () => {
  const result = markdownToHtml("# Title\n\nFirst paragraph.\n\nSecond paragraph.");
  assert.equal(result, "<h1>Title</h1>\n<p>First paragraph.</p>\n<p>Second paragraph.</p>");
});

test("bold and italic render correctly, bold consumed before italic so ** isn't misread as nested *", () => {
  assert.equal(markdownToHtml("This is **bold** and this is *italic*."), "<p>This is <strong>bold</strong> and this is <em>italic</em>.</p>");
});

test("links render as anchor tags", () => {
  assert.equal(markdownToHtml("See [our services](/services) for more."), '<p>See <a href="/services">our services</a> for more.</p>');
});

test("a bulleted list (all lines starting with -) becomes <ul><li>", () => {
  assert.equal(markdownToHtml("- One\n- Two\n- Three"), "<ul><li>One</li><li>Two</li><li>Three</li></ul>");
});

test("a numbered list becomes <ol><li>", () => {
  assert.equal(markdownToHtml("1. First\n2. Second"), "<ol><li>First</li><li>Second</li></ol>");
});

test("HTML-significant characters in plain text are escaped, not passed through raw", () => {
  const result = markdownToHtml("Use the <script> tag & ampersands carefully.");
  assert.equal(result, "<p>Use the &lt;script&gt; tag &amp; ampersands carefully.</p>");
});

test("escaping happens before link/bold/italic rendering so those tags are never escaped away", () => {
  const result = markdownToHtml("[A link](/x) with **bold** text.");
  assert.equal(result, '<p><a href="/x">A link</a> with <strong>bold</strong> text.</p>');
});
