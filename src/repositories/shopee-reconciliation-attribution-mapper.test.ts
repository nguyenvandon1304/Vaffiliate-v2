/**
 * Phase 20H.6 -- unit tests for the pure matcher-result -> repository-result
 * mapper. Covers every Phase 20H.5 attribution outcome kind and asserts
 * the expanded safe-details invariant: no details field may contain any
 * of FORBIDDEN_DETAIL_TOKENS.
 *
 * These tests do NOT exercise the DB-backed reconcile entry point --
 * that is covered by scripts/shopee-reconciliation-ingestion-postgres.integration.test.ts
 * which follows the same pattern as
 * scripts/shopee-conversion-promoter-postgres.integration.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  FORBIDDEN_DETAIL_TOKENS,
  mapAttributionResultToInvalid,
  throwSafeDetailsIfForbidden,
  type AttributionInvalidResult,
} from "./shopee-reconciliation-attribution-mapper";

import type { ShopeeAttributionResult } from "@/services/shopee-attribution-matcher";

function assertNoForbiddenTokens(value: string, label: string): void {
  for (const t of FORBIDDEN_DETAIL_TOKENS) {
    assert.ok(
      !value.includes(t),
      `${label} leaked forbidden token ${t}: ${value}`,
    );
  }
}

test("mapper returns null when matcher returns matched", () => {
  const result = mapAttributionResultToInvalid({ kind: "matched" });
  assert.equal(result, null);
});

test("mapper maps missing_attribution_field (subKind=null) to safe details", () => {
  const result: AttributionInvalidResult | null =
    mapAttributionResultToInvalid({
      kind: "missing_attribution_field",
      subKind: "source_sub_id1_null",
    });
  assert.ok(result !== null);
  if (!result) return;
  assert.equal(result.kind, "attribution_invalid");
  assert.equal(result.reason, "missing_attribution_field");
  assert.equal(result.attributionSubKind, "source_sub_id1_null");
  assertNoForbiddenTokens(result.details, "null attribution details");
  // Generic, non-technical details copy.
  assert.match(
    result.details,
    /The Shopee source row is missing an attribution value\./,
  );
  // No technical labels leak.
  assert.ok(!/missing_attribution_field/.test(result.details));
  assert.ok(!/source_sub_id1/.test(result.details));
});

test("mapper maps missing_attribution_field (subKind=blank) to safe details", () => {
  const result = mapAttributionResultToInvalid({
    kind: "missing_attribution_field",
    subKind: "source_sub_id1_blank",
  });
  assert.ok(result !== null);
  if (!result) return;
  assert.equal(result.kind, "attribution_invalid");
  assert.equal(result.reason, "missing_attribution_field");
  assert.equal(result.attributionSubKind, "source_sub_id1_blank");
  assertNoForbiddenTokens(result.details, "blank attribution details");
});

test("mapper maps invalid_attribution_format to safe details", () => {
  const result = mapAttributionResultToInvalid({
    kind: "invalid_attribution_format",
  });
  assert.ok(result !== null);
  if (!result) return;
  assert.equal(result.kind, "attribution_invalid");
  assert.equal(result.reason, "invalid_attribution_format");
  assertNoForbiddenTokens(result.details, "invalid format details");
  assert.match(
    result.details,
    /The Shopee source row attribution value is not in the expected format\./,
  );
});

test("mapper maps sub_id_mismatch to safe details", () => {
  const result = mapAttributionResultToInvalid({ kind: "sub_id_mismatch" });
  assert.ok(result !== null);
  if (!result) return;
  assert.equal(result.kind, "attribution_invalid");
  assert.equal(result.reason, "sub_id_mismatch");
  assertNoForbiddenTokens(result.details, "sub_id_mismatch details");
  assert.match(
    result.details,
    /does not match the purchase intent\./,
  );
});

test("mapper maps intent_not_redirect_prepared to safe details", () => {
  for (const reason of [
    "intent_status_pending",
    "intent_status_expired",
    "intent_status_consumed",
    "intent_status_unknown",
  ] as const) {
    const result = mapAttributionResultToInvalid({
      kind: "intent_not_redirect_prepared",
      reason,
    });
    assert.ok(result !== null);
    if (!result) return;
    assert.equal(result.kind, "attribution_invalid");
    assert.equal(result.reason, "intent_not_redirect_prepared");
    assert.equal(result.intentStatusReason, reason);
    assertNoForbiddenTokens(result.details, "intent not redirect prepared details");
    assert.match(
      result.details,
      /The matched purchase intent is not ready for reconciliation\./,
    );
  }
});

test("mapper maps intent_missing_required_field (publisher) to safe details", () => {
  const result = mapAttributionResultToInvalid({
    kind: "intent_missing_required_field",
    subKind: "publisher_id_blank",
  });
  assert.ok(result !== null);
  if (!result) return;
  assert.equal(result.kind, "attribution_invalid");
  assert.equal(result.reason, "intent_missing_required_field");
  assert.equal(result.attributionSubKind, "publisher_id_blank");
  assertNoForbiddenTokens(result.details, "publisher blank details");
  assert.match(
    result.details,
    /The matched purchase intent is missing required attribution context\./,
  );
});

test("mapper maps intent_missing_required_field (tracking link) to safe details", () => {
  const result = mapAttributionResultToInvalid({
    kind: "intent_missing_required_field",
    subKind: "tracking_link_id_blank",
  });
  assert.ok(result !== null);
  if (!result) return;
  assert.equal(result.kind, "attribution_invalid");
  assert.equal(result.reason, "intent_missing_required_field");
  assert.equal(result.attributionSubKind, "tracking_link_id_blank");
  assertNoForbiddenTokens(result.details, "tracking link blank details");
});

test("every typed failure carries NO forbidden token in details", () => {
  const outcomes: ShopeeAttributionResult[] = [
    { kind: "missing_attribution_field", subKind: "source_sub_id1_null" },
    { kind: "missing_attribution_field", subKind: "source_sub_id1_blank" },
    { kind: "invalid_attribution_format" },
    { kind: "sub_id_mismatch" },
    { kind: "intent_not_redirect_prepared", reason: "intent_status_pending" },
    { kind: "intent_not_redirect_prepared", reason: "intent_status_unknown" },
    {
      kind: "intent_missing_required_field",
      subKind: "publisher_id_blank",
    },
    {
      kind: "intent_missing_required_field",
      subKind: "tracking_link_id_blank",
    },
  ];
  for (const o of outcomes) {
    const result = mapAttributionResultToInvalid(o);
    assert.ok(result !== null, `expected non-null result for ${o.kind}`);
    if (!result) continue;
    assertNoForbiddenTokens(result.details, `details for ${o.kind}`);
  }
});

test("throwSafeDetailsIfForbidden throws for every expanded forbidden token", () => {
  for (const t of FORBIDDEN_DETAIL_TOKENS) {
    assert.throws(
      () => throwSafeDetailsIfForbidden(`see ${t} here`),
      new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `expected throwSafeDetailsIfForbidden to throw for token ${t}`,
    );
  }
});

test("throwSafeDetailsIfForbidden throws for any token embedded mid-string", () => {
  assert.throws(() => throwSafeDetailsIfForbidden("prefix vaflnksuffix"));
  assert.throws(() => throwSafeDetailsIfForbidden("a/b/go/c"));
  assert.throws(() => throwSafeDetailsIfForbidden("xxnetworkSubId"));
  assert.throws(() => throwSafeDetailsIfForbidden("xxsourceSubId1"));
  assert.throws(() => throwSafeDetailsIfForbidden("xxsource_sub_id1"));
  assert.throws(() => throwSafeDetailsIfForbidden("xxpurchaseIntentId"));
  assert.throws(() => throwSafeDetailsIfForbidden("xxtrackingLinkId"));
  assert.throws(() => throwSafeDetailsIfForbidden("xxpublisherId"));
  assert.throws(() => throwSafeDetailsIfForbidden("xxshortCode"));
  assert.throws(() => throwSafeDetailsIfForbidden("xxclickId"));
  assert.throws(() => throwSafeDetailsIfForbidden("xxtrackingPath"));
  assert.throws(() => throwSafeDetailsIfForbidden("xxan_redir"));
});

test("throwSafeDetailsIfForbidden does not throw on safe strings", () => {
  assert.doesNotThrow(() =>
    throwSafeDetailsIfForbidden("All good -- safe generic message."),
  );
  assert.doesNotThrow(() =>
    throwSafeDetailsIfForbidden(
      "The matched purchase intent is missing required attribution context.",
    ),
  );
});

test("mapper details never leak any closed-enum technical label", () => {
  // The technical labels below MUST live in the typed `reason` /
  // `attributionSubKind` / `intentStatusReason` structured fields, never
  // inside `details`.
  const forbiddenLabelsInDetails = [
    "missing_attribution_field",
    "invalid_attribution_format",
    "sub_id_mismatch",
    "intent_not_redirect_prepared",
    "intent_missing_required_field",
    "source_sub_id1_null",
    "source_sub_id1_blank",
    "publisher_id_blank",
    "tracking_link_id_blank",
    "intent_status_pending",
    "intent_status_expired",
    "intent_status_consumed",
    "intent_status_unknown",
  ];
  const outcomes: ShopeeAttributionResult[] = [
    { kind: "missing_attribution_field", subKind: "source_sub_id1_null" },
    { kind: "missing_attribution_field", subKind: "source_sub_id1_blank" },
    { kind: "invalid_attribution_format" },
    { kind: "sub_id_mismatch" },
    { kind: "intent_not_redirect_prepared", reason: "intent_status_pending" },
    {
      kind: "intent_missing_required_field",
      subKind: "publisher_id_blank",
    },
    {
      kind: "intent_missing_required_field",
      subKind: "tracking_link_id_blank",
    },
  ];
  for (const o of outcomes) {
    const r = mapAttributionResultToInvalid(o);
    assert.ok(r !== null);
    if (!r) continue;
    for (const label of forbiddenLabelsInDetails) {
      assert.ok(
        !r.details.includes(label),
        `mapper details leaked closed-enum label ${label}: ${r.details}`,
      );
    }
  }
});
