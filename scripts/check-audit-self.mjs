#!/usr/bin/env node
/**
 * Self-check: ensure scripts/source-copy-audit.mjs's own source
 * contains zero `literal \uXXXX` escape sequences, zero mojibake
 * markers, zero em-dash, zero ellipsis, and ends with a newline.
 *
 * This is a focused gate to prevent regression: the audit script
 * must remain free of the very markers it audits for, so it never
 * reports on itself when audited by another caller (or by the next
 * maintainer running `npm run lint:source:scoped`).
 *
 * The check is intentionally narrow: it operates on the file bytes,
 * not on the audit's regex logic, so the audit script can define
 * markers via `String.fromCharCode` and not trigger this gate.
 */
import { readFileSync } from "node:fs";

const FILE = "scripts/source-copy-audit.mjs";
const data = readFileSync(FILE);
const text = data.toString("utf-8");

const failures = [];

// 1. Literal `\uXXXX` escape sequences (backslash-u followed by 4
//    hex digits, the exact byte shape that the audit warns against).
const reBackslashU = /\\u[0-9A-Fa-f]{4}/g;
let count = 0;
while (reBackslashU.exec(text) !== null) {
  count++;
}
if (count > 0) {
  failures.push(`literal \\uXXXX: ${count}`);
}

// 2. Mojibake markers assembled from code-point arithmetic should
//    NOT appear in this file. We probe with a few of the most
//    common byte sequences the audit would catch.
const cp = (...codes) => String.fromCharCode(...codes);
const probes = [
  [cp(0x00c3), "A-tilde fragment"],
  [cp(0x00c4), "A-umlaut fragment"],
  [cp(0x00e1, 0x00ba), "a-ogonek fragment"],
  [cp(0x00e1, 0x00bb), "a-circumflex fragment"],
  [cp(0x00e2, 0x20ac, 0x00a6), "ellipsis fragment"],
  [cp(0x00c2), "C-cedilla"],
  [cp(0x00a0), "NBSP"],
  [cp(0x00e6), "ae ligature"],
  [cp(0x00df), "sharp s"],
  [cp(0x255e), "double right tee"],
  [cp(0x2551), "double vertical bar"],
  [cp(0x2557), "double down-left"],
  [cp(0x2500), "box-drawing horizontal"],
];
for (const [marker, name] of probes) {
  if (text.includes(marker)) {
    const idx = text.indexOf(marker);
    const ctx = text
      .slice(Math.max(0, idx - 25), idx + 35)
      .replace(/\n/g, "\\n");
    failures.push(
      `mojibake (${name}) present at offset ${idx}: ${JSON.stringify(ctx)}`,
    );
  }
}

// 3. em-dash U+2014 / ellipsis U+2026 -- both are forbidden in the
//    Vaffiliate copy.
if (text.includes(cp(0x2014))) {
  failures.push("em-dash U+2014 present");
}
if (text.includes(cp(0x2026))) {
  failures.push("ellipsis U+2026 present");
}

// 4. Final newline.
if (data[data.length - 1] !== 0x0a) {
  failures.push("missing final newline");
}

if (failures.length > 0) {
  console.log("[FAIL] " + FILE);
  for (const f of failures) {
    console.log("        - " + f);
  }
  process.exit(1);
} else {
  console.log("[OK]   " + FILE);
  console.log("        - no literal \\uXXXX escapes");
  console.log("        - no mojibake markers");
  console.log("        - no em-dash / ellipsis");
  console.log("        - ends with newline");
}
