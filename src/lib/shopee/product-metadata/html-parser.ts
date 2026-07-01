/**
 * Pure HTML tokenizer helpers used by the metadata extractor.
 *
 * The extractor intentionally avoids pulling in a full HTML parser.
 * It only needs three things from the Shopee product page:
 *
 *   - `<meta property="og:*" content="...">` tags
 *   - `<meta name="..." content="...">` tags
 *   - `<script type="application/ld+json">` blocks
 *
 * Each helper is pure: same input -> same output, no global state.
 * The helpers do not allocate per-character and stay within a few
 * passes over the input. They never throw on malformed HTML; they
 * simply return what they find and let the caller decide whether the
 * metadata is complete.
 *
 * No React, Next.js, fetch, or `server-only` import lives in this
 * module so it can run under `node --test`.
 */

const META_CONTENT_PATTERN =
  /<meta\b[^>]*?\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;

const META_PROPERTY_OR_NAME_PATTERN =
  /<(?:meta|link)\b([^>]*)>/gi;

const ATTR_PATTERN =
  /([a-zA-Z_:][a-zA-Z0-9_:\-.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

const LD_JSON_SCRIPT_PATTERN =
  /<script\b[^>]*\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi;

const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

const SCRIPT_BLOCK_PATTERN =
  /<script\b[\s\S]*?<\/script>/gi;

const STYLE_BLOCK_PATTERN =
  /<style\b[\s\S]*?<\/style>/gi;

/**
 * Strip script, style, and HTML comment blocks before scanning for
 * metadata so that JSON-LD payloads inside `<script>` are still
 * matched (script blocks are NOT removed here; only filtered during
 * the meta scan).
 *
 * Comments and `<style>` blocks never carry product metadata, so
 * removing them up front simplifies every later regex.
 */
export function stripNoise(html: string): string {
  return html
    .replace(HTML_COMMENT_PATTERN, " ")
    .replace(STYLE_BLOCK_PATTERN, " ");
}

/**
 * Parse a single attribute fragment such as
 * `property="og:title" content="Hello"` into a key/value record.
 *
 * Returns the empty object if no recognized attribute fragment is
 * supplied. Quoted values (`"..."`, `'...'`) and unquoted bareword
 * values are all supported.
 */
export function parseAttributes(
  raw: string,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  ATTR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PATTERN.exec(raw)) !== null) {
    const name = match[1]?.toLowerCase();
    if (!name) {
      continue;
    }
    const value =
      match[2] ?? match[3] ?? match[4] ?? "";
    result[name] = value;
  }
  return result;
}

/**
 * Read all `<meta>` tags that have a `content` attribute and return
 * them keyed by `property` (preferred) or `name`.
 *
 * Tags that miss both `property` and `name` are dropped because they
 * cannot be mapped to a typed metadata field.
 *
 * The returned value is a Map because metadata may legitimately have
 * multiple tags with the same key (e.g. multiple `og:image`
 * resolutions); the extractor picks the right one for its needs.
 */
export function readMetaTags(
  html: string,
): ReadonlyMap<string, string[]> {
  const tags = new Map<string, string[]>();

  META_PROPERTY_OR_NAME_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (
    (match = META_PROPERTY_OR_NAME_PATTERN.exec(html)) !==
    null
  ) {
    const attributes = parseAttributes(match[1] ?? "");
    const content =
      attributes["content"] ?? "";
    if (content.length === 0) {
      continue;
    }
    const key =
      attributes["property"] ?? attributes["name"];
    if (!key) {
      continue;
    }
    const normalized = key.toLowerCase();
    const bucket = tags.get(normalized);
    if (bucket) {
      bucket.push(content);
    } else {
      tags.set(normalized, [content]);
    }
  }

  return tags;
}

/**
 * Read all JSON-LD `<script type="application/ld+json">` payloads
 * from the HTML and try to parse each as JSON.
 *
 * Malformed payloads are skipped silently so that a single bad
 * `<script>` block cannot poison the entire metadata extraction.
 * The caller can decide whether the absence of any parseable
 * payload is itself a failure.
 */
export function readJsonLdBlocks(
  html: string,
): ReadonlyArray<unknown> {
  const out: unknown[] = [];
  LD_JSON_SCRIPT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (
    (match = LD_JSON_SCRIPT_PATTERN.exec(html)) !== null
  ) {
    const raw = (match[1] ?? "").trim();
    if (raw.length === 0) {
      continue;
    }
    try {
      out.push(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON-LD blocks so a single bad block
      // does not poison the entire extraction.
    }
  }
  return out;
}

/**
 * Extract all attribute fragments from an inline `<script>` element
 * so the caller can inspect `type`, `class`, or other identifying
 * attributes without parsing the entire HTML.
 *
 * Currently unused outside this module but exported for testability
 * and future hooks that need to read additional metadata sources
 * (e.g. microdata).
 */
export function readScriptAttributes(
  html: string,
): ReadonlyArray<Readonly<Record<string, string>>> {
  const out: Array<Record<string, string>> = [];
  SCRIPT_BLOCK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (
    (match = SCRIPT_BLOCK_PATTERN.exec(html)) !== null
  ) {
    const head = match[0].split(">", 1)[0] ?? "";
    out.push(parseAttributes(head.slice("<script".length)));
  }
  return out;
}

/**
 * Look up the first non-empty `<meta content="...">` for a list of
 * candidate keys.
 *
 * Useful for fields that may be expressed under several property
 * names (e.g. `og:title` vs. `twitter:title`).
 */
export function firstMetaContent(
  tags: ReadonlyMap<string, string[]>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const bucket = tags.get(key);
    if (!bucket) {
      continue;
    }
    for (const value of bucket) {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
}

/**
 * Read the raw `content` attributes from every `<meta>` element in
 * the document, regardless of whether they also have a `name` or
 * `property` attribute.
 *
 * Used by tests to confirm the scanner does not throw on malformed
 * attributes; the extractor itself prefers the keyed map produced
 * by {@link readMetaTags}.
 */
export function readAllMetaContents(
  html: string,
): string[] {
  const out: string[] = [];
  META_CONTENT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (
    (match = META_CONTENT_PATTERN.exec(html)) !== null
  ) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    out.push(value);
  }
  return out;
}