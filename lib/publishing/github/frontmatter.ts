/**
 * A small, pure YAML-frontmatter parser/serializer — exactly what the
 * generic Markdown content adapter needs (flat string fields: title,
 * description, slug, date), not a general YAML implementation. Same
 * philosophy as lib/publishing/markdown.ts's Markdown-to-HTML converter:
 * handles the shape this platform actually produces/needs to patch, nothing
 * more. No external YAML dependency.
 */

export interface ParsedFrontmatter {
  /** Present only when the file actually opened with a `---` frontmatter block. */
  fields: Record<string, string> | null;
  /** Everything after the closing `---` (or the whole file, if there was no frontmatter block at all). */
  body: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Unquotes a YAML scalar the way this platform's own serializer quotes it
 * (double-quoted with `\"`/`\\` escaped) — not general YAML scalar parsing. */
function unquoteValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return trimmed;
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) return { fields: null, body: source };

  const [, block, body] = match;
  const fields: Record<string, string> = {};
  for (const line of block!.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    if (key) fields[key] = unquoteValue(value);
  }
  // The closing `---` is followed by either a single newline straight into
  // the body, or a blank-line separator (two newlines) — the capture group
  // above only ever consumes one, so strip at most one more leftover
  // leading newline here rather than complicating the regex further.
  return { fields, body: (body ?? "").replace(/^\r?\n/, "") };
}

function quoteValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Serializes `fields` (in the given key order) as a `---`-delimited YAML
 * block followed by `body`. Every value is double-quoted, regardless of
 * whether quoting was strictly necessary — deterministic output, never
 * ambiguous about where a value ends. */
export function serializeFrontmatter(fields: Record<string, string>, body: string): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${quoteValue(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body.trimStart()}`;
}

/**
 * Replaces only the given field keys in an existing frontmatter block,
 * leaving every other field (and the block's key order) untouched — "patch,
 * don't blindly replace" for the frontmatter half of an existing file. Adds
 * a key if it wasn't already present (appended at the end). If `source` had
 * no frontmatter block at all, one is created containing exactly the given
 * fields.
 */
export function patchFrontmatterFields(source: string, patch: Record<string, string>): string {
  const parsed = parseFrontmatter(source);
  const existingFields = parsed.fields ?? {};
  const merged = { ...existingFields, ...patch };
  return serializeFrontmatter(merged, parsed.body);
}
