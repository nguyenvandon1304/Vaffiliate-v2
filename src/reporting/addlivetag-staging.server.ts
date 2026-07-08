/**
 * Phase 20H.8 -- Addlivetag staging production wrapper.
 *
 * This module imports `server-only`, the application DB client, and
 * the Phase 20H.6 reconciliation repository. It re-exports the
 * pure staging algorithm from `addlivetag-staging.ts` and adds
 * the production-side `importAddlivetagReportAsync` shim that
 * wires the DB inserter, the batch upsert, and the reconciliation
 * call.
 */
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { shopeeCsvImportBatches, shopeeCsvRows } from "@/db/schema";

import { reconcileShopeeCsvRowWithPurchaseIntentAsync } from "@/repositories/shopee-reconciliation-ingestion.repository";

import {
  stageAddlivetagReportAsync,
  type AddlivetagBatchUpserter,
  type AddlivetagRowInserter,
} from "@/reporting/addlivetag-staging";
import type {
  AddlivetagImportResult,
  AddlivetagPageResponse,
  AddlivetagResourceType,
  AddlivetagSource,
} from "@/reporting/addlivetag-types";

export type { AddlivetagImportResult } from "@/reporting/addlivetag-types";

export interface ImportAddlivetagReportInput {
  readonly source: AddlivetagSource;
  readonly type: AddlivetagResourceType;
  readonly from: string;
  readonly to: string;
  readonly pages: ReadonlyArray<AddlivetagPageResponse>;
  readonly dryRun: boolean;
  readonly batchName?: string;
}

const rowInserter: AddlivetagRowInserter["insertStagedRow"] = async (args) => {
  const inserted = await db
    .insert(shopeeCsvRows)
    .values({
      batchId: args.batchId,
      source: "addlivetag_api",
      sourceRowNumber: args.sourceRowNumber,
      rowFingerprintSha256: args.rowFingerprintSha256,
      rawRow: {
        Source: "addlivetag_api",
        "Order ID": args.row.externalOrderId ?? "",
        "Sub_id1": args.row.sourceSubId1 ?? "",
        "Sub_id2": args.row.sourceSubId2 ?? "",
        "Sub_id3": args.row.sourceSubId3 ?? "",
        "Sub_id4": args.row.sourceSubId4 ?? "",
        "Sub_id5": args.row.sourceSubId5 ?? "",
        "Checkout ID": args.row.checkoutId ?? "",
        "Order Status": args.row.orderStatus ?? "",
        "Item ID": args.row.itemId ?? "",
        "Shop ID": args.row.shopId ?? "",
        "Model ID": args.row.modelId ?? "",
        "Promotion ID": args.row.promotionId ?? "",
        "Quantity":
          args.row.quantity === null ? "" : String(args.row.quantity),
        "Order Value": args.row.orderValue ?? "",
        "Refunded Amount": args.row.refundedAmount ?? "",
        "Total Product Commission":
          args.row.totalProductCommission ?? "",
        "Total Order Commission":
          args.row.totalOrderCommission ?? "",
        "Net Affiliate Commission":
          args.row.netAffiliateCommission ?? "",
        "Linked Product Status": args.row.linkedProductStatus ?? "",
        "Channel": args.row.channel ?? "",
        "Ordered At": args.row.orderedAt ?? "",
        "Completed At": args.row.completedAt ?? "",
        "Clicked At": args.row.clickedAt ?? "",
      },
      externalOrderId: args.row.externalOrderId,
      checkoutId: args.row.checkoutId,
      orderStatus: args.row.orderStatus,
      orderedAt: args.row.orderedAt
        ? new Date(args.row.orderedAt)
        : null,
      completedAt: args.row.completedAt
        ? new Date(args.row.completedAt)
        : null,
      clickedAt: args.row.clickedAt
        ? new Date(args.row.clickedAt)
        : null,
      shopId: args.row.shopId,
      itemId: args.row.itemId,
      modelId: args.row.modelId,
      promotionId: args.row.promotionId,
      quantity: args.row.quantity,
      orderValue: args.row.orderValue,
      refundedAmount: args.row.refundedAmount,
      totalProductCommission: args.row.totalProductCommission,
      totalOrderCommission: args.row.totalOrderCommission,
      netAffiliateCommission: args.row.netAffiliateCommission,
      linkedProductStatus: args.row.linkedProductStatus,
      sourceSubId1: args.row.sourceSubId1,
      sourceSubId2: args.row.sourceSubId2,
      sourceSubId3: args.row.sourceSubId3,
      sourceSubId4: args.row.sourceSubId4,
      sourceSubId5: args.row.sourceSubId5,
      channel: args.row.channel,
      processingStatus: "unattributed",
    })
    .onConflictDoNothing({
      target: shopeeCsvRows.rowFingerprintSha256,
    })
    .returning({ id: shopeeCsvRows.id });

  if (inserted.length > 0) {
    return { kind: "inserted" as const, rowId: inserted[0]!.id };
  }
  const existing = await db
    .select({ id: shopeeCsvRows.id })
    .from(shopeeCsvRows)
    .where(
      eq(shopeeCsvRows.rowFingerprintSha256, args.rowFingerprintSha256),
    )
    .limit(1);
  if (existing.length === 0) {
    throw new Error(
      "Addlivetag import: staging insert returned no row but no existing fingerprint row was found",
    );
  }
  return { kind: "duplicate" as const, rowId: existing[0]!.id };
};

const batchUpserter: AddlivetagBatchUpserter["upsertBatch"] = async (args) => {
  const existing = await db
    .select({ id: shopeeCsvImportBatches.id })
    .from(shopeeCsvImportBatches)
    .where(eq(shopeeCsvImportBatches.sourceFileSha256, args.batchSha))
    .limit(1);
  if (existing.length > 0) {
    return existing[0]!.id;
  }
  const inserted = await db
    .insert(shopeeCsvImportBatches)
    .values({
      sourceFileName: args.batchName,
      sourceFileSha256: args.batchSha,
      sourceFileSizeBytes: 0,
      sourceHeaders: ["source", "type", "from", "to"],
      parserVersion: "addlivetag-v1",
      source: "addlivetag_api",
      status: "completed",
      totalRows: 0,
      insertedRows: 0,
      duplicateRows: 0,
      attributedRows: 0,
      unattributedRows: 0,
      awaitingClassificationRows: 0,
      rejectedRows: 0,
      completedAt: new Date(),
    })
    .returning({ id: shopeeCsvImportBatches.id });
  if (inserted.length === 0) {
    throw new Error(
      "Addlivetag import: batch insert returned no row",
    );
  }
  return inserted[0]!.id;
};

async function reconcileDefault(
  stagedRowId: string,
): Promise<{
  readonly kind: "promoted" | "duplicate" | "skip" | "attribution_invalid";
  readonly conversionId?: string;
  readonly reason?: string;
}> {
  const result = await reconcileShopeeCsvRowWithPurchaseIntentAsync({
    stagedRowId,
  });
  if (result.kind === "promoted") {
    return { kind: "promoted", conversionId: result.conversion.id };
  }
  if (result.kind === "duplicate") {
    return { kind: "duplicate" };
  }
  if (result.kind === "attribution_invalid") {
    return {
      kind: "attribution_invalid",
      reason: result.reason,
    };
  }
  return { kind: "skip", reason: result.reason };
}

export async function importAddlivetagReportAsync(
  input: ImportAddlivetagReportInput,
): Promise<AddlivetagImportResult> {
  return stageAddlivetagReportAsync(input, {
    insertStagedRow: rowInserter,
    upsertBatch: batchUpserter,
    reconcileStagedRow: reconcileDefault,
  });
}

/**
 * Server-bound insert-only export for callers that already have
 * their pages and want to use the live inserter directly.
 */
export const insertAddlivetagReportAsync = importAddlivetagReportAsync;
