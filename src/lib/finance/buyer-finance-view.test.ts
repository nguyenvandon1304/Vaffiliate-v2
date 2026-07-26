/**
 * Phase 20M-R -- unit tests for the read-only buyer finance projection.
 *
 * Run with:
 *
 *     npx tsx --test src/lib/finance/buyer-finance-view.test.ts
 *
 * The projection is pure, so it runs without the server-only Supabase
 * client. These tests lock two things: the totals only ever come from
 * verified `ConversionStatus` values, and the history rows carry no
 * internal conversion fields.
 *
 * The expected sums below are written as literals rather than recomputed
 * with the production helper, so a bug in the aggregation cannot make the
 * assertions agree with it.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CONVERSION_STATUSES, type Conversion } from "@/types/affiliate";
import { formatMoney, formatDate } from "@/lib/analytics/format";

import { toBuyerFinanceView } from "./buyer-finance-view";

let idCounter = 0;

function buildConversion(
  overrides: Partial<Conversion> = {},
): Conversion {
  idCounter += 1;
  return {
    id: `conversion-${idCounter}` as Conversion["id"],
    orderId: `shopee-order-${idCounter}` as Conversion["orderId"],
    advertiserId: "adv-1" as Conversion["advertiserId"],
    campaignId: "camp-1" as Conversion["campaignId"],
    offerId: "offer-1" as Conversion["offerId"],
    publisherId:
      "22222222-2222-4222-8222-222222222222" as Conversion["publisherId"],
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

function cashback(
  status: Conversion["status"],
  amount: number,
): Conversion {
  return buildConversion({
    status,
    userCashback: { amount, currency: "VND" },
  });
}

// ---------------------------------------------------------------------------
// Status-to-total rules
// ---------------------------------------------------------------------------

test("each verified status total sums only its own conversions", () => {
  const view = toBuyerFinanceView([
    cashback("payable", 30_000),
    cashback("payable", 12_500),
    cashback("pending", 7_000),
    cashback("approved", 4_000),
    cashback("paid", 91_000),
  ]);

  assert.equal(view.totals.payable.amount, 42_500);
  assert.equal(view.totals.pending.amount, 7_000);
  assert.equal(view.totals.approved.amount, 4_000);
  assert.equal(view.totals.paid.amount, 91_000);
});

test("rejected cashback is excluded from every total", () => {
  const view = toBuyerFinanceView([
    cashback("rejected", 500_000),
    cashback("payable", 20_000),
  ]);

  assert.equal(view.totals.payable.amount, 20_000);
  assert.equal(view.totals.pending.amount, 0);
  assert.equal(view.totals.approved.amount, 0);
  assert.equal(view.totals.paid.amount, 0);
});

test("pending cashback is never counted as payable", () => {
  const view = toBuyerFinanceView([cashback("pending", 80_000)]);

  assert.equal(view.totals.payable.amount, 0);
  assert.equal(view.totals.pending.amount, 80_000);
});

test("paid cashback is kept separate from payable cashback", () => {
  const view = toBuyerFinanceView([
    cashback("paid", 60_000),
    cashback("payable", 25_000),
  ]);

  assert.equal(view.totals.paid.amount, 60_000);
  assert.equal(view.totals.payable.amount, 25_000);
});

test("approved cashback is not folded into payable", () => {
  const view = toBuyerFinanceView([cashback("approved", 33_000)]);

  assert.equal(view.totals.payable.amount, 0);
  assert.equal(view.totals.approved.amount, 33_000);
});

test("every canonical status is accepted without throwing", () => {
  for (const status of CONVERSION_STATUSES) {
    assert.doesNotThrow(() => toBuyerFinanceView([cashback(status, 1_000)]));
  }
});

// ---------------------------------------------------------------------------
// Zero vs absent
// ---------------------------------------------------------------------------

test("domain zero is preserved as a real zero amount", () => {
  const view = toBuyerFinanceView([cashback("payable", 0)]);

  assert.equal(view.totals.payable.amount, 0);
  assert.equal(view.totals.payable.currency, "VND");
});

test("no conversions produces zero totals and an empty history", () => {
  const view = toBuyerFinanceView([]);

  assert.equal(view.totals.payable.amount, 0);
  assert.equal(view.totals.pending.amount, 0);
  assert.equal(view.totals.approved.amount, 0);
  assert.equal(view.totals.paid.amount, 0);
  assert.equal(view.history.length, 0);
});

test("a missing optional rejectedReason is omitted, not coerced", () => {
  const view = toBuyerFinanceView([cashback("pending", 5_000)]);
  const row = view.history[0] as unknown as Record<string, unknown>;

  assert.equal(
    Object.prototype.hasOwnProperty.call(row, "rejectedReason"),
    false,
  );
});

test("a public rejectedReason is preserved on the history row", () => {
  const view = toBuyerFinanceView([
    buildConversion({
      status: "rejected",
      rejectedReason: "Đơn bị hoàn trả trước khi đối soát",
    }),
  ]);

  assert.equal(
    view.history[0].rejectedReason,
    "Đơn bị hoàn trả trước khi đối soát",
  );
});

// ---------------------------------------------------------------------------
// Public data boundary
// ---------------------------------------------------------------------------

test("history rows never leak internal conversion fields", () => {
  const view = toBuyerFinanceView([
    buildConversion({
      sourceConversionKey:
        "1111111111111111111111111111111111111111111111111111111111111111",
      validationStatus: "recorded",
      settlementStatus: "not_payable",
      ingestionEventId: "11111111-1111-4111-8111-111111111111",
    }),
  ]);

  const row = view.history[0] as unknown as Record<string, unknown>;

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
      Object.prototype.hasOwnProperty.call(row, leaked),
      false,
      `finance history must not expose ${leaked}`,
    );
  }
});

test("the view exposes only totals and history at the top level", () => {
  const view = toBuyerFinanceView([cashback("payable", 1_000)]);
  assert.deepEqual(Object.keys(view).sort(), ["history", "totals"]);
});

test("totals expose only the four verified status buckets", () => {
  const view = toBuyerFinanceView([]);
  assert.deepEqual(Object.keys(view.totals).sort(), [
    "approved",
    "paid",
    "payable",
    "pending",
  ]);
});

// ---------------------------------------------------------------------------
// Shared formatters
// ---------------------------------------------------------------------------

test("totals are Money values the shared formatter accepts", () => {
  const view = toBuyerFinanceView([cashback("payable", 1_247_000)]);
  assert.equal(formatMoney(view.totals.payable), formatMoney({
    amount: 1_247_000,
    currency: "VND",
  }));
});

test("history timestamps are accepted by the shared date formatter", () => {
  const view = toBuyerFinanceView([
    buildConversion({ occurredAt: "2026-05-12" }),
  ]);
  assert.equal(formatDate(view.history[0].occurredAt), "12/05/2026");
});

// ---------------------------------------------------------------------------
// Retired mock surface
// ---------------------------------------------------------------------------

const financePageSource = readFileSync(
  new URL("../../app/app/finance/page.tsx", import.meta.url),
  "utf8",
);

const withdrawCardSource = readFileSync(
  new URL("../../features/finance/WithdrawCard.tsx", import.meta.url),
  "utf8",
);

test("the finance route no longer reaches the mock finance chain", () => {
  assert.equal(financePageSource.includes("loadFinanceAsync"), false);
  assert.equal(financePageSource.includes("finance.repository"), false);
  assert.equal(financePageSource.includes("TransactionHistory"), false);
});

test("the finance route uses the authenticated buyer loader", () => {
  assert.equal(financePageSource.includes("loadBuyerFinanceAsync"), true);
});

test("unverified mock finance statuses are absent from the route", () => {
  for (const mockStatus of ["Hoàn tất", "Đã cộng ví", "Tạm giữ"]) {
    assert.equal(
      financePageSource.includes(mockStatus),
      false,
      `route must not render the unverified status ${mockStatus}`,
    );
  }
});

test("the hardcoded zero fallback is gone from the route", () => {
  assert.equal(financePageSource.includes('"0đ"'), false);
});

test("the unsupported withdrawal threshold copy is gone", () => {
  assert.equal(withdrawCardSource.includes("100.000"), false);
  assert.equal(withdrawCardSource.includes("Rút tối thiểu"), false);
});

test("the withdrawal surface submits nothing", () => {
  assert.equal(withdrawCardSource.includes("<button"), false);
  assert.equal(withdrawCardSource.includes("onClick"), false);
  assert.equal(withdrawCardSource.includes("<form"), false);
});
