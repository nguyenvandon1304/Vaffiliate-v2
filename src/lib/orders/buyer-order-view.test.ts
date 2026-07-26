/**
 * Unit tests for the Phase 20L buyer-order projection and status filter.
 *
 * Run with:
 *
 *     npx tsx --test src/lib/orders/buyer-order-view.test.ts
 *
 * The projection is pure so it can be exercised without the server-only
 * Supabase client. These tests lock the public data boundary: the buyer view
 * must expose only the whitelisted fields and must never leak internal
 * conversion fields (publisherId, networkCommission, platformProfit, the
 * advertiser/campaign/offer/trackingLink ids, sourceConversionKey,
 * validation/settlement status, ingestionEventId).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { CONVERSION_STATUSES, type Conversion } from "@/types/affiliate";
import type { OrderStatusFilter } from "@/types/orders";

import {
  matchesBuyerStatusFilter,
  toBuyerOrderView,
  type BuyerOrderView,
} from "./buyer-order-view";

function buildConversion(
  overrides: Partial<Conversion> = {},
): Conversion {
  return {
    id: "11111111-1111-4111-8111-111111111111" as Conversion["id"],
    orderId: "shopee-order-001" as Conversion["orderId"],
    advertiserId: "adv-1" as Conversion["advertiserId"],
    campaignId: "camp-1" as Conversion["campaignId"],
    offerId: "offer-1" as Conversion["offerId"],
    publisherId: "22222222-2222-4222-8222-222222222222" as Conversion["publisherId"],
    trackingLinkId: "tl-1" as Conversion["trackingLinkId"],
    status: "pending",
    orderAmount: { amount: 250_000, currency: "VND" },
    networkCommission: { amount: 25_000, currency: "VND" },
    userCashback: { amount: 15_000, currency: "VND" },
    platformProfit: { amount: 10_000, currency: "VND" },
    occurredAt: "2026-05-12",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Public data boundary
// ---------------------------------------------------------------------------

test("toBuyerOrderView exposes only the five public fields", () => {
  const view = toBuyerOrderView(buildConversion());
  assert.deepEqual(Object.keys(view).sort(), [
    "cashbackAmount",
    "id",
    "occurredAt",
    "orderAmount",
    "status",
  ].sort());
});

test("toBuyerOrderView never leaks internal conversion fields", () => {
  const view = toBuyerOrderView(
    buildConversion({
      sourceConversionKey:
        "1111111111111111111111111111111111111111111111111111111111111111",
      validationStatus: "recorded",
      settlementStatus: "not_payable",
      ingestionEventId: "11111111-1111-4111-8111-111111111111",
    }),
  ) as unknown as Record<string, unknown>;

  for (const leaked of [
    "publisherId",
    "networkCommission",
    "platformProfit",
    "advertiserId",
    "campaignId",
    "offerId",
    "trackingLinkId",
    "orderId",
    "sourceConversionKey",
    "validationStatus",
    "settlementStatus",
    "ingestionEventId",
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(view, leaked),
      false,
      `buyer view must not expose ${leaked}`,
    );
  }
});

test("toBuyerOrderView maps cashback from userCashback, not commission", () => {
  const view = toBuyerOrderView(buildConversion());
  assert.deepEqual(view.cashbackAmount, { amount: 15_000, currency: "VND" });
  assert.deepEqual(view.orderAmount, { amount: 250_000, currency: "VND" });
});

test("toBuyerOrderView preserves id, status and occurredAt", () => {
  const view = toBuyerOrderView(buildConversion({ status: "approved" }));
  assert.equal(view.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(view.status, "approved");
  assert.equal(view.occurredAt, "2026-05-12");
});

// ---------------------------------------------------------------------------
// Rejection reason handling
// ---------------------------------------------------------------------------

test("toBuyerOrderView omits rejectedReason when the conversion has none", () => {
  const view = toBuyerOrderView(
    buildConversion(),
  ) as unknown as Record<string, unknown>;
  assert.equal(
    Object.prototype.hasOwnProperty.call(view, "rejectedReason"),
    false,
  );
});

test("toBuyerOrderView surfaces a public rejectedReason when present", () => {
  const view = toBuyerOrderView(
    buildConversion({
      status: "rejected",
      rejectedReason: "Đơn bị hoàn trả trước khi đối soát",
    }),
  );
  assert.equal(view.rejectedReason, "Đơn bị hoàn trả trước khi đối soát");
});

// ---------------------------------------------------------------------------
// Status filter
// ---------------------------------------------------------------------------

test("matchesBuyerStatusFilter with 'all' accepts every canonical status", () => {
  for (const status of CONVERSION_STATUSES) {
    assert.equal(matchesBuyerStatusFilter(status, "all"), true);
  }
});

test("matchesBuyerStatusFilter matches a specific status exactly", () => {
  const filters: OrderStatusFilter[] = [
    "pending",
    "approved",
    "rejected",
    "payable",
    "paid",
  ];
  for (const filter of filters) {
    for (const status of CONVERSION_STATUSES) {
      assert.equal(
        matchesBuyerStatusFilter(status, filter),
        status === filter,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Populated / empty projection over a list
// ---------------------------------------------------------------------------

test("projecting and filtering a list keeps only matching owned rows", () => {
  const conversions = [
    buildConversion({ id: "a" as Conversion["id"], status: "pending" }),
    buildConversion({ id: "b" as Conversion["id"], status: "paid" }),
    buildConversion({ id: "c" as Conversion["id"], status: "pending" }),
  ];

  const paid: BuyerOrderView[] = conversions
    .filter((c) => matchesBuyerStatusFilter(c.status, "paid"))
    .map(toBuyerOrderView);

  assert.equal(paid.length, 1);
  assert.equal(paid[0].id, "b");
});
