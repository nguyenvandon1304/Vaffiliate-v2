/**
 * Unit tests for the pure Shopee promotion decision reducer.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  reduceShopeeCsvPromotion,
  SHOPEE_CSV_READY_STATUS,
  type ShopeeCatalogSnapshot,
  type ShopeeStagedRow,
} from "./shopee-conversion-promoter";

function buildBaseStagedRow(
  overrides: Partial<ShopeeStagedRow> = {},
): ShopeeStagedRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    batchId: "22222222-2222-4222-8222-222222222222",
    rowFingerprintSha256:
      "1111111111111111111111111111111111111111111111111111111111111111",
    externalOrderId: "250110ABCDXYZ",
    checkoutId: "250110ABCDXYZ_c1",
    itemId: "shopee-item-001",
    modelId: "shopee-model-001",
    quantity: 1,
    orderValue: "250000",
    totalProductCommission: "25000",
    refundedAmount: "0",
    linkedProductStatus: "to_confirm",
    processingStatus: SHOPEE_CSV_READY_STATUS,
    trackingLinkId: "tl-uuid-1",
    publisherId: "pub-uuid-1",
    ...overrides,
  };
}

function buildBaseCatalog(
  overrides: Partial<ShopeeCatalogSnapshot> = {},
): ShopeeCatalogSnapshot {
  return {
    network: "shopee",
    trackingLinkId: "tl-uuid-1",
    publisherId: "pub-uuid-1",
    campaignId: "camp-1",
    offerId: "offer-1",
    advertiserId: "adv-1",
    cashbackShareBps: 6_000,
    ...overrides,
  };
}

test("promoter returns a promote decision for a fully-attributed row", () => {
  const decision = reduceShopeeCsvPromotion({
    stagedRow: buildBaseStagedRow(),
    catalog: buildBaseCatalog(),
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  });

  assert.equal(decision.kind, "promote");

  if (decision.kind !== "promote") {
    return;
  }

  assert.equal(decision.network, "shopee");
  assert.equal(decision.externalOrderId, "250110ABCDXYZ");
  assert.equal(decision.trackingLinkId, "tl-uuid-1");
  assert.equal(decision.publisherId, "pub-uuid-1");
  assert.equal(decision.advertiserId, "adv-1");
  assert.equal(decision.campaignId, "camp-1");
  assert.equal(decision.offerId, "offer-1");
  assert.equal(decision.orderAmountVnd, 250_000);
  assert.equal(decision.networkCommissionVnd, 25_000);
  assert.equal(decision.cashbackShareBps, 6_000);
  assert.equal(decision.userCashbackVnd, 15_000);
  assert.equal(decision.platformProfitVnd, 10_000);
  assert.match(decision.sourceConversionKey, /^[a-f0-9]{64}$/);
  assert.equal(
    decision.ingestionEvent.sourceEventId,
    "1111111111111111111111111111111111111111111111111111111111111111",
  );
  assert.equal(
    decision.ingestionEvent.payloadSha256,
    "2222222222222222222222222222222222222222222222222222222222222222",
  );
});

test("promoter preserves the money invariant for every cashback share", () => {
  for (const bps of [0, 2_500, 5_000, 6_000, 7_000, 8_000, 10_000]) {
    const decision = reduceShopeeCsvPromotion({
      stagedRow: buildBaseStagedRow(),
      catalog: buildBaseCatalog({ cashbackShareBps: bps }),
      sourceEventPayloadSha256:
        "2222222222222222222222222222222222222222222222222222222222222222",
    });

    assert.equal(decision.kind, "promote");

    if (decision.kind !== "promote") {
      return;
    }

    assert.equal(
      decision.userCashbackVnd + decision.platformProfitVnd,
      decision.networkCommissionVnd,
    );
    assert.equal(decision.cashbackShareBps, bps);
  }
});

test("promoter skips rows whose processing_status is not ready_for_conversion", () => {
  const decision = reduceShopeeCsvPromotion({
    stagedRow: buildBaseStagedRow({ processingStatus: "pending" }),
    catalog: buildBaseCatalog(),
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  });

  assert.equal(decision.kind, "skip");
  assert.equal(decision.reason, "not_ready_for_conversion");
});

test("promoter skips rows with a different tracking link id", () => {
  const decision = reduceShopeeCsvPromotion({
    stagedRow: buildBaseStagedRow({
      trackingLinkId: "tl-uuid-mismatch",
    }),
    catalog: buildBaseCatalog(),
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  });

  assert.equal(decision.kind, "skip");
  assert.equal(decision.reason, "missing_attribution");
});

test("promoter skips rows with a different publisher id", () => {
  const decision = reduceShopeeCsvPromotion({
    stagedRow: buildBaseStagedRow({
      publisherId: "pub-uuid-mismatch",
    }),
    catalog: buildBaseCatalog(),
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  });

  assert.equal(decision.kind, "skip");
  assert.equal(decision.reason, "missing_attribution");
});

test("promoter skips rows when the catalog has no cashback policy", () => {
  const decision = reduceShopeeCsvPromotion({
    stagedRow: buildBaseStagedRow(),
    catalog: buildBaseCatalog({ cashbackShareBps: null }),
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  });

  assert.equal(decision.kind, "skip");
  assert.equal(decision.reason, "missing_cashback_policy");
});

test("promoter rejects out-of-range cashback share bps", () => {
  const decision = reduceShopeeCsvPromotion({
    stagedRow: buildBaseStagedRow(),
    catalog: buildBaseCatalog({ cashbackShareBps: 10_001 }),
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  });

  assert.equal(decision.kind, "skip");
  assert.equal(decision.reason, "invalid_cashback_share_bps");
});

test("promoter rejects fractional money values (no truncate)", () => {
  const decision = reduceShopeeCsvPromotion({
    stagedRow: buildBaseStagedRow({
      totalProductCommission: "25000.5",
    }),
    catalog: buildBaseCatalog(),
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  });

  assert.equal(decision.kind, "skip");
  assert.equal(decision.reason, "money_rejected");
});

test("promoter rejects refunded_amount exceeding commission", () => {
  const decision = reduceShopeeCsvPromotion({
    stagedRow: buildBaseStagedRow({
      totalProductCommission: "10000",
      refundedAmount: "20000",
    }),
    catalog: buildBaseCatalog(),
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  });

  assert.equal(decision.kind, "skip");
  assert.equal(decision.reason, "money_rejected");
});

test("promoter accepts net commission after partial refund", () => {
  const decision = reduceShopeeCsvPromotion({
    stagedRow: buildBaseStagedRow({
      totalProductCommission: "10000",
      refundedAmount: "2500",
    }),
    catalog: buildBaseCatalog({ cashbackShareBps: 6_000 }),
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  });

  assert.equal(decision.kind, "promote");

  if (decision.kind !== "promote") {
    return;
  }

  assert.equal(decision.networkCommissionVnd, 7_500);
  assert.equal(decision.userCashbackVnd, 4_500);
  assert.equal(decision.platformProfitVnd, 3_000);
  assert.equal(
    decision.userCashbackVnd + decision.platformProfitVnd,
    decision.networkCommissionVnd,
  );
});

test("promoter rejects non-Shopee catalog snapshots", () => {
  const decision = reduceShopeeCsvPromotion({
    stagedRow: buildBaseStagedRow(),
    catalog: {
      ...buildBaseCatalog(),
      network: "tiktok" as unknown as "shopee",
    },
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  });

  assert.equal(decision.kind, "skip");
  assert.equal(decision.reason, "invalid_cashback_share_bps");
});

test("promoter preserves the deterministic source_conversion_key across calls", () => {
  const input = {
    stagedRow: buildBaseStagedRow(),
    catalog: buildBaseCatalog(),
    sourceEventPayloadSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  };

  const left = reduceShopeeCsvPromotion(input);
  const right = reduceShopeeCsvPromotion(input);

  assert.equal(left.kind, "promote");
  assert.equal(right.kind, "promote");

  if (left.kind !== "promote" || right.kind !== "promote") {
    return;
  }

  assert.equal(left.sourceConversionKey, right.sourceConversionKey);
});
