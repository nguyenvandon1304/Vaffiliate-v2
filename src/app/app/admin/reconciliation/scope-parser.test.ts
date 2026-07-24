/**
 * Phase 20K checkpoint 4G1H -- focused executable tests for the
 * server-action scope parser.
 *
 * The parser is a pure synchronous function exported from
 * `./scope-parser` (a sibling module to `./actions`, so the
 * `"use server"` + `server-only` import constraints of Next.js
 * do not block unit tests).
 *
 * Required assertions (per the 4G1H task spec):
 *
 *   1. FormData carrying `scope_explicit_conversion_ids=<uuid>`
 *      does NOT produce a non-empty `explicitConversionIds` on
 *      the returned scope.
 *   2. FormData carrying both an ingestion-event boundary AND
 *      `scope_explicit_conversion_ids=<uuid>` produces only the
 *      ingestionEventIds boundary; the explicit-id field is
 *      silently ignored.
 *   3. The existing safe boundaries (`ingestionEventIds`,
 *      `sourceConversionKeys`, `occurredAfter`, `occurredBefore`)
 *      continue to parse normally.
 *
 * Plus a defense-in-depth static check that `actions.ts` no
 * longer references `scope_explicit_conversion_ids` or
 * `explicitConversionIds` at all (the parser is the only
 * external-reachable scope builder).
 */

import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { readBoundedSourceScope } from "./scope-parser";

const VALID_UUID_A = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";
const VALID_UUID_C = "33333333-3333-4333-8333-333333333333";

const ACTIONS_PATH =
  "D:/Vaffiliate/web/src/app/app/admin/reconciliation/actions.ts";
const SCOPE_PARSER_PATH =
  "D:/Vaffiliate/web/src/app/app/admin/reconciliation/scope-parser.ts";

function readSource(relPath: string): string {
  return readFileSync(relPath, "utf8");
}

test("Phase 20K 4G1H: handcrafted scope_explicit_conversion_ids is silently ignored", () => {
  const fd = new FormData();
  fd.set("scope_explicit_conversion_ids", VALID_UUID_A);
  const scope = readBoundedSourceScope(fd);
  // The returned scope must NOT carry any explicitConversionIds
  // boundary. `explicitConversionIds` is server-internal only.
  assert.ok(
    scope.explicitConversionIds === undefined,
    "readBoundedSourceScope must not return an explicitConversionIds key",
  );
  // And no fallback to `[]` either -- the key is omitted entirely.
  const json = JSON.stringify(scope);
  assert.equal(
    json.includes("explicitConversionIds"),
    false,
    "serialized scope must not mention explicitConversionIds",
  );
  // No other boundary was supplied, so the parser returns the
  // four safe-boundary keys with empty/undefined values and NO
  // `explicitConversionIds` key at all.
  assert.deepEqual(
    Object.keys(scope).sort(),
    [
      "ingestionEventIds",
      "occurredAfter",
      "occurredBefore",
      "sourceConversionKeys",
    ],
    "scope must expose ONLY the four safe-boundary keys",
  );
  // Every safe boundary is empty / undefined.
  assert.deepEqual(scope.ingestionEventIds, []);
  assert.deepEqual(scope.sourceConversionKeys, []);
  assert.equal(scope.occurredAfter, undefined);
  assert.equal(scope.occurredBefore, undefined);
});

test("Phase 20K 4G1H: explicit-id field is ignored when a safe boundary is also supplied", () => {
  const fd = new FormData();
  fd.set("scope_ingestion_event_ids", VALID_UUID_A + "," + VALID_UUID_B);
  fd.set("scope_explicit_conversion_ids", VALID_UUID_C);
  const scope = readBoundedSourceScope(fd);
  // The ingestionEventIds boundary is preserved verbatim.
  assert.deepEqual(scope.ingestionEventIds, [VALID_UUID_A, VALID_UUID_B]);
  // sourceConversionKeys + occurredAfter + occurredBefore stay
  // empty.
  assert.deepEqual(scope.sourceConversionKeys, []);
  assert.equal(scope.occurredAfter, undefined);
  assert.equal(scope.occurredBefore, undefined);
  // And -- critically -- the explicit-id field is dropped on
  // the floor. The returned scope must not contain the key.
  assert.ok(scope.explicitConversionIds === undefined);
  const json = JSON.stringify(scope);
  assert.equal(
    json.includes("explicitConversionIds"),
    false,
    "serialized scope must not mention explicitConversionIds even when a safe boundary is present",
  );
  assert.equal(
    json.includes(VALID_UUID_C),
    false,
    "explicit-id UUID must not leak into the serialized scope",
  );
});

test("Phase 20K 4G1H: safe boundaries continue to parse normally", () => {
  const fd = new FormData();
  fd.set(
    "scope_source_conversion_keys",
    "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd," +
      "def456def456def456def456def456def456def456def456def456def456def4",
  );
  fd.set("scope_occurred_after", "2026-07-01T00:00:00.000Z");
  fd.set("scope_occurred_before", "2026-07-12T00:00:00.000Z");
  const scope = readBoundedSourceScope(fd);
  assert.equal(scope.sourceConversionKeys?.length, 2);
  assert.equal(scope.occurredAfter, "2026-07-01T00:00:00.000Z");
  assert.equal(scope.occurredBefore, "2026-07-12T00:00:00.000Z");
  assert.deepEqual(scope.ingestionEventIds, []);
  assert.ok(scope.explicitConversionIds === undefined);
});

test("Phase 20K 4G1H: actions.ts no longer references scope_explicit_conversion_ids or explicitConversionIds", () => {
  const actions = readSource(ACTIONS_PATH);
  assert.equal(
    actions.includes("scope_explicit_conversion_ids"),
    false,
    "actions.ts must not read scope_explicit_conversion_ids from FormData",
  );
  assert.equal(
    actions.includes("explicitConversionIds"),
    false,
    "actions.ts must not reference explicitConversionIds anywhere",
  );
  // The parser module MUST be the one and only production
  // place that documents the dropped-field contract.
  const parser = readSource(SCOPE_PARSER_PATH);
  assert.ok(
    parser.includes("scope_explicit_conversion_ids"),
    "scope-parser.ts must declare the dropped-field contract in a comment",
  );
});