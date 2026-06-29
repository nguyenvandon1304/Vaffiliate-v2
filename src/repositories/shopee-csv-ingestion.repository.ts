import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  shopeeCsvImportBatches,
  shopeeCsvRows,
} from "@/db/schema";

import {
  parseShopeeCsvBuffer,
  parseShopeeCsvFile,
} from "../../scripts/shopee-csv-parser.mjs";

const ROW_INSERT_CHUNK_SIZE = 500;

interface ParsedShopeeCsvRow {
  sourceRowNumber: number;
  rowFingerprintSha256: string;
  rawRow: Record<string, string>;
  externalOrderId: string;
  checkoutId: string | null;
  orderStatus: string;
  orderedAt: string | null;
  completedAt: string | null;
  clickedAt: string | null;
  shopId: string | null;
  itemId: string | null;
  modelId: string | null;
  promotionId: string | null;
  quantity: number | null;
  orderValue: string | null;
  refundedAmount: string | null;
  totalProductCommission: string | null;
  totalOrderCommission: string | null;
  netAffiliateCommission: string | null;
  linkedProductStatus: string | null;
  sourceSubId1: string | null;
  sourceSubId2: string | null;
  sourceSubId3: string | null;
  sourceSubId4: string | null;
  sourceSubId5: string | null;
  channel: string | null;
}

interface ParsedShopeeCsv {
  parserVersion: string;
  sourceFileName: string;
  sourceFileSizeBytes: number;
  sourceFileSha256: string;
  sourceHeaders: string[];
  rows: ParsedShopeeCsvRow[];
}

export interface ShopeeCsvImportResult {
  batchId: string;
  sourceFileSha256: string;
  totalRows: number;
  insertedRows: number;
  duplicateRows: number;
}

export class ShopeeCsvDuplicateFileError
  extends Error {
  constructor(
    public readonly sourceFileSha256: string,
  ) {
    super(
      "This Shopee CSV file has already been imported",
    );

    this.name = "ShopeeCsvDuplicateFileError";
  }
}

function toNullableDate(
  value: string | null,
): Date | null {
  return value === null
    ? null
    : new Date(value);
}

async function stageParsedShopeeCsvAsync(
  parsed: ParsedShopeeCsv,
): Promise<ShopeeCsvImportResult> {
  return db.transaction(async (transaction) => {
    const [batch] = await transaction
      .insert(shopeeCsvImportBatches)
      .values({
        sourceFileName:
          parsed.sourceFileName,
        sourceFileSha256:
          parsed.sourceFileSha256,
        sourceFileSizeBytes:
          parsed.sourceFileSizeBytes,
        sourceHeaders:
          parsed.sourceHeaders,
        parserVersion:
          parsed.parserVersion,
        status: "processing",
        totalRows: parsed.rows.length,
      })
      .onConflictDoNothing({
        target:
          shopeeCsvImportBatches
            .sourceFileSha256,
      })
      .returning({
        id: shopeeCsvImportBatches.id,
      });

    if (!batch) {
      throw new ShopeeCsvDuplicateFileError(
        parsed.sourceFileSha256,
      );
    }

    let insertedRows = 0;

    for (
      let offset = 0;
      offset < parsed.rows.length;
      offset += ROW_INSERT_CHUNK_SIZE
    ) {
      const chunk = parsed.rows.slice(
        offset,
        offset + ROW_INSERT_CHUNK_SIZE,
      );

      const insertedChunk = await transaction
        .insert(shopeeCsvRows)
        .values(
          chunk.map((row) => ({
            batchId: batch.id,
            sourceRowNumber:
              row.sourceRowNumber,
            rowFingerprintSha256:
              row.rowFingerprintSha256,
            rawRow: row.rawRow,
            externalOrderId:
              row.externalOrderId,
            checkoutId: row.checkoutId,
            orderStatus: row.orderStatus,
            orderedAt: toNullableDate(
              row.orderedAt,
            ),
            completedAt: toNullableDate(
              row.completedAt,
            ),
            clickedAt: toNullableDate(
              row.clickedAt,
            ),
            shopId: row.shopId,
            itemId: row.itemId,
            modelId: row.modelId,
            promotionId: row.promotionId,
            quantity: row.quantity,
            orderValue: row.orderValue,
            refundedAmount:
              row.refundedAmount,
            totalProductCommission:
              row.totalProductCommission,
            totalOrderCommission:
              row.totalOrderCommission,
            netAffiliateCommission:
              row.netAffiliateCommission,
            linkedProductStatus:
              row.linkedProductStatus,
            sourceSubId1: row.sourceSubId1,
            sourceSubId2: row.sourceSubId2,
            sourceSubId3: row.sourceSubId3,
            sourceSubId4: row.sourceSubId4,
            sourceSubId5: row.sourceSubId5,
            channel: row.channel,
          })),
        )
        .onConflictDoNothing({
          target:
            shopeeCsvRows
              .rowFingerprintSha256,
        })
        .returning({
          id: shopeeCsvRows.id,
        });

      insertedRows += insertedChunk.length;
    }

    const duplicateRows =
      parsed.rows.length - insertedRows;

    const completedAt = new Date();

    const [completedBatch] =
      await transaction
        .update(shopeeCsvImportBatches)
        .set({
          status: "completed",
          insertedRows,
          duplicateRows,
          completedAt,
          updatedAt: completedAt,
        })
        .where(
          eq(
            shopeeCsvImportBatches.id,
            batch.id,
          ),
        )
        .returning({
          id: shopeeCsvImportBatches.id,
        });

    if (!completedBatch) {
      throw new Error(
        "Shopee CSV import batch could not be completed",
      );
    }

    return {
      batchId: completedBatch.id,
      sourceFileSha256:
        parsed.sourceFileSha256,
      totalRows: parsed.rows.length,
      insertedRows,
      duplicateRows,
    };
  });
}

export async function importShopeeCsvBufferAsync(
  input: Buffer | string,
  {
    sourceFileName,
  }: {
    sourceFileName?: string;
  } = {},
): Promise<ShopeeCsvImportResult> {
  const parsed = parseShopeeCsvBuffer(
    input,
    {
      sourceFileName,
    },
  ) as ParsedShopeeCsv;

  return stageParsedShopeeCsvAsync(parsed);
}

export async function importShopeeCsvFileAsync(
  filePath: string,
): Promise<ShopeeCsvImportResult> {
  const parsed =
    await parseShopeeCsvFile(
      filePath,
    ) as ParsedShopeeCsv;

  return stageParsedShopeeCsvAsync(parsed);
}
