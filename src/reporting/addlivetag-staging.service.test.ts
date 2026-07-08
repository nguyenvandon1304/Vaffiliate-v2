/**
 * Phase 20H.8 -- Unit tests for the Addlivetag staging algorithm.
 *
 * Pure. The DB and reconciliation dependencies are stubbed through
 * the `StageAddlivetagReportDependencies` option so the test runs
 * without PostgreSQL. The contract proven:
 *
 *   - well-formed row with valid sub_id is staged and reconciled;
 *   - missing sub_id is rejected and DOES NOT call reconcile;
 *   - malformed sub_id is rejected and DOES NOT call reconcile;
 *   - missing external_order_id is rejected and DOES NOT call
 *     reconcile;
 *   - duplicate insert (same fingerprint) is counted and the
 *     reconcile call is skipped;
 *   - click rows are recorded through the click-audit writer and
 *     NEVER touch the staging or reconciliation layer;
 *   - dryRun mode performs every compute step except the DB
 *     write and the reconcile call.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveAddlivetagBatchName,
  stageAddlivetagReportAsync,
} from "./addlivetag-staging";
import type {
  AddlivetagNormalizedClickRow,
  AddlivetagPageResponse,
} from "./addlivetag-types";

const VALID_SUB_ID = "vaflnk1234567890abcdef00000000";

function page(
  rows: ReadonlyArray<unknown>,
  type: "orders" | "items" | "clicks" = "orders",
): AddlivetagPageResponse {
  return {
    request: {
      from: "2026-01-01",
      to: "2026-01-31",
      source: "shopee",
      type,
      page: 1,
      pageSize: 200,
    },
    rows: rows as never,
    pageSize: 200,
    totalPages: 1,
  };
}

function trackingReconcileSpy() {
  const calls: string[] = [];
  return {
    calls,
    reconcile: async (stagedRowId: string) => {
      calls.push(stagedRowId);
      return {
        kind: "promoted" as const,
        conversionId: `conv-for-${stagedRowId}`,
      };
    },
  };
}

function trackingInsertSpy() {
  const inserts: Array<{
    rowFingerprintSha256: string;
    sourceRowNumber: number;
  }> = [];
  let counter = 0;
  return {
    inserts,
    insertStagedRow: async (args: {
      rowFingerprintSha256: string;
      sourceRowNumber: number;
    }) => {
      inserts.push({
        rowFingerprintSha256: args.rowFingerprintSha256,
        sourceRowNumber: args.sourceRowNumber,
      });
      counter += 1;
      return {
        kind: "inserted" as const,
        rowId: `staged-${counter}`,
      };
    },
  };
}

function staticBatchUpsert(batchId: string) {
  return async () => batchId;
}

test("Phase 20H.8: staging reconciles a well-formed order row", async () => {
  const reconcile = trackingReconcileSpy();
  const insert = trackingInsertSpy();
  const result = await stageAddlivetagReportAsync(
    {
      source: "shopee",
      type: "orders",
      from: "2026-01-01",
      to: "2026-01-31",
      pages: [
        page([
          {
            order_id: "order-1",
            item_id: "12345",
            shop_id: "67890",
            sub_id1: VALID_SUB_ID,
            order_value: "250000.00000",
            total_product_commission: "15000.00000",
            linked_product_status: "approved",
          },
        ]),
      ],
      dryRun: false,
    },
    {
      insertStagedRow: insert.insertStagedRow,
      upsertBatch: staticBatchUpsert("batch-1"),
      reconcileStagedRow: reconcile.reconcile,
    },
  );
  assert.equal(result.rowsFetched, 1);
  assert.equal(result.rowsStaged, 1);
  assert.equal(result.rowsReconciled, 1);
  assert.equal(result.rowsRejected, 0);
  assert.equal(reconcile.calls.length, 1);
  assert.equal(insert.inserts.length, 1);
  assert.equal(result.outcome[0]?.kind, "promoted");
});

test("Phase 20H.8: missing sub_id does NOT call reconcile or insert", async () => {
  const reconcile = trackingReconcileSpy();
  const insert = trackingInsertSpy();
  const result = await stageAddlivetagReportAsync(
    {
      source: "shopee",
      type: "orders",
      from: "2026-01-01",
      to: "2026-01-31",
      pages: [
        page([
          {
            order_id: "order-1",
            item_id: "12345",
            // no sub_id1
          },
        ]),
      ],
      dryRun: false,
    },
    {
      insertStagedRow: insert.insertStagedRow,
      upsertBatch: staticBatchUpsert("batch-1"),
      reconcileStagedRow: reconcile.reconcile,
    },
  );
  assert.equal(result.rowsFetched, 1);
  assert.equal(result.rowsRejected, 1);
  assert.equal(reconcile.calls.length, 0);
  assert.equal(insert.inserts.length, 0);
  assert.equal(result.outcome[0]?.kind, "missing_sub_id");
});

test("Phase 20H.8: malformed sub_id does NOT call reconcile or insert", async () => {
  const reconcile = trackingReconcileSpy();
  const insert = trackingInsertSpy();
  const result = await stageAddlivetagReportAsync(
    {
      source: "shopee",
      type: "orders",
      from: "2026-01-01",
      to: "2026-01-31",
      pages: [
        page([
          {
            order_id: "order-1",
            item_id: "12345",
            sub_id1: "not-a-vaflnk-token",
          },
        ]),
      ],
      dryRun: false,
    },
    {
      insertStagedRow: insert.insertStagedRow,
      upsertBatch: staticBatchUpsert("batch-1"),
      reconcileStagedRow: reconcile.reconcile,
    },
  );
  assert.equal(result.rowsFetched, 1);
  assert.equal(result.rowsRejected, 1);
  assert.equal(reconcile.calls.length, 0);
  assert.equal(insert.inserts.length, 0);
  assert.equal(result.outcome[0]?.kind, "malformed_sub_id");
});

test("Phase 20H.8: missing external_order_id is rejected as malformed_row", async () => {
  const reconcile = trackingReconcileSpy();
  const insert = trackingInsertSpy();
  const result = await stageAddlivetagReportAsync(
    {
      source: "shopee",
      type: "orders",
      from: "2026-01-01",
      to: "2026-01-31",
      pages: [
        page([
          {
            item_id: "12345",
            sub_id1: VALID_SUB_ID,
          },
        ]),
      ],
      dryRun: false,
    },
    {
      insertStagedRow: insert.insertStagedRow,
      upsertBatch: staticBatchUpsert("batch-1"),
      reconcileStagedRow: reconcile.reconcile,
    },
  );
  assert.equal(result.rowsFetched, 1);
  assert.equal(result.rowsRejected, 1);
  assert.equal(reconcile.calls.length, 0);
  assert.equal(insert.inserts.length, 0);
  assert.equal(result.outcome[0]?.kind, "malformed_row");
  if (result.outcome[0]?.kind !== "malformed_row") return;
  assert.equal(result.outcome[0].reason, "missing_external_order_id");
});

test("Phase 20H.8: duplicate insert (fingerprint collision) skips reconcile", async () => {
  const reconcile = trackingReconcileSpy();
  let counter = 0;
  const result = await stageAddlivetagReportAsync(
    {
      source: "shopee",
      type: "orders",
      from: "2026-01-01",
      to: "2026-01-31",
      pages: [
        page([
          {
            order_id: "order-1",
            item_id: "12345",
            sub_id1: VALID_SUB_ID,
          },
        ]),
      ],
      dryRun: false,
    },
    {
      insertStagedRow: async () => {
        counter += 1;
        return counter === 1
          ? { kind: "inserted" as const, rowId: "staged-1" }
          : { kind: "duplicate" as const, rowId: "staged-1" };
      },
      upsertBatch: staticBatchUpsert("batch-1"),
      reconcileStagedRow: async () => ({ kind: "promoted" }),
    },
  );
  // First call: insert + reconcile. We test the duplicate branch
  // by replaying the same payload; the second run sees a duplicate
  // and skips reconcile.
  assert.equal(result.outcome[0]?.kind, "promoted");

  const replay = await stageAddlivetagReportAsync(
    {
      source: "shopee",
      type: "orders",
      from: "2026-01-01",
      to: "2026-01-31",
      pages: [
        page([
          {
            order_id: "order-1",
            item_id: "12345",
            sub_id1: VALID_SUB_ID,
          },
        ]),
      ],
      dryRun: false,
    },
    {
      insertStagedRow: async () => ({
        kind: "duplicate" as const,
        rowId: "staged-1",
      }),
      upsertBatch: staticBatchUpsert("batch-1"),
      reconcileStagedRow: reconcile.reconcile,
    },
  );
  assert.equal(replay.outcome[0]?.kind, "duplicate");
  assert.equal(reconcile.calls.length, 0);
});

test("Phase 20H.8: click rows go through the click-audit writer and skip staging", async () => {
  const reconcile = trackingReconcileSpy();
  const insert = trackingInsertSpy();
  const written: AddlivetagNormalizedClickRow[] = [];
  const result = await stageAddlivetagReportAsync(
    {
      source: "shopee",
      type: "clicks",
      from: "2026-01-01",
      to: "2026-01-31",
      pages: [
        page(
          [
            {
              click_id: "click-1",
              click_token: "tk-1",
              sub_id1: VALID_SUB_ID,
              item_id: "12345",
            },
            {
              click_id: "click-2",
              click_token: "tk-2",
              sub_id1: VALID_SUB_ID,
              item_id: "99999",
            },
          ],
          "clicks",
        ),
      ],
      dryRun: false,
    },
    {
      insertStagedRow: insert.insertStagedRow,
      upsertBatch: staticBatchUpsert("batch-1"),
      reconcileStagedRow: reconcile.reconcile,
      writeClick: async (row) => {
        written.push(row);
        return { clickId: row.clickId };
      },
    },
  );
  assert.equal(result.rowsFetched, 2);
  assert.equal(result.rowsStaged, 0);
  assert.equal(result.rowsReconciled, 0);
  assert.equal(reconcile.calls.length, 0);
  assert.equal(insert.inserts.length, 0);
  assert.equal(written.length, 2);
  assert.equal(written[0]?.clickId, "click-1");
  assert.equal(written[1]?.clickId, "click-2");
  assert.equal(result.outcome[0]?.kind, "click_recorded");
  assert.equal(result.outcome[1]?.kind, "click_recorded");
});

test("Phase 20H.8: dry-run mode never calls reconcile or insert", async () => {
  const reconcile = trackingReconcileSpy();
  const insert = trackingInsertSpy();
  const result = await stageAddlivetagReportAsync(
    {
      source: "shopee",
      type: "orders",
      from: "2026-01-01",
      to: "2026-01-31",
      pages: [
        page([
          {
            order_id: "order-1",
            item_id: "12345",
            sub_id1: VALID_SUB_ID,
          },
          {
            order_id: "order-2",
            item_id: "12345",
          },
        ]),
      ],
      dryRun: true,
    },
    {
      insertStagedRow: insert.insertStagedRow,
      upsertBatch: staticBatchUpsert("batch-1"),
      reconcileStagedRow: reconcile.reconcile,
    },
  );
  assert.equal(result.rowsFetched, 2);
  assert.equal(result.rowsStaged, 1);
  assert.equal(result.rowsRejected, 1);
  assert.equal(result.outcome[0]?.kind, "promoted");
  assert.equal(result.outcome[1]?.kind, "missing_sub_id");
  assert.equal(reconcile.calls.length, 0);
  assert.equal(insert.inserts.length, 0);
});

test("Phase 20H.8: deriveAddlivetagBatchName formats with sha prefix", () => {
  const result = deriveAddlivetagBatchName(
    "shopee",
    "orders",
    "2026-01-01",
    "2026-01-31",
    "0123456789abcdef0123456789abcdef",
  );
  assert.equal(
    result,
    "addlivetag:shopee:orders:2026-01-01:2026-01-31:0123456789ab",
  );
});
