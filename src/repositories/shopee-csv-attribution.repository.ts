import "server-only";

import {
  eq,
  sql,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
  shopeeCsvImportBatches,
  shopeeCsvRows,
} from "@/db/schema";

interface AttributionSummaryRow {
  total_rows: number;
  unattributed_rows: number;
  awaiting_classification_rows: number;
  ready_for_conversion_rows: number;
}

export interface ShopeeCsvAttributionResult {
  batchId: string;
  processedRows: number;
  attributedRows: number;
  unattributedRows: number;
  awaitingClassificationRows: number;
  readyForConversionRows: number;
}

export class ShopeeCsvBatchNotFoundError
  extends Error {
  constructor(
    public readonly batchId: string,
  ) {
    super(
      "Shopee CSV import batch was not found",
    );

    this.name =
      "ShopeeCsvBatchNotFoundError";
  }
}

export class ShopeeCsvBatchNotReadyError
  extends Error {
  constructor(
    public readonly batchId: string,
    public readonly status: string,
  ) {
    super(
      "Shopee CSV import batch is not completed",
    );

    this.name =
      "ShopeeCsvBatchNotReadyError";
  }
}

export async function attributeShopeeCsvBatchAsync(
  batchId: string,
): Promise<ShopeeCsvAttributionResult> {
  return db.transaction(
    async (transaction) => {
      const [batch] = await transaction
        .select({
          id: shopeeCsvImportBatches.id,
          status:
            shopeeCsvImportBatches.status,
        })
        .from(shopeeCsvImportBatches)
        .where(
          eq(
            shopeeCsvImportBatches.id,
            batchId,
          ),
        )
        .limit(1);

      if (!batch) {
        throw new ShopeeCsvBatchNotFoundError(
          batchId,
        );
      }

      if (batch.status !== "completed") {
        throw new ShopeeCsvBatchNotReadyError(
          batch.id,
          batch.status,
        );
      }

      const blankSubIdRows =
        await transaction.execute(sql`
          update shopee_csv_rows
          set
            processing_status =
              'unattributed',
            updated_at = now()
          where
            batch_id = ${batch.id}::uuid
            and processing_status =
              'pending'
            and nullif(
              btrim(source_sub_id1),
              ''
            ) is null
          returning id
        `);

      const attributedRows =
        await transaction.execute(sql`
          update shopee_csv_rows
            as staged_row
          set
            tracking_link_id =
              tracking_link.id,
            publisher_id =
              tracking_link.publisher_id,
            processing_status =
              case
                when
                  nullif(
                    btrim(
                      tracking_link
                        .campaign_id
                    ),
                    ''
                  ) is null
                  or
                  nullif(
                    btrim(
                      tracking_link
                        .offer_id
                    ),
                    ''
                  ) is null
                then
                  'awaiting_classification'
                else
                  'ready_for_conversion'
              end,
            updated_at = now()
          from tracking_links
            as tracking_link
          where
            staged_row.batch_id =
              ${batch.id}::uuid
            and
              staged_row
                .processing_status =
              'pending'
            and
              staged_row.source_sub_id1 =
              tracking_link.network_sub_id
            and
              tracking_link.platform =
              'shopee'
          returning
            staged_row.id,
            staged_row.processing_status
        `);

      const unmatchedSubIdRows =
        await transaction.execute(sql`
          update shopee_csv_rows
          set
            processing_status =
              'unattributed',
            updated_at = now()
          where
            batch_id = ${batch.id}::uuid
            and processing_status =
              'pending'
          returning id
        `);

      const summaryRows =
        await transaction.execute(sql`
          select
            count(*)::integer
              as total_rows,
            count(*) filter (
              where processing_status =
                'unattributed'
            )::integer
              as unattributed_rows,
            count(*) filter (
              where processing_status =
                'awaiting_classification'
            )::integer
              as awaiting_classification_rows,
            count(*) filter (
              where processing_status =
                'ready_for_conversion'
            )::integer
              as ready_for_conversion_rows
          from shopee_csv_rows
          where batch_id =
            ${batch.id}::uuid
        `);

        const summary =
        summaryRows[0] as unknown as
          | AttributionSummaryRow
          | undefined;

      if (!summary) {
        throw new Error(
          "Shopee CSV attribution summary could not be created",
        );
      }

      return {
        batchId: batch.id,
        processedRows:
          blankSubIdRows.length +
          attributedRows.length +
          unmatchedSubIdRows.length,
        attributedRows:
          attributedRows.length,
        unattributedRows: Number(
          summary.unattributed_rows,
        ),
        awaitingClassificationRows:
          Number(
            summary
              .awaiting_classification_rows,
          ),
        readyForConversionRows: Number(
          summary
            .ready_for_conversion_rows,
        ),
      };
    },
  );
}
