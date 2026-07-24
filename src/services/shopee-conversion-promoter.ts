/**
 * Pure promotion decision reducer for Shopee CSV rows.
 *
 * Given the immutable Shopee source-line fields and the locked catalog
 * snapshot for the matched tracking link, this reducer returns a typed
 * decision describing whether the source row may be promoted into a
 * canonical conversion, what the deterministic identity and integer VND
 * money amounts would be, and the immutable ingestion-event reference.
 *
 * The reducer is pure:
 *
 * - no database access;
 * - no clock dependency;
 * - no environment access;
 * - no Drizzle / SQL knowledge.
 *
 * Responsibilities:
 *
 *   1. Reject rows whose processing_status is not ready_for_conversion
 *      (the documented terminal CSV stage).
 *   2. Reject rows whose attribution or ownership fields are missing.
 *   3. Compute the deterministic source_conversion_key via
 *      deriveShopeeSourceConversionKey.
 *   4. Compute the integer VND amounts (order value, network commission,
 *      user cashback, platform profit) with strict no-truncate no-round
 *      semantics via parseShopeeSourceMoneyVnd.
 *   5. Allocate user_cashback from the locked cashback_share_bps
 *      snapshot using bigint arithmetic so the invariant
 *      network_commission = user_cashback + platform_profit is preserved
 *      exactly.
 *   6. Build the immutable ingestion_event reference.
 */
import {
  deriveShopeeSourceConversionKey,
  SHOPEE_NETWORK_LABEL,
  type ShopeeCsvSourceLine,
} from "./shopee-csv-row-id";
import { parseShopeeSourceMoneyVnd } from "./shopee-csv-row-money";

export const SHOPEE_CSV_READY_STATUS = "ready_for_conversion";

export type ShopeeCatalogSnapshot = {
  network: "shopee";
  trackingLinkId: string;
  publisherId: string;
  campaignId: string;
  offerId: string;
  advertiserId: string;
  cashbackShareBps: number | null;
};

export type ShopeeStagedRow = {
  id: string;
  batchId: string;
  rowFingerprintSha256: string;
  externalOrderId: string;
  checkoutId: string;
  itemId: string;
  modelId: string;
  quantity: number;
  orderValue: string;
  totalProductCommission: string;
  refundedAmount: string;
  linkedProductStatus: string;
  processingStatus: string;
  trackingLinkId: string | null;
  publisherId: string | null;
};

export type PromotePromotion =
  | {
      kind: "promote";
      sourceConversionKey: string;
      network: "shopee";
      externalOrderId: string;
      trackingLinkId: string;
      publisherId: string;
      advertiserId: string;
      campaignId: string;
      offerId: string;
      rowFingerprintSha256: string;
      stagedRowId: string;
      batchId: string;
      orderAmountVnd: number;
      networkCommissionVnd: number;
      cashbackShareBps: number;
      userCashbackVnd: number;
      platformProfitVnd: number;
      ingestionEvent: {
        sourceEventId: string;
        payloadSha256: string;
        rawReference: {
          stagedRowId: string;
          batchId: string;
          rowFingerprintSha256: string;
          network: "shopee";
          externalOrderId: string;
          checkoutId: string;
          itemId: string;
          modelId: string;
        };
      };
    }
  | {
      kind: "skip";
      reason:
        | "not_ready_for_conversion"
        | "missing_attribution"
        | "missing_cashback_policy"
        | "invalid_cashback_share_bps"
        | "money_rejected";
      details: string;
    };

type StagedRowShape =
  | { ok: true }
  | {
      ok: false;
      code: "not_ready_for_conversion" | "missing_attribution";
      message: string;
    };

type CatalogShape =
  | { ok: true; cashbackShareBps: number }
  | {
      ok: false;
      code:
        | "missing_attribution"
        | "missing_cashback_policy"
        | "invalid_cashback_share_bps";
      message: string;
    };

function assertLockedCatalogShape(
  snapshot: ShopeeCatalogSnapshot,
): CatalogShape {
  if (snapshot.network !== "shopee") {
    return {
      ok: false,
      code: "invalid_cashback_share_bps",
      message:
        "Catalog snapshot is not a Shopee snapshot -- refusing to promote",
    };
  }

  if (
    typeof snapshot.trackingLinkId !== "string" ||
    snapshot.trackingLinkId.length === 0
  ) {
    return {
      ok: false,
      code: "missing_attribution",
      message: "Catalog snapshot has no tracking link id",
    };
  }

  if (
    typeof snapshot.publisherId !== "string" ||
    snapshot.publisherId.length === 0
  ) {
    return {
      ok: false,
      code: "missing_attribution",
      message: "Catalog snapshot has no publisher id",
    };
  }

  if (snapshot.cashbackShareBps === null) {
    return {
      ok: false,
      code: "missing_cashback_policy",
      message: "Cashback policy is absent for this offer",
    };
  }

  if (
    !Number.isInteger(snapshot.cashbackShareBps) ||
    snapshot.cashbackShareBps < 0 ||
    snapshot.cashbackShareBps > 10_000
  ) {
    return {
      ok: false,
      code: "invalid_cashback_share_bps",
      message:
        "Cashback share is out of range: " + snapshot.cashbackShareBps,
    };
  }

  return { ok: true, cashbackShareBps: snapshot.cashbackShareBps };
}

function checkStagedRowShape(
  row: ShopeeStagedRow,
): StagedRowShape {
  if (row.processingStatus !== SHOPEE_CSV_READY_STATUS) {
    return {
      ok: false,
      code: "not_ready_for_conversion",
      message:
        "Staged row " +
        row.id +
        " processing_status is " +
        row.processingStatus +
        ", expected " +
        SHOPEE_CSV_READY_STATUS,
    };
  }

  if (row.trackingLinkId === null || row.publisherId === null) {
    return {
      ok: false,
      code: "missing_attribution",
      message:
        "Staged row " +
        row.id +
        " has missing tracking link or publisher",
    };
  }

  return { ok: true };
}

export function reduceShopeeCsvPromotion(args: {
  stagedRow: ShopeeStagedRow;
  catalog: ShopeeCatalogSnapshot;
  sourceEventPayloadSha256: string;
}): PromotePromotion {
  const stagedRow = args.stagedRow;
  const catalog = args.catalog;
  const sourceEventPayloadSha256 = args.sourceEventPayloadSha256;

  const rowShape = checkStagedRowShape(stagedRow);
  if (!rowShape.ok) {
    return { kind: "skip", reason: rowShape.code, details: rowShape.message };
  }

  const catalogShape = assertLockedCatalogShape(catalog);
  if (!catalogShape.ok) {
    return {
      kind: "skip",
      reason: catalogShape.code,
      details: catalogShape.message,
    };
  }

  if (catalog.trackingLinkId !== stagedRow.trackingLinkId) {
    return {
      kind: "skip",
      reason: "missing_attribution",
      details:
        "Catalog tracking link does not match staged row tracking link",
    };
  }

  if (catalog.publisherId !== stagedRow.publisherId) {
    return {
      kind: "skip",
      reason: "missing_attribution",
      details:
        "Catalog publisher does not match staged row publisher",
    };
  }

  let orderAmountVnd: number;
  let totalCommissionVnd: number;
  let refundedAmountVnd: number;
  try {
    orderAmountVnd = parseShopeeSourceMoneyVnd(
      stagedRow.orderValue,
      "order_value",
    );
    totalCommissionVnd = parseShopeeSourceMoneyVnd(
      stagedRow.totalProductCommission,
      "total_product_commission",
    );
    refundedAmountVnd = parseShopeeSourceMoneyVnd(
      stagedRow.refundedAmount,
      "refunded_amount",
    );
  } catch (error) {
    if (error instanceof Error) {
      return {
        kind: "skip",
        reason: "money_rejected",
        details: error.message,
      };
    }

    return {
      kind: "skip",
      reason: "money_rejected",
      details: "Shopee source money failed strict validation",
    };
  }

  const grossCommissionBig = BigInt(totalCommissionVnd);
  const refundedCommissionBig = BigInt(refundedAmountVnd);

  if (refundedCommissionBig > grossCommissionBig) {
    return {
      kind: "skip",
      reason: "money_rejected",
      details:
        "Refunded amount exceeds total product commission -- refusing to promote",
    };
  }

  const netCommissionBig = grossCommissionBig - refundedCommissionBig;

  const maxSafeBig = BigInt(Number.MAX_SAFE_INTEGER);

  if (netCommissionBig > maxSafeBig) {
    return {
      kind: "skip",
      reason: "money_rejected",
      details:
        "Net commission exceeds MAX_SAFE_INTEGER -- refusing to promote",
    };
  }

  const networkCommissionVnd = Number(netCommissionBig);

  const bpsDenominator = BigInt(10000);
  const cashbackShareBps = BigInt(catalogShape.cashbackShareBps);
  const userCashbackBig =
    (netCommissionBig * cashbackShareBps) / bpsDenominator;
  const platformProfitBig = netCommissionBig - userCashbackBig;

  const userCashbackVnd = Number(userCashbackBig);
  const platformProfitVnd = Number(platformProfitBig);

  if (userCashbackVnd + platformProfitVnd !== networkCommissionVnd) {
    return {
      kind: "skip",
      reason: "money_rejected",
      details:
        "Money invariant violated: user_cashback + platform_profit != network_commission",
    };
  }

  const sourceLine: ShopeeCsvSourceLine = {
    network: SHOPEE_NETWORK_LABEL,
    sourceEventId: stagedRow.rowFingerprintSha256,
    externalOrderId: stagedRow.externalOrderId,
    checkoutId: stagedRow.checkoutId,
    itemId: stagedRow.itemId,
    modelId: stagedRow.modelId,
    quantity: stagedRow.quantity,
    orderValue: stagedRow.orderValue,
    totalProductCommission: stagedRow.totalProductCommission,
    refundedAmount: stagedRow.refundedAmount,
    linkedProductStatus: stagedRow.linkedProductStatus,
  };

  let sourceConversionKey: string;
  try {
    sourceConversionKey =
      deriveShopeeSourceConversionKey(sourceLine);
  } catch (error) {
    return {
      kind: "skip",
      reason: "money_rejected",
      details:
        error instanceof Error
          ? error.message
          : "Source-line identity failed",
    };
  }

  return {
    kind: "promote",
    sourceConversionKey,
    network: SHOPEE_NETWORK_LABEL,
    externalOrderId: stagedRow.externalOrderId,
    trackingLinkId: catalog.trackingLinkId,
    publisherId: catalog.publisherId,
    advertiserId: catalog.advertiserId,
    campaignId: catalog.campaignId,
    offerId: catalog.offerId,
    rowFingerprintSha256: stagedRow.rowFingerprintSha256,
    stagedRowId: stagedRow.id,
    batchId: stagedRow.batchId,
    orderAmountVnd,
    networkCommissionVnd,
    cashbackShareBps: catalogShape.cashbackShareBps,
    userCashbackVnd,
    platformProfitVnd,
    ingestionEvent: {
      sourceEventId: stagedRow.rowFingerprintSha256,
      payloadSha256: sourceEventPayloadSha256,
      rawReference: {
        stagedRowId: stagedRow.id,
        batchId: stagedRow.batchId,
        rowFingerprintSha256: stagedRow.rowFingerprintSha256,
        network: SHOPEE_NETWORK_LABEL,
        externalOrderId: stagedRow.externalOrderId,
        checkoutId: stagedRow.checkoutId,
        itemId: stagedRow.itemId,
        modelId: stagedRow.modelId,
      },
    },
  };
}
