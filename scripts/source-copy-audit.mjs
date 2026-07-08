#!/usr/bin/env node
/**
 * Source-copy hygiene audit for the changed files in Phase 20H.4a.
 *
 * Pure Node.js. Reads each file as bytes, decodes as UTF-8, and
 * reports:
 *
 *   - UTF-8 BOM at start
 *   - missing final newline
 *   - null bytes
 *   - mojibake markers (Latin-1 / Windows-1252 fragments)
 *   - em-dash U+2014
 *   - ellipsis U+2026 (informational only)
 *   - literal "\\uXXXX" escapes in .ts/.tsx source
 *
 * The marker byte strings the audit looks for are constructed at
 * runtime with `String.fromCharCode` so the audit's own source
 * contains no literal Unicode escape sequences or mojibake bytes
 * that would trigger the audit against itself.
 *
 * Usage:
 *   node scripts/source-copy-audit.mjs                # blanket audit
 *   node scripts/source-copy-audit.mjs --scope        # audit only files
 *                                                    # listed in
 *                                                    # __source_copy_scope.txt
 *
 * Exit 0 when clean, 1 when any issue is found. The blanket mode
 * is intended for one-off audits; the scoped mode is intended to
 * gate just the files a particular change touched (so pre-existing
 * untouched escapes do not block CI). In scoped mode, untracked
 * files (i.e. new files added in this commit but not yet `git add`ed)
 * are treated as fully in-scope, since every line is "added".
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const FILES = [
  "src/app/cashback/page.tsx",
  "src/features/cashback/PublicCashbackHero.tsx",
  "src/features/cashback/PublicCashbackFlow.tsx",
  "src/features/cashback/PublicCashbackFlowWithPreview.tsx",
  "src/features/cashback/PublicCashbackFlow.test.tsx",
  "src/lib/auth/post-login-redirect.ts",
  "src/lib/auth/post-login-redirect.test.ts",
  "src/app/auth/actions.ts",
  "src/features/cashback/ShopeePurchaseTrigger.tsx",
  "src/features/cashback/ShopeeProductPreviewCard.tsx",
  "src/features/cashback/ShopeeCashbackPreviewForm.tsx",
  "src/repositories/shopee-reconciliation-ingestion.repository.ts",
  "src/repositories/shopee-reconciliation-attribution-mapper.ts",
  "src/repositories/shopee-reconciliation-attribution-mapper.test.ts",
  "scripts/shopee-reconciliation-ingestion-postgres.integration.test.ts",
  "src/services/shopee-generic-cashback.service.ts",
  "src/services/shopee-generic-cashback.service.test.ts",
  "src/services/shopee-programs.service.ts",
  "src/services/shopee-programs.service.test.ts",
  "src/services/shopee-programs.types.ts",
  "src/lib/mock/shopee-programs.ts",
  "src/features/cashback/ShopeePopularPrograms.tsx",
  "src/features/cashback/ShopeePopularPrograms.test.tsx",
  "scripts/shopee-classify-on-purchase-postgres.integration.test.ts",
  "src/app/app/cashback/actions.ts",
  "src/app/app/cashback/page.tsx",
  "src/app/cashback/page.tsx",
  "package.json",
  "src/reporting/addlivetag-types.ts",
  "src/reporting/addlivetag-client.ts",
  "src/reporting/addlivetag-client.test.ts",
  "src/reporting/addlivetag-normalizer.ts",
  "src/reporting/addlivetag-normalizer.test.ts",
  "src/reporting/addlivetag-staging.ts",
  "src/reporting/addlivetag-staging.server.ts",
  "src/reporting/addlivetag-staging.service.test.ts",
  "src/services/addlivetag-import.service.ts",
  "scripts/addlivetag-import.ts",
  "scripts/addlivetag-import-postgres.integration.test.ts",
  "src/app/app/admin/addlivetag/page.tsx",
  "src/app/app/admin/addlivetag/actions.ts",
  "src/db/schema.ts",
  "drizzle/0023_phase_20h8_addlivetag_source.sql",
  "src/services/public-deals.types.ts",
  "src/services/public-deals.service.ts",
  "src/services/public-deals.service.test.ts",
  "src/lib/mock/public-deals.ts",
  "src/features/deals/DealHero.tsx",
  "src/features/deals/PlatformTabs.tsx",
  "src/features/deals/DealCategoryTabs.tsx",
  "src/features/deals/VoucherCard.tsx",
  "src/features/deals/DealCard.tsx",
  "src/features/deals/CashbackProgramCard.tsx",
  "src/features/deals/DealGrid.tsx",
  "src/features/deals/SafeDisclosure.tsx",
  "src/features/deals/public-deals.components.test.tsx",
  "src/app/ma-giam-gia/page.tsx",
  "src/app/ma-giam-gia/[platform]/page.tsx",
];

// Marker byte strings assembled from code-point arithmetic so the
// audit's own source contains no literal mojibake or `\uXXXX`
// escapes. Each entry is a (string, human-readable name) pair.
const cp = (...codes) => String.fromCharCode(...codes);

const MOJIBAKE = [
  [cp(0x00c3), "A-tilde fragment"],
  [cp(0x00c4), "A-umlaut fragment"],
  [cp(0x00e1, 0x00ba), "a-ogonek fragment"],
  [cp(0x00e1, 0x00bb), "a-circumflex fragment"],
  [cp(0x00e2, 0x20ac, 0x00a6), "ellipsis fragment"],
  [cp(0x00c2), "C-cedilla / NBSP neighbour"],
  [cp(0x00a0), "NBSP (latin-1 alt)"],
  [cp(0x00b5), "micro sign"],
  [cp(0x00af), "macron"],
  [cp(0x00e6), "ae ligature"],
  [cp(0x00df), "sharp s"],
  [cp(0x255e), "box-drawing double right tee"],
  [cp(0x2551), "box-drawing double vertical bar"],
  [cp(0x2557), "box-drawing double down-left"],
  [cp(0x2500), "box-drawing horizontal (em-dash substitute)"],
];

const EM_DASH = cp(0x2014);
const ELLIPSIS = cp(0x2026);

const args = process.argv.slice(2);
const scoped = args.includes("--scope");
const filtered = args.filter((a) => a !== "--scope");
const root = resolve(filtered[0] ?? process.cwd());

console.log(`Auditing under: ${root}`);
console.log(
  `Mode:           ${
    scoped ? "scoped (added/modified lines only)" : "blanket (whole file)"
  }`,
);
console.log();

/**
 * Return the set of 1-based line numbers in `rel` that should be
 * considered "added" for the purposes of the scoped audit. Tracked
 * files that are clean relative to the index produce the empty set
 * (no added lines). Tracked files with a diff produce the union of
 * every `+` line in `git diff --unified=0`. Untracked files produce
 * the set of every 1-based line number in the file (whole file is
 * added).
 *
 * The untracked case is important: the cashback-flow landing page,
 * the public hero, and the public flow test are all newly created
 * files in this phase and `--scope` must audit them, not skip them.
 */
function collectAddedLineNumbers(cwd, rel, rawBytes) {
  // 1. Detect untracked files. `git ls-files --others
  //    --exclude-standard` prints paths of untracked files relative
  //    to cwd, one per line. If `rel` shows up, the whole file is
  //    new.
  try {
    const untrackedProc = spawnSync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "--", rel],
      { cwd, encoding: "utf-8" },
    );
    if (untrackedProc.status === 0) {
      const untrackedOut = (untrackedProc.stdout ?? "").trim();
      // `git ls-files -- <rel>` for an untracked file prints the path
      // verbatim; for a tracked file it prints nothing. Match by
      // either basename or full repo-relative path to be robust.
      if (untrackedOut.length > 0) {
        const untrackedLines = untrackedOut.split(/\r?\n/);
        if (
          untrackedLines.some(
            (p) => p === rel || p.endsWith("/" + rel) || p === rel.replace(/\\/g, "/"),
          )
        ) {
          const lineCount = rawBytes.toString("utf-8").split("\n").length;
          const all = new Set();
          for (let i = 1; i <= lineCount; i++) {
            all.add(i);
          }
          return all;
        }
      }
    }
  } catch {
    // Fall through to tracked-file handling.
  }

  // 2. Tracked file: parse `git diff --unified=0` to extract the
  //    1-based line numbers in the post-image file that start with
  //    `+`.
  try {
    const proc = spawnSync(
      "git",
      ["diff", "--unified=0", "--no-color", "--", rel],
      { cwd, encoding: "utf-8" },
    );
    if (proc.status !== 0) {
      return new Set();
    }
    const out = proc.stdout ?? "";
    const result = new Set();
    const lines = out.split("\n");
    let i = 0;
    while (i < lines.length) {
      const header = lines[i].match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (!header) {
        i++;
        continue;
      }
      let newLineNo = parseInt(header[1], 10);
      i++;
      while (i < lines.length && !lines[i].startsWith("@@")) {
        const ln = lines[i];
        if (ln.startsWith("+") && !ln.startsWith("+++")) {
          result.add(newLineNo);
        }
        if (!ln.startsWith("-")) {
          newLineNo++;
        }
        i++;
      }
    }
    return result;
  } catch {
    return new Set();
  }
}

const scopeFile = join(root, "__source_copy_scope.txt");
let filesToAudit = FILES;
if (scoped && existsSync(scopeFile)) {
  const scope = readFileSync(scopeFile, "utf-8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  filesToAudit = scope;
}

let anyFail = false;
const totalIssues = {
  mojibake: 0,
  emDash: 0,
  escape: 0,
  structure: 0,
  ellipsis: 0,
};

for (const rel of filesToAudit) {
  const path = join(root, rel);
  let data;
  try {
    data = readFileSync(path);
  } catch {
    console.log(`[skip] ${rel}: not found`);
    continue;
  }
  const text = data.toString("utf-8");
  const issues = [];

  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    issues.push("BOM present");
    totalIssues.structure++;
  }
  if (data.includes(0x00)) {
    issues.push("null bytes present");
    totalIssues.structure++;
  }
  if (data[data.length - 1] !== 0x0a) {
    issues.push("missing final newline");
    totalIssues.structure++;
  }
  for (const [marker, name] of MOJIBAKE) {
    if (text.includes(marker)) {
      const idx = text.indexOf(marker);
      const ctx = text
        .slice(Math.max(0, idx - 25), idx + 35)
        .replace(/\n/g, "\\n");
      issues.push(
        `mojibake (${name}) at offset ${idx}: ${JSON.stringify(ctx)}`,
      );
      totalIssues.mojibake++;
    }
  }
  if (text.includes(EM_DASH)) {
    const idx = text.indexOf(EM_DASH);
    const ctx = text
      .slice(Math.max(0, idx - 25), idx + 35)
      .replace(/\n/g, "\\n");
    issues.push(`em-dash U+2014 at offset ${idx}: ${JSON.stringify(ctx)}`);
    totalIssues.emDash++;
  }
  if (text.includes(ELLIPSIS)) {
    const matches = text.split(ELLIPSIS).length - 1;
    totalIssues.ellipsis += matches;
    issues.push(`info: ${matches} x U+2026 ellipsis`);
  }
  // literal `\uXXXX` escapes can appear in any JS-flavour source
  // file. We audit `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs`,
  // and `.cjs`. Plain `.json`/`.md`/`.txt` are excluded because
  // the project stores those with the literal strings already
  // resolved.
  const isJsLike =
    rel.endsWith(".ts") ||
    rel.endsWith(".tsx") ||
    rel.endsWith(".mts") ||
    rel.endsWith(".cts") ||
    rel.endsWith(".js") ||
    rel.endsWith(".mjs") ||
    rel.endsWith(".cjs");
  if (isJsLike) {
    // For the scoped audit we only want to flag `\uXXXX` escapes
    // that appear in lines we added in this commit. Parse the git
    // diff to extract added line numbers; untracked files
    // contribute every line of the file. For the blanket audit we
    // report every escape, preserving original behaviour.
    const targetLineNumbers = scoped
      ? collectAddedLineNumbers(root, rel, data)
      : null;
    const lines = text.split("\n");
    const re = /\\u[0-9A-Fa-f]{4}/g;
    let m;
    let count = 0;
    while ((m = re.exec(text)) !== null) {
      if (targetLineNumbers !== null) {
        // Convert the character offset in `text` to a 1-based line
        // number using the line index table.
        let lineNo = 1;
        let acc = 0;
        for (let i = 0; i < lines.length; i++) {
          const lineLen = lines[i].length + 1; // +1 for the \n
          if (m.index < acc + lineLen) {
            lineNo = i + 1;
            break;
          }
          acc += lineLen;
        }
        if (!targetLineNumbers.has(lineNo)) {
          continue;
        }
      }
      count++;
      if (count <= 5) {
        const ctx = text
          .slice(Math.max(0, m.index - 25), m.index + 35)
          .replace(/\n/g, "\\n");
        issues.push(
          `literal \\uXXXX at offset ${m.index}: ${JSON.stringify(ctx)}`,
        );
      }
    }
    if (count > 5) {
      issues.push(
        `... and ${count - 5} more \\uXXXX escapes (total ${count})`,
      );
    }
    totalIssues.escape += count;
  }

  if (issues.length > 0) {
    anyFail = true;
    console.log(`[FAIL] ${rel}`);
    for (const i of issues) {
      console.log(`        - ${i}`);
    }
  } else {
    console.log(`[OK]   ${rel}`);
  }
}

console.log();
console.log("Summary:");
console.log(`  mojibake markers:    ${totalIssues.mojibake}`);
console.log(`  em-dash:             ${totalIssues.emDash}`);
console.log(`  literal \\uXXXX:     ${totalIssues.escape}`);
console.log(`  structural:          ${totalIssues.structure}`);
console.log(`  ellipsis (info):     ${totalIssues.ellipsis}`);
console.log(`  result:              ${anyFail ? "FAIL" : "OK"}`);

process.exit(anyFail ? 1 : 0);
