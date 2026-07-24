/**
 * Phase 20H.6 -- Shopee reconciliation ingestion repository.
 *
 * Application-layer entry point that consumes the Phase 20H.5 pure
 * attribution matcher. Takes a staged shopee_csv_rows.id, validates
 * source_sub_id1 BEFORE querying shopee_purchase_intents, locks the
 * matching purchase intent, resolves catalog context, builds a
 * ShopeeStagedRow that may be derived from the matched catalog (not
 * from pre-filled CSV tracking/publisher fields), delegates to the
 * existing pure reducer reduceShopeeCsvPromotion, and preserves the
 * existing idempotency / duplicate / skip / promoted semantics.
 *
 * Hard rules:
 *
 *  - source_sub_id1 is validated for presence and format BEFORE any
 *    purchase-intent DB lookup. Null / blank / whitespace / malformed
 *    tokens never touch the shopee_purchase_intents table.
 *
 *  - The trimmed token is the only value ever passed downstream; raw
 *    source_sub_id1 is never compared un-trimmed.
 *
 *  - Failure details carry no internal identifiers / tokens:
 *      networkSubId, sourceSubId1, source_sub_id1, purchaseIntentId,
 *      trackingLinkId, publisherId, shortCode, clickId,
 *      trackingPath, an_redir.
 *
 *  - Reducer skip / duplicate / external_order_collision outcomes are
 *    preserved verbatim -- they are NEVER collapsed into
 *    attribution_invalid or missing_attribution_field.
 *
 *  - The happy path supports CSV rows with tracking_link_id = NULL
 *    and publisher_id = NULL: in that case the matched purchase
 *    intent supplies the (tracking_link_id, publisher_id) pair via
 *    the locked catalog snapshot, and the ShopeeStagedRow is built
 *    from that snapshot before the reducer runs.
 *
 *  - Catalog / purchase-intent consistency is enforced after lock:
 *      catalogSnapshot.trackingLinkId == purchaseIntent.trackingLinkId
 *      catalogSnapshot.publisherId   == purchaseIntent.publisherId
 *    If either fails, the repository returns catalog_snapshot_not_found.
 *    It never promotes with mismatched ownership.
 *
 *  - Lock acquisition is strictly ordered to avoid deadlocks against
 *    promoteShopeeCsvRowConversionAsync:
 *      1. shopee_csv_rows[id]
 *      2. shopee_purchase_intents[network_sub_id]
 *      3. tracking_links[id]
 *      4. offers[id]
 *      5. campaigns[id]
 *      6. advertisers[id]
 *      7. cashback_policies[offer_id]
 *
 * Security boundary:
 *
 *  - import "server-only" guarantees the file can never be bundled into
 *    a browser entrypoint.
 *  - The repository uses the application-level service-role Drizzle
 *    connection.
 *  - The repository never trusts caller-supplied publisher_id,
 *    tracking_link_id, or intent values; every value comes from the
 *    locked DB row.
 *
 * Idempotency:
 *
 *  - Partial unique index
 *    conversions_network_source_conversion_key_unique prevents duplicate
 *    conversion writes.
 *  - shopee_ingestion_events_network_source_event_unique prevents
 *    duplicate ingestion events.
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
  isValidNetworkSubIdFormat,
  matchShopeeCsvPurchaseIntentAttribution,
  type ShopeeCsvSourceRowForAttribution,
  type ShopeePurchaseIntentForAttribution,
} from "@/services/shopee-attribution-matcher";

import {
  mapAttributionResultToInvalid,
  throwSafeDetailsIfForbidden,
  type AttributionInvalidResult,
} from "@/repositories/shopee-reconciliation-attribution-mapper";

import {
  reduceShopeeCsvPromotion,
  SHOPEE_CSV_READY_STATUS,
  type PromotePromotion,
  type ShopeeCatalogSnapshot,
  type ShopeeStagedRow,
} from "@/services/shopee-conversion-promoter";

// --- Input / Output types ----------------------------------------------------

export type ReconcileShopeeCsvRowWithPurchaseIntentInput = {
  stagedRowId: string;
};

export type ReconcileAttributionInvalidReason =
  | "missing_attribution_field"
  | "invalid_attribution_format"
  | "sub_id_mismatch"
  | "intent_not_redirect_prepared"
  | "intent_missing_required_field";

export type ReconcileSkipReason =
  | "staged_row_not_found"
  | "source_row_not_ready"
  | "purchase_intent_not_found"
  | "catalog_snapshot_not_found"
  | "batch_not_found"
  | "tracking_link_not_found"
  | "not_ready_for_conversion"
  | "missing_attribution"
  | "missing_cashback_policy"
  | "invalid_cashback_share_bps"
  | "money_rejected"
  | "external_order_collision";

export type ReconcileShopeeCsvRowWithPurchaseIntentResult =
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
  | (AttributionInvalidResult & { kind: "attribution_invalid" })
  | {
      kind: "skip";
      reason: ReconcileSkipReason;
      details: string;
    };

// --- Generic, no-token skip details -----------------------------------------
//
// Every skip / not-found path returns one of these short, generic
// Vietnamese/English sentences. They contain NO field-name labels,
// NO tokens, NO internal IDs. The repository calls
// throwSafeDetailsIfForbidden on each before returning.

const GENERIC_SKIP_DETAILS: Record<ReconcileSkipReason, string> = Object.freeze({
  staged_row_not_found:
    "The Shopee source row could not be loaded.",
  source_row_not_ready:
    "The Shopee source row is not yet ready for reconciliation.",
  purchase_intent_not_found:
    "No matching purchase intent was found for this attribution value.",
  catalog_snapshot_not_found:
    "The matched purchase intent does not resolve to a usable Shopee catalog snapshot.",
  batch_not_found:
    "The Shopee source batch could not be loaded.",
  tracking_link_not_found:
    "The Shopee tracking link is not classifiable as a Shopee offer.",
  not_ready_for_conversion:
    "The Shopee source row is not in the terminal reconciliation stage.",
  missing_attribution:
    "The Shopee source row has missing attribution context.",
  missing_cashback_policy:
    "The matched Shopee offer has no active cashback policy.",
  invalid_cashback_share_bps:
    "The matched Shopee cashback share is out of range.",
  money_rejected:
    "The Shopee money values failed strict validation.",
  external_order_collision:
    "An existing canonical conversion already occupies this Shopee order.",
}) as Record<ReconcileSkipReason, string>;

function skipDetails(reason: ReconcileSkipReason): string {
  const details = GENERIC_SKIP_DETAILS[reason];
  throwSafeDetailsIfForbidden(details);
  return details;
}

// --- Helpers ----------------------------------------------------------------

function toRows(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  const inner = (raw as { rows?: unknown[] }).rows;
  return Array.isArray(inner)
    ? (inner as Array<Record<string, unknown>>)
    : [];
}

interface LockedShopeeCatalogForReconcile {
  network: "shopee";
  trackingLinkId: string;
  publisherId: string;
  campaignId: string;
  offerId: string;
  advertiserId: string;
  cashbackShareBps: number | null;
}

// Catalog lock-chain. Identical SQL to the legacy promoter; duplicated
// here to keep the new repository self-contained and small enough to
// audit. Locks strictly in deterministic order:
//   tracking_links -> offers -> campaigns -> advertisers ->
//   cashback_policies.
async function lockAndLoadShopeeCatalogForReconcile(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  trackingLinkId: string,
): Promise<LockedShopeeCatalogForReconcile | null> {
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
  if (!offer) return null;

  const campaignRows = toRows(
    await tx.execute(sql`
      SELECT id, advertiser_id AS "advertiserId"
      FROM campaigns
      WHERE id = ${offer.campaignId}
      FOR UPDATE
    `),
  );
  const campaign = campaignRows[0];
  if (!campaign) return null;

  const advertiserRows = toRows(
    await tx.execute(sql`
      SELECT id, platform
      FROM advertisers
      WHERE id = ${campaign.advertiserId}
      FOR UPDATE
    `),
  );
  const advertiser = advertiserRows[0];
  if (!advertiser || advertiser.platform !== "shopee") return null;

  const policyRows = toRows(
    await tx.execute(sql`
      SELECT cashback_share_bps AS "cashbackShareBps"
      FROM cashback_policies
      WHERE offer_id = ${trackingRow.offerId}
      FOR UPDATE
    `),
  );
  const policy = policyRows[0];
  const cashbackShareBps =
    policy?.cashbackShareBps === undefined || policy?.cashbackShareBps === null
      ? null
      : Number(policy.cashbackShareBps);

  return {
    network: "shopee",
    trackingLinkId: String(trackingRow.id),
    publisherId: String(trackingRow.publisherId),
    campaignId: String(campaign.id),
    offerId: String(offer.id),
    advertiserId: String(advertiser.id),
    cashbackShareBps:
      cashbackShareBps === null ? null : Number(cashbackShareBps),
  };
}

// Build the ShopeeStagedRow the reducer expects. The Phase 20H.6 happy
// path lets the CSV row carry tracking_link_id = NULL and
// publisher_id = NULL; in that case the matched catalog snapshot is
// the source of truth for both fields.
function buildShopeeStagedRowFromDb(
  row: {
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
  },
  catalog: LockedShopeeCatalogForReconcile,
): ShopeeStagedRow {
  const trackingLinkId =
    row.tracking_link_id === null || row.tracking_link_id === undefined
      ? catalog.trackingLinkId
      : String(row.tracking_link_id);
  const publisherId =
    row.publisher_id === null || row.publisher_id === undefined
      ? catalog.publisherId
      : String(row.publisher_id);

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
    // The reconciliation entry point always forwards a row whose
    // processingStatus is 'ready_for_conversion' to the reducer,
    // because checkStagedRowShape in shopee-conversion-promoter.ts
    // gates on that exact value. Phase 20H.6 accepts
    // 'unattributed' rows at step 2 (when source_sub_id1 is
    // present) and overrides the status here; the source row in
    // shopee_csv_rows is never mutated by this path.
    processingStatus: SHOPEE_CSV_READY_STATUS,
    trackingLinkId,
    publisherId,
  };
}

// --- Entry point ------------------------------------------------------------

// Phase 20H.6 entry point. Implements the contract documented on
// ShopeeAttributionMatcherPort in src/services/shopee-attribution-matcher.ts.
export async function reconcileShopeeCsvRowWithPurchaseIntentAsync(
  input: ReconcileShopeeCsvRowWithPurchaseIntentInput,
): Promise<ReconcileShopeeCsvRowWithPurchaseIntentResult> {
  const transactionNow = new Date();

  return db.transaction(async (tx) => {
    // 1. Lock the staged CSV row.
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
          publisher_id,
          source_sub_id1
        FROM shopee_csv_rows
        WHERE id = ${input.stagedRowId}::uuid
        FOR UPDATE
      `),
    );

    const stagedDbRow = stagedRows[0];
    if (!stagedDbRow) {
      const details = skipDetails("staged_row_not_found");
      return {
        kind: "skip",
        reason: "staged_row_not_found",
        details,
      } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
    }

    // 2. Source-row-not-ready gate. Distinct from attribution_invalid;
    //    the row is well-formed but the staging pipeline has not yet
    //    promoted it to ready_for_conversion.
    //
    //    Phase 20H.6 widens the gate to accept 'unattributed' rows
    //    unconditionally, regardless of source_sub_id1 presence.
    //    The pre-DB source_sub_id1 validation in step 3 is the single
    //    source of truth for null / blank / malformed attribution and
    //    returns attribution_invalid (NOT source_row_not_ready) for
    //    those cases. The legacy ready_for_conversion path still
    //    applies when the staging pipeline has already populated both
    //    ownership columns. 'pending' and 'rejected' continue to fail
    //    this gate.
    const statusIsReady =
      stagedDbRow.processing_status === SHOPEE_CSV_READY_STATUS;
    const statusIsUnattributed =
      stagedDbRow.processing_status === "unattributed";
    if (!statusIsReady && !statusIsUnattributed) {
      const details = skipDetails("source_row_not_ready");
      return {
        kind: "skip",
        reason: "source_row_not_ready",
        details,
      } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
    }

    // 3. PRE-DB attribution validation. Read source_sub_id1 ONCE,
    //    trim ONCE, and reject null / blank / whitespace / malformed
    //    tokens BEFORE any purchase-intent DB lookup.
    const rawSubId = stagedDbRow.source_sub_id1;
    const rawSubIdStr =
      rawSubId === null || rawSubId === undefined
        ? null
        : String(rawSubId);

    if (rawSubIdStr === null) {
      const result = mapAttributionResultToInvalid({
        kind: "missing_attribution_field",
        subKind: "source_sub_id1_null",
      });
      if (result !== null) {
        throwSafeDetailsIfForbidden(result.details);
        return {
          ...result,
          kind: "attribution_invalid",
        } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
      }
      // mapAttributionResultToInvalid only returns null when matched;
      // for missing_attribution_field it always returns a value.
      const details = "The Shopee source row is missing an attribution value.";
      throwSafeDetailsIfForbidden(details);
      return {
        kind: "attribution_invalid",
        reason: "missing_attribution_field",
        attributionSubKind: "source_sub_id1_null",
        details,
      };
    }

    const trimmedSubId = rawSubIdStr.trim();
    if (trimmedSubId.length === 0) {
      const result = mapAttributionResultToInvalid({
        kind: "missing_attribution_field",
        subKind: "source_sub_id1_blank",
      });
      if (result !== null) {
        throwSafeDetailsIfForbidden(result.details);
        return {
          ...result,
          kind: "attribution_invalid",
        } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
      }
      const details = "The Shopee source row is missing an attribution value.";
      throwSafeDetailsIfForbidden(details);
      return {
        kind: "attribution_invalid",
        reason: "missing_attribution_field",
        attributionSubKind: "source_sub_id1_blank",
        details,
      };
    }

    if (!isValidNetworkSubIdFormat(trimmedSubId)) {
      const result = mapAttributionResultToInvalid({
        kind: "invalid_attribution_format",
      });
      if (result !== null) {
        throwSafeDetailsIfForbidden(result.details);
        return {
          ...result,
          kind: "attribution_invalid",
        } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
      }
      const details =
        "The Shopee source row attribution value is not in the expected format.";
      throwSafeDetailsIfForbidden(details);
      return {
        kind: "attribution_invalid",
        reason: "invalid_attribution_format",
        details,
      };
    }

    // 4. Lock the matching purchase intent by trimmed networkSubId.
    //    Defensive mapping: DB rows with null publisher_id /
    //    tracking_link_id would otherwise become the literal string
    //    "null" and silently bypass the matcher detection.
    const intentRows = toRows(
      await tx.execute(sql`
        SELECT
          id,
          network_sub_id AS "networkSubId",
          publisher_id AS "publisherId",
          tracking_link_id AS "trackingLinkId",
          status
        FROM shopee_purchase_intents
        WHERE network_sub_id = ${trimmedSubId}
        FOR UPDATE
      `),
    );

    const intentRow = intentRows[0];
    if (!intentRow) {
      const details = skipDetails("purchase_intent_not_found");
      return {
        kind: "skip",
        reason: "purchase_intent_not_found",
        details,
      } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
    }

    const intentPublisherId =
      intentRow.publisherId === null || intentRow.publisherId === undefined
        ? ""
        : String(intentRow.publisherId);
    const intentTrackingLinkId =
      intentRow.trackingLinkId === null ||
      intentRow.trackingLinkId === undefined
        ? ""
        : String(intentRow.trackingLinkId);

    const purchaseIntent: ShopeePurchaseIntentForAttribution = {
      id: String(intentRow.id),
      networkSubId: String(intentRow.networkSubId),
      publisherId: intentPublisherId,
      trackingLinkId: intentTrackingLinkId,
      status: String(intentRow.status),
    };

    const sourceRow: ShopeeCsvSourceRowForAttribution = {
      sourceSubId1: trimmedSubId,
    };

    // 5. Run the pure matcher against the locked intent + the trimmed
    //    source token. If not matched, return a typed attribution_invalid.
    const attributionResult = matchShopeeCsvPurchaseIntentAttribution({
      sourceRow,
      purchaseIntent,
    });

    const attributionInvalid = mapAttributionResultToInvalid(
      attributionResult,
    );
    if (attributionInvalid !== null) {
      throwSafeDetailsIfForbidden(attributionInvalid.details);
      return {
        ...attributionInvalid,
        kind: "attribution_invalid",
      } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
    }

    // 6. Resolve catalog snapshot via the locked tracking link on the
    //    purchase intent. If catalog is broken, return a typed skip
    //    that does NOT collapse into attribution_invalid.
    const catalogSnapshot =
      await lockAndLoadShopeeCatalogForReconcile(
        tx,
        purchaseIntent.trackingLinkId,
      );

    if (catalogSnapshot === null) {
      const details = skipDetails("catalog_snapshot_not_found");
      return {
        kind: "skip",
        reason: "catalog_snapshot_not_found",
        details,
      } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
    }

    // 7. Catalog / purchase-intent consistency. The lock chain
    //    guarantees they refer to the same tracking_link_id row, but
    //    we re-assert equality on both tracking_link_id AND
    //    publisher_id to defend against any future schema drift
    //    where the intent and the tracking link could disagree about
    //    ownership.
    if (
      catalogSnapshot.trackingLinkId !== purchaseIntent.trackingLinkId ||
      catalogSnapshot.publisherId !== intentPublisherId
    ) {
      const details = skipDetails("catalog_snapshot_not_found");
      return {
        kind: "skip",
        reason: "catalog_snapshot_not_found",
        details,
      } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
    }

    // 8. Build the ShopeeStagedRow for the reducer. The CSV row may
    //    have tracking_link_id = NULL / publisher_id = NULL; in that
    //    case the matched catalog snapshot supplies both fields so
    //    the reducer's pre-checks (and downstream promotion logic)
    //    see a fully-attributed row. This is the Phase 20H.6 happy
    //    path: the new attribution path is the one supplying
    //    tracking / publisher ownership.
    const stagedRow = buildShopeeStagedRowFromDb(
      {
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
          stagedDbRow.item_id === null ? null : String(stagedDbRow.item_id),
        model_id:
          stagedDbRow.model_id === null ? null : String(stagedDbRow.model_id),
        quantity:
          stagedDbRow.quantity === null ? null : Number(stagedDbRow.quantity),
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
      },
      catalogSnapshot,
    );

    // 9. The reducer is the single source of truth for money math,
    //    idempotency-key derivation, and ingestion-event payload
    //    shape. If it returns skip, preserve it verbatim.
    const batchRows = await tx
      .select({
        id: shopeeCsvImportBatches.id,
        sourceFileSha256: shopeeCsvImportBatches.sourceFileSha256,
      })
      .from(shopeeCsvImportBatches)
      .where(eq(shopeeCsvImportBatches.id, stagedRow.batchId))
      .limit(1);

    const batch = batchRows[0];
    if (!batch) {
      const details = skipDetails("batch_not_found");
      return {
        kind: "skip",
        reason: "batch_not_found",
        details,
      } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
    }

    const decision: PromotePromotion = reduceShopeeCsvPromotion({
      stagedRow,
      catalog: catalogSnapshot as ShopeeCatalogSnapshot,
      sourceEventPayloadSha256: batch.sourceFileSha256,
    });

    if (decision.kind !== "promote") {
      const details =
        decision.reason in GENERIC_SKIP_DETAILS
          ? skipDetails(decision.reason)
          : skipDetails("money_rejected");
      return {
        kind: "skip",
        reason: decision.reason,
        details,
      } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
    }

    // 10. Idempotency: existing conversion by source_conversion_key.
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
          externalOrderId: String(existingConversion.externalOrderId),
          ingestionEventId:
            existingConversion.ingestionEventId === null
              ? ""
              : String(existingConversion.ingestionEventId),
        },
      };
    }

    // 11. Legacy network + external_order_id uniqueness boundary.
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
      const details = skipDetails("external_order_collision");
      return {
        kind: "skip",
        reason: "external_order_collision",
        details,
      } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
    }

    // 12. Insert the immutable ingestion event, with
    //     ON CONFLICT DO NOTHING for replay safety.
    const ingestedRows = await tx
      .insert(shopeeIngestionEvents)
      .values({
        network: decision.network,
        sourceEventId: decision.ingestionEvent.sourceEventId,
        payloadSha256: decision.ingestionEvent.payloadSha256,
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
      .returning({ id: shopeeIngestionEvents.id });

    const insertedIngestionEventRow = ingestedRows[0];
    let ingestionEventId: string;
    if (insertedIngestionEventRow) {
      ingestionEventId = String(insertedIngestionEventRow.id);
    } else {
      const reReadIngestionEvent = await tx
        .select({ id: shopeeIngestionEvents.id })
        .from(shopeeIngestionEvents)
        .where(
          and(
            eq(shopeeIngestionEvents.network, decision.network),
            eq(
              shopeeIngestionEvents.sourceEventId,
              decision.ingestionEvent.sourceEventId,
            ),
          ),
        )
        .limit(1);
      const reReadRow = reReadIngestionEvent[0];
      if (!reReadRow) {
        const details = skipDetails("money_rejected");
        return {
          kind: "skip",
          reason: "money_rejected",
          details,
        } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
      }
      ingestionEventId = String(reReadRow.id);
    }

    // 13. Insert the canonical conversion with
    //     ON CONFLICT (network, source_conversion_key) DO NOTHING.
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
        const details = skipDetails("money_rejected");
        return {
          kind: "skip",
          reason: "money_rejected",
          details,
        } satisfies ReconcileShopeeCsvRowWithPurchaseIntentResult;
      }
      return {
        kind: "duplicate",
        existing: {
          id: String(reReadPromoted.id),
          sourceConversionKey: String(
            reReadPromoted.sourceConversionKey,
          ),
          network: "shopee",
          externalOrderId: String(reReadPromoted.externalOrderId),
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
        externalOrderId: String(promotedRow.externalOrderId),
        ingestionEventId:
          promotedRow.ingestionEventId === null
            ? ingestionEventId
            : String(promotedRow.ingestionEventId),
      },
    };
  });
}
