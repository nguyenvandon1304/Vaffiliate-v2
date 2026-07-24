/**
 * Server-only repository: Shopee CSV row -> canonical conversion promoter.
 *
 * 1. Receives a shopee_csv_rows.id from the orchestrator.
 * 2. Reads the staged row, the matched tracking link, the classified offer
 *    snapshot, and the cashback policy snapshot inside one database
 *    transaction with sequential SELECT FOR UPDATE row locks -- mirroring
 *    the existing classifyShopeeTrackingLinkAsync lock-chain pattern.
 * 3. Calls the pure reducer reduceShopeeCsvPromotion to produce a typed
 *    promote/skip decision without any further database access.
 * 4. If the reducer returned promote, inserts an immutable
 *    shopee_ingestion_events row, then INSERTs the canonical conversions
 *    row with ON CONFLICT (network, source_conversion_key) DO NOTHING.
 *    Returns { kind: "promoted", conversion } or
 *    { kind: "duplicate", existing } on idempotent replay.
 * 5. If the reducer returned skip, returns { kind: "skip", ... } with the
 *    typed reason. The repository NEVER mutates shopee_csv_rows when
 *    skipping.
 *
 * Security boundary:
 *
 * - import "server-only" guarantees the file can never be bundled into
 *   a browser entrypoint.
 * - The repository uses the application-level service-role Drizzle
 *   connection, identical to the existing attribution repository.
 * - The repository never trusts caller-supplied publisher_id or
 *   tracking_link_id values.
 *
 * Idempotency:
 *
 * - The partial unique index
 *   conversions_network_source_conversion_key_unique prevents duplicate
 *   conversion writes.
 * - The shopee_ingestion_events_network_source_event_unique constraint
 *   prevents duplicate ingestion events.
 */
import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  conversions,
  shopeeCsvImportBatches,
  shopeeIngestionEvents,
} from "@/db/schema";

import {
  reduceShopeeCsvPromotion,
  SHOPEE_CSV_READY_STATUS,
  type PromotePromotion,
  type ShopeeCatalogSnapshot,
  type ShopeeStagedRow,
} from "@/services/shopee-conversion-promoter";

export type PromoteShopeeCsvRowConversionInput = {
  stagedRowId: string;
};

export type PromoteShopeeCsvRowConversionResult =
  | {
      kind: "promoted";
      conversion: {
        id: string;
        sourceConversionKey: string;
        network: "shopee";
        externalOrderId: string;
        ingestionEventId: string;
      };
    }
  | {
      kind: "duplicate";
      existing: {
        id: string;
        sourceConversionKey: string;
        network: "shopee";
        externalOrderId: string;
        ingestionEventId: string;
      };
    }
  | {
      kind: "skip";
      reason:
        | "staged_row_not_found"
        | "batch_not_found"
        | "tracking_link_not_found"
        | "not_ready_for_conversion"
        | "missing_attribution"
        | "missing_cashback_policy"
        | "invalid_cashback_share_bps"
        | "money_rejected"
        | "external_order_collision";
      details: string;
    };



interface LockedShopeeCatalogForPromotion {
  network: "shopee";
  trackingLinkId: string;
  publisherId: string;
  campaignId: string;
  offerId: string;
  advertiserId: string;
  cashbackShareBps: number | null;
}

function toRows(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  const inner = (raw as { rows?: unknown[] }).rows;
  return Array.isArray(inner)
    ? (inner as Array<Record<string, unknown>>)
    : [];
}

async function lockAndLoadShopeeCatalogForPromotion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  trackingLinkId: string,
): Promise<LockedShopeeCatalogForPromotion | null> {
  const trackingRows = toRows(
    await tx.execute(sql`
      SELECT
        id,
        publisher_id AS "publisherId",
        campaign_id AS "campaignId",
        offer_id AS "offerId",
        platform
      FROM tracking_links
      WHERE id = ${trackingLinkId}::uuid
        AND platform = 'shopee'
      FOR UPDATE
    `),
  );
  const trackingRow = trackingRows[0];

  if (
    !trackingRow ||
    trackingRow.campaignId === null ||
    trackingRow.offerId === null
  ) {
    return null;
  }

  const offerRows = toRows(
    await tx.execute(sql`
      SELECT id, campaign_id AS "campaignId"
      FROM offers
      WHERE id = ${trackingRow.offerId}
      FOR UPDATE
    `),
  );
  const offer = offerRows[0];

  if (!offer) {
    return null;
  }

  const campaignRows = toRows(
    await tx.execute(sql`
      SELECT id, advertiser_id AS "advertiserId"
      FROM campaigns
      WHERE id = ${offer.campaignId}
      FOR UPDATE
    `),
  );
  const campaign = campaignRows[0];

  if (!campaign) {
    return null;
  }

  const advertiserRows = toRows(
    await tx.execute(sql`
      SELECT id, platform
      FROM advertisers
      WHERE id = ${campaign.advertiserId}
      FOR UPDATE
    `),
  );
  const advertiser = advertiserRows[0];

  if (!advertiser || advertiser.platform !== "shopee") {
    return null;
  }

  const policyRows = toRows(
    await tx.execute(sql`
      SELECT cashback_share_bps AS "cashbackShareBps"
      FROM cashback_policies
      WHERE offer_id = ${trackingRow.offerId}
      FOR UPDATE
    `),
  );
  const policy = policyRows[0];

  const cashbackShareBps = policy?.cashbackShareBps ?? null;

  return {
    network: "shopee",
    trackingLinkId: String(trackingRow.id),
    publisherId: String(trackingRow.publisherId),
    campaignId: String(campaign.id),
    offerId: String(offer.id),
    advertiserId: String(advertiser.id),
    cashbackShareBps: cashbackShareBps === null
      ? null
      : Number(cashbackShareBps),
  };
}

function buildShopeeStagedRow(row: {
  id: string;
  batch_id: string;
  row_fingerprint_sha256: string;
  external_order_id: string | null;
  checkout_id: string | null;
  item_id: string | null;
  model_id: string | null;
  quantity: number | null;
  order_value: string | null;
  total_product_commission: string | null;
  refunded_amount: string | null;
  linked_product_status: string | null;
  processing_status: string;
  tracking_link_id: string | null;
  publisher_id: string | null;
}): ShopeeStagedRow {
  return {
    id: row.id,
    batchId: row.batch_id,
    rowFingerprintSha256: row.row_fingerprint_sha256,
    externalOrderId: row.external_order_id ?? "",
    checkoutId: row.checkout_id ?? "",
    itemId: row.item_id ?? "",
    modelId: row.model_id ?? "",
    quantity: row.quantity ?? 0,
    orderValue: row.order_value ?? "0",
    totalProductCommission: row.total_product_commission ?? "0",
    refundedAmount: row.refunded_amount ?? "0",
    linkedProductStatus: row.linked_product_status ?? "",
    processingStatus: row.processing_status,
    trackingLinkId: row.tracking_link_id,
    publisherId: row.publisher_id,
  };
}

export async function promoteShopeeCsvRowConversionAsync(
  input: PromoteShopeeCsvRowConversionInput,
): Promise<PromoteShopeeCsvRowConversionResult> {
  // Single per-transaction timestamp shared by both the ingestion
  // event's processedAt and the canonical conversion's occurredAt.
  // Resolved once at the start of each invocation so replay, retries,
  // and concurrent callers each capture their own clock.
  const transactionNow = new Date();

  return db.transaction(async (tx) => {
    const stagedRows = toRows(
      await tx.execute(sql`
        SELECT
          id,
          batch_id,
          row_fingerprint_sha256,
          external_order_id,
          checkout_id,
          item_id,
          model_id,
          quantity,
          order_value::text AS order_value,
          total_product_commission::text AS total_product_commission,
          refunded_amount::text AS refunded_amount,
          linked_product_status,
          processing_status,
          tracking_link_id,
          publisher_id
        FROM shopee_csv_rows
        WHERE id = ${input.stagedRowId}::uuid
        FOR UPDATE
      `),
    );

    const stagedDbRow = stagedRows[0];

    if (!stagedDbRow) {
      return {
        kind: "skip",
        reason: "staged_row_not_found",
        details: "Staged row " + input.stagedRowId + " was not found",
      };
    }

    const stagedRow = buildShopeeStagedRow({
      id: String(stagedDbRow.id),
      batch_id: String(stagedDbRow.batch_id),
      row_fingerprint_sha256: String(
        stagedDbRow.row_fingerprint_sha256,
      ),
      external_order_id:
        stagedDbRow.external_order_id === null
          ? null
          : String(stagedDbRow.external_order_id),
      checkout_id:
        stagedDbRow.checkout_id === null
          ? null
          : String(stagedDbRow.checkout_id),
      item_id:
        stagedDbRow.item_id === null
          ? null
          : String(stagedDbRow.item_id),
      model_id:
        stagedDbRow.model_id === null
          ? null
          : String(stagedDbRow.model_id),
      quantity:
        stagedDbRow.quantity === null
          ? null
          : Number(stagedDbRow.quantity),
      order_value:
        stagedDbRow.order_value === null
          ? null
          : String(stagedDbRow.order_value),
      total_product_commission:
        stagedDbRow.total_product_commission === null
          ? null
          : String(stagedDbRow.total_product_commission),
      refunded_amount:
        stagedDbRow.refunded_amount === null
          ? null
          : String(stagedDbRow.refunded_amount),
      linked_product_status:
        stagedDbRow.linked_product_status === null
          ? null
          : String(stagedDbRow.linked_product_status),
      processing_status: String(stagedDbRow.processing_status),
      tracking_link_id:
        stagedDbRow.tracking_link_id === null
          ? null
          : String(stagedDbRow.tracking_link_id),
      publisher_id:
        stagedDbRow.publisher_id === null
          ? null
          : String(stagedDbRow.publisher_id),
    });

    if (stagedRow.processingStatus !== SHOPEE_CSV_READY_STATUS) {
      return {
        kind: "skip",
        reason: "not_ready_for_conversion",
        details:
          "Staged row " +
          stagedRow.id +
          " processing_status is " +
          stagedRow.processingStatus +
          ", expected " +
          SHOPEE_CSV_READY_STATUS,
      };
    }

    if (
      stagedRow.trackingLinkId === null ||
      stagedRow.publisherId === null
    ) {
      return {
        kind: "skip",
        reason: "missing_attribution",
        details:
          "Staged row " +
          stagedRow.id +
          " is missing tracking link or publisher attribution",
      };
    }

    const batchRows = await tx
      .select({
        id: shopeeCsvImportBatches.id,
        sourceFileSha256:
          shopeeCsvImportBatches.sourceFileSha256,
      })
      .from(shopeeCsvImportBatches)
      .where(
        eq(shopeeCsvImportBatches.id, stagedRow.batchId),
      )
      .limit(1);

    const batch = batchRows[0];
    if (!batch) {
      return {
        kind: "skip",
        reason: "batch_not_found",
        details: "Import batch " + stagedRow.batchId + " was not found",
      };
    }

    const catalogSnapshot =
      await lockAndLoadShopeeCatalogForPromotion(
        tx,
        stagedRow.trackingLinkId,
      );

    if (catalogSnapshot === null) {
      return {
        kind: "skip",
        reason: "tracking_link_not_found",
        details:
          "Tracking link " +
          stagedRow.trackingLinkId +
          " is not classifiable as a Shopee offer with policy",
      };
    }

    const decision: PromotePromotion = reduceShopeeCsvPromotion({
      stagedRow,
      catalog: catalogSnapshot as ShopeeCatalogSnapshot,
      sourceEventPayloadSha256: batch.sourceFileSha256,
    });

    if (decision.kind !== "promote") {
      return {
        kind: "skip",
        reason: decision.reason,
        details: decision.details,
      };
    }

    const existingConversionRows = await tx
      .select({
        id: conversions.id,
        sourceConversionKey: conversions.sourceConversionKey,
        network: conversions.network,
        externalOrderId: conversions.externalOrderId,
        ingestionEventId: conversions.ingestionEventId,
      })
      .from(conversions)
      .where(
        and(
          eq(conversions.network, decision.network),
          eq(
            conversions.sourceConversionKey,
            decision.sourceConversionKey,
          ),
        ),
      )
      .limit(1);

    const existingConversion = existingConversionRows[0];
    if (existingConversion) {
      return {
        kind: "duplicate",
        existing: {
          id: String(existingConversion.id),
          sourceConversionKey: String(
            existingConversion.sourceConversionKey,
          ),
          network: "shopee",
          externalOrderId: String(
            existingConversion.externalOrderId,
          ),
          ingestionEventId:
            existingConversion.ingestionEventId === null
              ? ""
              : String(existingConversion.ingestionEventId),
        },
      };
    }

    // Legacy `network + external_order_id` uniqueness boundary.
    // Phase 20G.2a deliberately keeps this constraint in place to
    // honor historical idempotency contracts, so a second staged
    // row that shares the same external_order_id but has a
    // distinct source_conversion_key must surface as a typed
    // skip result rather than crash with an unhandled unique-
    // constraint violation.
    const externalOrderCollisionRows = await tx
      .select({
        id: conversions.id,
        sourceConversionKey: conversions.sourceConversionKey,
      })
      .from(conversions)
      .where(
        and(
          eq(conversions.network, decision.network),
          eq(
            conversions.externalOrderId,
            decision.externalOrderId,
          ),
        ),
      )
      .limit(1);

    const externalOrderCollision = externalOrderCollisionRows[0];
    if (externalOrderCollision) {
      return {
        kind: "skip",
        reason: "external_order_collision",
        details:
          "Existing canonical conversion " +
          String(externalOrderCollision.id) +
          " already occupies the legacy network + external_order_id boundary for external_order_id " +
          decision.externalOrderId +
          "; deferred until the legacy constraint is replaced by line-level source_conversion_key uniqueness in a later phase.",
      };
    }

    const ingestedRows = await tx
      .insert(shopeeIngestionEvents)
      .values({
        network: decision.network,
        sourceEventId:
          decision.ingestionEvent.sourceEventId,
        payloadSha256:
          decision.ingestionEvent.payloadSha256,
        processingStatus: "succeeded",
        attemptCount: 1,
        processedAt: transactionNow,
        rawReference: decision.ingestionEvent.rawReference,
      })
      .onConflictDoNothing({
        target: [
          shopeeIngestionEvents.network,
          shopeeIngestionEvents.sourceEventId,
        ],
      })
      .returning({
        id: shopeeIngestionEvents.id,
      });

    const insertedIngestionEventRow = ingestedRows[0];

    let ingestionEventId: string;
    if (insertedIngestionEventRow) {
      ingestionEventId = String(
        insertedIngestionEventRow.id,
      );
    } else {
      const reReadIngestionEvent = await tx
        .select({ id: shopeeIngestionEvents.id })
        .from(shopeeIngestionEvents)
        .where(
          and(
            eq(
              shopeeIngestionEvents.network,
              decision.network,
            ),
            eq(
              shopeeIngestionEvents.sourceEventId,
              decision.ingestionEvent.sourceEventId,
            ),
          ),
        )
        .limit(1);
      const reReadRow = reReadIngestionEvent[0];
      if (!reReadRow) {
        return {
          kind: "skip",
          reason: "money_rejected",
          details:
            "Unable to resolve an existing ingestion-event id for replay",
        };
      }
      ingestionEventId = String(reReadRow.id);
    }

    const promotedRows = await tx
      .insert(conversions)
      .values({
        network: decision.network,
        externalOrderId: decision.externalOrderId,
        publisherId: decision.publisherId,
        advertiserId: decision.advertiserId,
        campaignId: decision.campaignId,
        offerId: decision.offerId,
        trackingLinkId: decision.trackingLinkId,
        status: "pending",
        orderAmount: decision.orderAmountVnd,
        networkCommission: decision.networkCommissionVnd,
        cashbackShareBpsSnapshot: decision.cashbackShareBps,
        userCashback: decision.userCashbackVnd,
        platformProfit: decision.platformProfitVnd,
        occurredAt: transactionNow,
        sourceConversionKey: decision.sourceConversionKey,
        validationStatus: "recorded",
        settlementStatus: "not_payable",
        ingestionEventId,
      })
      .onConflictDoNothing({
        target: [
          conversions.network,
          conversions.sourceConversionKey,
        ],
        where: sql`${conversions.sourceConversionKey} is not null`,
      })
      .returning({
        id: conversions.id,
        sourceConversionKey: conversions.sourceConversionKey,
        network: conversions.network,
        externalOrderId: conversions.externalOrderId,
        ingestionEventId: conversions.ingestionEventId,
      });

    const promotedRow = promotedRows[0];
    if (!promotedRow) {
      const reRead = await tx
        .select({
          id: conversions.id,
          sourceConversionKey: conversions.sourceConversionKey,
          network: conversions.network,
          externalOrderId: conversions.externalOrderId,
          ingestionEventId: conversions.ingestionEventId,
        })
        .from(conversions)
        .where(
          and(
            eq(conversions.network, decision.network),
            eq(
              conversions.sourceConversionKey,
              decision.sourceConversionKey,
            ),
          ),
        )
        .limit(1);

      const reReadPromoted = reRead[0];
      if (!reReadPromoted) {
        return {
          kind: "skip",
          reason: "money_rejected",
          details: "Unable to resolve a promoted conversion id",
        };
      }
      return {
        kind: "duplicate",
        existing: {
          id: String(reReadPromoted.id),
          sourceConversionKey: String(
            reReadPromoted.sourceConversionKey,
          ),
          network: "shopee",
          externalOrderId: String(
            reReadPromoted.externalOrderId,
          ),
          ingestionEventId:
            reReadPromoted.ingestionEventId === null
              ? ""
              : String(reReadPromoted.ingestionEventId),
        },
      };
    }

    return {
      kind: "promoted",
      conversion: {
        id: String(promotedRow.id),
        sourceConversionKey: String(
          promotedRow.sourceConversionKey ?? "",
        ),
        network: "shopee",
        externalOrderId: String(
          promotedRow.externalOrderId,
        ),
        ingestionEventId:
          promotedRow.ingestionEventId === null
            ? ingestionEventId
            : String(promotedRow.ingestionEventId),
      },
    };
  });
}
