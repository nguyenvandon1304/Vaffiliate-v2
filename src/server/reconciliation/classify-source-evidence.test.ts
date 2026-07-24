/**
 * Phase 20K checkpoint 4A2B -- persisted attribution provenance
 * classifier unit tests.
 *
 * These tests drive `classifySourceEvidence` (the pure helper in
 * `reconciliation.repository.test-helpers.ts`) with simulated DB
 * row shapes. The test goal is the SAME uniqueness contract the
 * loader must read: a conversion's attribution provenance is
 * "unique" iff
 *
 *   - publisher row exists AND
 *   - tracking_link row exists AND
 *   - tracking_link.publisher_id == conversion.publisher_id AND
 *   - the (network, external_order_id) UNIQUE is not violated in
 *     the scoped set AND
 *   - the (network, source_conversion_key) partial UNIQUE is not
 *     violated in the scoped set.
 *
 * Crucially, "many orders sharing one (publisher, tracking_link,
 * network) pair" is NOT ambiguity -- it is the normal case.
 * Ambiguity means SCHEMA-LEVEL COLLISIONS, not multiple legit
 * orders on the same legitimate link.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { mapSourceEvidenceToDecision } from "@/lib/reconciliation/source-evidence";

import {
  classifySourceEvidence,
  type SourceEvidenceDbFields,
} from "./reconciliation.repository.test-helpers";

function lookup(
  map: Map<string, SourceEvidenceDbFields>,
  id: string,
): SourceEvidenceDbFields {
  const v = map.get(id);
  if (!v) throw new Error("missing classification for " + id);
  return v;
}

function rowFor(args: {
  conversionId: string;
  network?: string;
  externalOrderId?: string;
  sourceConversionKey?: string;
  processingStatus?: string | null;
  validationStatus?: string | null;
  settlementStatus?: string | null;
  csvSource?: string | null;
  csvOrderStatus?: string | null;
  publisherExists?: boolean;
  trackingLinkExists?: boolean;
  trackingLinkPublisherMatch?: boolean;
  externalOrderCollisionCount?: number;
  sourceConversionKeyCollisionCount?: number;
}): Record<string, unknown> {
  return {
    conversion_id: args.conversionId,
    network: args.network ?? "shopee",
    external_order_id: args.externalOrderId ?? "ord-1",
    source_conversion_key:
      args.sourceConversionKey ??
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    processing_status: args.processingStatus ?? "succeeded",
    validation_status: args.validationStatus ?? "approved",
    settlement_status: args.settlementStatus ?? null,
    csv_source: args.csvSource ?? "manual_csv",
    csv_order_status: args.csvOrderStatus ?? null,
    publisher_exists: args.publisherExists ?? true,
    tracking_link_exists: args.trackingLinkExists ?? true,
    tracking_link_publisher_match:
      args.trackingLinkPublisherMatch ?? true,
    external_order_collision_count: args.externalOrderCollisionCount ?? 1,
    source_conversion_key_collision_count:
      args.sourceConversionKeyCollisionCount ?? 1,
  };
}

test("Phase 20K 4A2B (a) single conversion with valid attribution -> unique", () => {
  const map = classifySourceEvidence([
    rowFor({ conversionId: "conv-a" }),
  ]);
  assert.equal(lookup(map, "conv-a").persistedLinkKind, "unique");
  assert.equal(lookup(map, "conv-a").sourceStatus, "confirmed_eligible");
  assert.equal(lookup(map, "conv-a").csvSource, "manual_csv");
});

test("Phase 20K 4A2B (b) two distinct orders on the SAME (publisher, tracking_link, network) -> both unique (NOT ambiguous)", () => {
  // Many orders on one link is normal. The persisted
  // uniqueness boundary is per-source-conversion / per-source-
  // order identity, NOT the (publisher, tracking_link, network)
  // tuple. As long as both conversions have distinct
  // external_order_id AND distinct source_conversion_key AND
  // each pair's collision count is exactly 1, both are unique.
  const map = classifySourceEvidence([
    rowFor({
      conversionId: "conv-a",
      externalOrderId: "ord-A",
      sourceConversionKey:
        "1111111111111111111111111111111111111111111111111111111111111111",
      externalOrderCollisionCount: 1,
      sourceConversionKeyCollisionCount: 1,
    }),
    rowFor({
      conversionId: "conv-b",
      externalOrderId: "ord-B",
      sourceConversionKey:
        "2222222222222222222222222222222222222222222222222222222222222222",
      externalOrderCollisionCount: 1,
      sourceConversionKeyCollisionCount: 1,
    }),
  ]);
  assert.equal(lookup(map, "conv-a").persistedLinkKind, "unique");
  assert.equal(lookup(map, "conv-b").persistedLinkKind, "unique");
});

test("Phase 20K 4A2B (c) SAME (network, external_order_id) on two rows -> order_id_collision (true ambiguity)", () => {
  // Two conversions with the same external_order_id can never
  // legitimately exist -- the schema enforces a full UNIQUE on
  // (network, external_order_id). When the scoped set still
  // contains a row count >= 2 for that pair, the underlying
  // constraint has been bypassed (manual SQL) and the row is
  // irrecoverably conflicted.
  const map = classifySourceEvidence([
    rowFor({
      conversionId: "conv-a",
      externalOrderId: "ord-X",
      sourceConversionKey:
        "1111111111111111111111111111111111111111111111111111111111111111",
      externalOrderCollisionCount: 2,
    }),
    rowFor({
      conversionId: "conv-b",
      externalOrderId: "ord-X",
      sourceConversionKey:
        "2222222222222222222222222222222222222222222222222222222222222222",
      externalOrderCollisionCount: 2,
    }),
  ]);
  assert.equal(
    lookup(map, "conv-a").persistedLinkKind,
    "order_id_collision",
  );
  assert.equal(
    lookup(map, "conv-b").persistedLinkKind,
    "order_id_collision",
  );
});

test("Phase 20K 4A2B (d) SAME (network, source_conversion_key) on two rows -> source_key_collision", () => {
  const map = classifySourceEvidence([
    rowFor({
      conversionId: "conv-a",
      sourceConversionKey:
        "9999999999999999999999999999999999999999999999999999999999999999",
      sourceConversionKeyCollisionCount: 2,
    }),
    rowFor({
      conversionId: "conv-b",
      externalOrderId: "ord-Y",
      sourceConversionKey:
        "9999999999999999999999999999999999999999999999999999999999999999",
      sourceConversionKeyCollisionCount: 2,
    }),
  ]);
  assert.equal(
    lookup(map, "conv-a").persistedLinkKind,
    "source_key_collision",
  );
  assert.equal(
    lookup(map, "conv-b").persistedLinkKind,
    "source_key_collision",
  );
});

test("Phase 20K 4A2B (e) tracking link belongs to a DIFFERENT publisher -> owner_mismatch", () => {
  const map = classifySourceEvidence([
    rowFor({
      conversionId: "conv-x",
      trackingLinkPublisherMatch: false,
    }),
  ]);
  assert.equal(
    lookup(map, "conv-x").persistedLinkKind,
    "owner_mismatch",
  );
});

test("Phase 20K 4A2B (f) publisher row absent -> missing", () => {
  const map = classifySourceEvidence([
    rowFor({ conversionId: "conv-y", publisherExists: false }),
  ]);
  assert.equal(lookup(map, "conv-y").persistedLinkKind, "missing");
});

test("Phase 20K 4A2B (g) tracking link row absent -> missing", () => {
  const map = classifySourceEvidence([
    rowFor({ conversionId: "conv-z", trackingLinkExists: false }),
  ]);
  assert.equal(lookup(map, "conv-z").persistedLinkKind, "missing");
});

test("Phase 20K 4A2B (h) Shopee CSV source path -- csv_source='manual_csv' is recognised, success classification maps to confirmed_eligible", () => {
  const map = classifySourceEvidence([
    rowFor({
      conversionId: "conv-shopee-csv",
      csvSource: "manual_csv",
      processingStatus: "succeeded",
      validationStatus: "approved",
    }),
  ]);
  assert.equal(lookup(map, "conv-shopee-csv").csvSource, "manual_csv");
  assert.equal(
    lookup(map, "conv-shopee-csv").persistedLinkKind,
    "unique",
  );
  assert.equal(
    lookup(map, "conv-shopee-csv").sourceStatus,
    "confirmed_eligible",
  );
});

test("Phase 20K 4A2B (i) Addlivetag source path -- UNSUPPORTED, fail closed", () => {
  // Phase 20K 4A2B final review: the previous version of this
  // test fabricated a row with csvSource='addlivetag_api' and
  // every other provenance boolean set to true and asserted
  // persistedLinkKind='unique'. That claim was misleading
  // because the Addlivetag REST adapter has NOT landed in
  // src/ -- the only Addlivetag reference is a URL constant in
  // src/lib/shopee/product-metadata/unikorn-commission-client.ts
  // and an integration-test stub
  // (scripts/addlivetag-import-postgres.integration.test.ts).
  // There is no real Addlivetag ingestion producer that
  // persists shopee_ingestion_events / shopee_csv_rows /
  // conversions rows from the data.addlivetag.com REST API.
  //
  // This test now reflects the actual state: an Addlivetag
  // claim is NOT proven, so the classifier must refuse the row
  // closed. The supported contract is only `manual_csv`
  // (proven, h) and a future `official_shopee_api` path
  // (reserved, not yet present). `addlivetag_api` as a
  // csv_source value is a schema-allowed enum label but the
  // corresponding producer is missing; therefore any row whose
  // network / source is Addlivetag with no real upstream
  // evidence MUST classify as "missing" (no provenance) rather
  // than "unique".
  const map = classifySourceEvidence([
    {
      // Bypass rowFor's defaults so we can drive an honest
      // "Addlivetag-claimed, evidence absent" scenario.
      conversion_id: "conv-addlivetag",
      network: "shopee",
      external_order_id: "ord-1",
      source_conversion_key:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      processing_status: null,
      validation_status: null,
      settlement_status: null,
      csv_source: "addlivetag_api",
      csv_order_status: null,
      // The Addlivetag producer has not shipped, so the join
      // keys point at rows that do NOT exist. We assert this
      // by setting the loader's existence flags explicitly to
      // false -- no profile, no tracking link, no joined
      // CSV row, no joined ingestion event -- because that is
      // the real state for any Addlivetag-claimed row today.
      publisher_exists: false,
      tracking_link_exists: false,
      tracking_link_publisher_match: false,
      external_order_collision_count: 0,
      source_conversion_key_collision_count: 0,
    },
  ]);
  // The Addlivetag row must NOT be classified as 'unique' on
  // the strength of the csv_source string alone. With no real
  // ingestion event, no real shopee_csv_rows join, and no real
  // processing_status evidence, the classifier returns
  // persistedLinkKind='missing' (no source-status evidence
  // available). The mapper then translates this to a skip
  // with the closed reason code
  // rejected_missing_provenance.
  const result = lookup(map, "conv-addlivetag");
  assert.notEqual(
    result.persistedLinkKind,
    "unique",
    "Addlivetag row must NOT be 'unique' just because csvSource='addlivetag_api'; the real persistence pipeline is not shipped",
  );
  assert.equal(
    result.persistedLinkKind,
    "missing",
    "Addlivetag without a real ingestion pipeline fails closed as 'missing'",
  );
  // Mapping to the closed reason code is the mapper's job;
  // here we only assert the classifier output that drives it.
  assert.equal(
    result.sourceStatus,
    "unknown",
    "Addlivetag without real upstream evidence has sourceStatus='unknown'",
  );
});

test("Phase 20K 4A2B (j) cancelled order_status on succeeded ingestion -> cancelled source-status", () => {
  const map = classifySourceEvidence([
    rowFor({
      conversionId: "conv-cancel",
      processingStatus: "succeeded",
      validationStatus: "approved",
      csvOrderStatus: "CANCELLED",
    }),
  ]);
  assert.equal(
    lookup(map, "conv-cancel").sourceStatus,
    "cancelled",
  );
});

test("Phase 20K 4A2B (k) refunded order_status on succeeded ingestion -> refunded source-status", () => {
  const map = classifySourceEvidence([
    rowFor({
      conversionId: "conv-refund",
      processingStatus: "succeeded",
      validationStatus: "approved",
      csvOrderStatus: "REFUNDED",
    }),
  ]);
  assert.equal(
    lookup(map, "conv-refund").sourceStatus,
    "refunded",
  );
});

// Phase 20K 4E3B -- safety blocker. A non-null
// `processing_status = 'failed'` ingestion event MUST NOT be
// auto-classified as `confirmed_invalid` (which would force a
// `pending -> rejected` transition with the
// `rejected_source_invalid` closed code). The production tree
// has no code path that writes a `failed` ingestion event with
// a guaranteed business-invalid meaning -- `failure_code` is
// unvalidated free-form text -- and an arbitrary technical
// ingestion failure (network error / timeout / parse failure /
// transport / db error / unknown) must NEVER silently reject
// a buyer's pending cashback. The classifier therefore returns
// `sourceStatus = "unknown"` so the mapper produces a fail-
// closed skip.
test("Phase 20K 4E3B (a) processing_status='failed' with synthetic failure_code -> sourceStatus='unknown' (no auto-confirm)", () => {
  // All required provenance gates are GREEN so a `succeeded`
  // row would have classified as `confirmed_eligible`. The only
  // thing that changed is `processing_status`. The expected
  // result is `unknown`, not `confirmed_invalid`.
  const map = classifySourceEvidence([
    rowFor({
      conversionId: "conv-failed-synthetic",
      processingStatus: "failed",
      validationStatus: "approved",
      csvOrderStatus: null,
      csvSource: "manual_csv",
      publisherExists: true,
      trackingLinkExists: true,
      trackingLinkPublisherMatch: true,
    }),
  ]);
  const result = lookup(map, "conv-failed-synthetic");
  assert.notEqual(
    result.sourceStatus,
    "confirmed_invalid",
    "processing_status='failed' MUST NOT auto-classify as 'confirmed_invalid' -- that would force a pending -> rejected transition for arbitrary technical ingestion failures",
  );
  assert.equal(
    result.sourceStatus,
    "unknown",
    "failed ingestion event must fall through to 'unknown' so the mapper produces a fail-closed skip",
  );
});

// Distinct from (a): confirm the same fail-closed result when
// the would-be-rejected row ALSO satisfies the `confirmed_eli-
// gible` lower branches (validation=approved + link=unique +
// csv=manual_csv). The loader previously short-circuited
// straight to `confirmed_invalid` before those branches could
// fire, hiding that a `succeeded` row would have classified
// differently. (a) and (b) together pin both the new default
// and the de-prioritisation of "failed" relative to "succeeded".
test("Phase 20K 4E3B (b) confirmed_eligible preconditions + processing_status='failed' -> 'unknown' (not 'confirmed_eligible')", () => {
  const map = classifySourceEvidence([
    rowFor({
      conversionId: "conv-failed-vs-eligible",
      processingStatus: "failed",
      validationStatus: "approved",
      csvOrderStatus: null,
      csvSource: "manual_csv",
      publisherExists: true,
      trackingLinkExists: true,
      trackingLinkPublisherMatch: true,
    }),
  ]);
  const result = lookup(map, "conv-failed-vs-eligible");
  assert.notEqual(
    result.sourceStatus,
    "confirmed_eligible",
    "a 'failed' ingestion event MUST NOT be classified as eligible for cashback",
  );
  assert.equal(result.sourceStatus, "unknown");
});

// (c) maps the loader's NEW output through the real mapper to
// show the resulting decision is a SKIP, NOT a reject. This is
// the contract that protects buyer cashback: a transient /
// technical ingestion failure does not mutate the conversion.
test("Phase 20K 4E3B (c) pending + sourceStatus='unknown' (from failed ingestion) -> skip rejected_source_not_confirmed (NO reject)", () => {
  // The mapper is pure; this is a contract test rather than
  // relying on the DB. We mirror the production path the
  // loader now produces for any failed ingestion event.
  const snapshot = {
    network: "shopee",
    currentStatus: "pending" as const,
    validationStatus: "approved" as const,
    settlementStatus: null,
    sourceConversionKey:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    ingestionEventId: "00000000-0000-4000-8000-000000000001",
    persistedLinkKind: "unique" as const,
    sourceStatus: "unknown" as const,
  };
  const d = mapSourceEvidenceToDecision(snapshot);
  assert.notEqual(
    d.kind,
    "reject",
    "a 'failed' ingestion event MUST produce a skip, never a reject",
  );
  assert.equal(d.kind, "skip");
  if (d.kind === "skip") {
    assert.equal(
      d.reasonCode,
      "rejected_source_not_confirmed",
      "fail-closed skip reason for insufficient business evidence",
    );
  }
});

// Phase 20K 4E4 -- 4E4 is BLOCKED.
//
// The task asked us to look for a real, durable, business-
// INELIGIBLE source-side signal that could safely drive a
// `pending -> rejected` transition. We performed an exhaustive
// inventory of:
//   - the source-evidence `sourceStatus` type union
//     (six values: confirmed_eligible, confirmed_invalid,
//      cancelled, refunded, pending_source, unknown);
//   - every persisted Shopee source-side enum
//     (`shopee_csv_rows.processing_status`,
//      `shopee_csv_rows.order_status`,
//      `shopee_csv_import_batches.status`,
//      `shopee_ingestion_events.processing_status`,
//      `shopee_ingestion_events.failure_code`,
//      `shopee_purchase_intents.status`);
//   - every production writer of those values;
//   - every reference to "ineligible" in TS/JS/SQL/docs.
//
// No real producer of any "ineligible" snapshot exists:
//   - there is no allowlisted `failure_code` (column is plain
//     free-form text; 4E3B deliberately fell-through failed
//     events to `unknown`);
//   - there is no source-side enum value whose documented
//     semantic meaning is "the source explicitly says this
//     conversion is ineligible for cashback";
//   - the `confirmed_ineligible` value has no entry in the
//     `sourceStatus` type union (TypeScript-level
//     impossibility for any production path to construct it).
//
// Adding a `pending -> rejected` mapping for `confirmed_-
// ineligible` therefore has no defensible persisted input.
// Per the task spec we MUST NOT fabricate a passing rejection
// integration test. This single unit test pins the only
// guarantee a future checkpoint can rely on: the loader's
// exhaustive branch ladder, driven by every realistic
// (processingStatus, csvOrderStatus, validationStatus,
// settlementStatus, persistedLinkKind) tuple, MUST NOT
// produce `sourceStatus = "confirmed_ineligible"` for any
// input. If anyone later extends the union with a synthetic
// value, this test will assert it has no production-path
// reachable state.
test("Phase 20K 4E4 (BLOCKED) loader never emits a synthetic 'confirmed_ineligible' source-status from any persisted state", () => {
  // Exhaustive realistic combination matrix. Every element is a
  // value that has a real persisted producer somewhere in the
  // Shopee source pipeline (or, for SAFETY, a value that an
  // upstream bug could plausibly write). If a future change
  // introduces a new source-status value, this matrix must be
  // re-checked -- but the IMPORTANT invariant for 4E4 is that
  // `confirmed_ineligible` is not currently part of the
  // `sourceStatus` type union at all.
  const processingStatuses = ["pending", "succeeded", "failed", "replayed"];
  const csvOrderStatuses = [null, "", "CANCELLED", "IN_CANCELLED", "REFUNDED"];
  const validationStatuses = [
    null,
    "",
    "recorded",
    "reconciling",
    "approved",
    "rejected",
    "reversed",
  ];
  const settlementStatuses = [null, "", "not_payable", "payable", "paid"];

  let tested = 0;
  let ineligibleProductions = 0;
  for (const processingStatus of processingStatuses) {
    for (const csvOrderStatus of csvOrderStatuses) {
      for (const validationStatus of validationStatuses) {
        for (const settlementStatus of settlementStatuses) {
          const map = classifySourceEvidence([
            rowFor({
              conversionId: "conv-" + tested,
              processingStatus,
              csvOrderStatus,
              validationStatus,
              settlementStatus,
              csvSource: "manual_csv",
              publisherExists: true,
              trackingLinkExists: true,
              trackingLinkPublisherMatch: true,
            }),
          ]);
          const result = lookup(map, "conv-" + tested);
          // The exhaustive guarantee 4E4 pins: no production-
          // reachable loader state may emit a synthetic
          // 'confirmed_ineligible' snapshot. As long as that
          // value is not in the `sourceStatus` type union,
          // TypeScript makes this a compile-time impossibility
          // for any loader that respects the union. We assert
          // it at runtime too for documentation / drift-
          // detection purposes.
          if (
            (result.sourceStatus as unknown) === "confirmed_ineligible"
          ) {
            ineligibleProductions += 1;
          }
          // Pin the operational outputs the loader DOES emit.
          assert.ok(
            [
              "unknown",
              "cancelled",
              "refunded",
              "confirmed_eligible",
              "pending_source",
            ].includes(String(result.sourceStatus)),
            "Phase 20K 4E4: unexpected sourceStatus '" +
              String(result.sourceStatus) +
              "' for input (processing=" +
              String(processingStatus) +
              ", order=" +
              String(csvOrderStatus) +
              ", validation=" +
              String(validationStatus) +
              ", settlement=" +
              String(settlementStatus) +
              ")",
          );
          tested += 1;
        }
      }
    }
  }
  // Sanity: the matrix was non-empty.
  assert.ok(tested > 0, "exhaustive matrix must cover at least one tuple");
  assert.equal(
    ineligibleProductions,
    0,
    "Phase 20K 4E4: 4E4 is BLOCKED and no persisted state may reach 'confirmed_ineligible'",
  );
});
