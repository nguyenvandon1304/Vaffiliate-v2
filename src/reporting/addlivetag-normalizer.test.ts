/**
 * Phase 20H.8 -- Unit tests for the Addlivetag row normalizer.
 *
 * Pure, no DB, no fetch, no clock. Asserts the discriminated-union
 * result of every row shape Addlivetag might emit:
 *
 *   - well-formed orders/items -> ok
 *   - missing sub_id          -> missing_sub_id
 *   - malformed sub_id        -> malformed_sub_id
 *   - missing external_order  -> malformed_row
 *   - missing item_id         -> malformed_row
 *   - clicks with no click_id -> malformed_row
 *   - clicks with valid id    -> ok_click
 *
 * Plus the status -> linked_product_status mapping for pending /
 * approved / rejected.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  computeAddlivetagRowFingerprintAsync,
  normalizeAddlivetagClickRow,
  normalizeAddlivetagRowToStaging,
} from "./addlivetag-normalizer";
import type { AddlivetagRawRow } from "./addlivetag-types";

const VALID_SUB_ID = "vaflnk1234567890abcdef00000000";

test("Phase 20H.8: normalizer maps a well-formed order to staging", () => {
  const result = normalizeAddlivetagRowToStaging({
    id: "order-1",
    order_id: "order-1",
    order_status: "approved",
    sub_id1: VALID_SUB_ID,
    item_id: "12345",
    shop_id: "67890",
    order_value: "250000.00000",
    total_product_commission: "15000.00000",
    linked_product_status: "approved",
  } satisfies AddlivetagRawRow);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.row.externalOrderId, "order-1");
  assert.equal(result.row.sourceSubId1, VALID_SUB_ID);
  assert.equal(result.row.itemId, "12345");
  assert.equal(result.row.shopId, "67890");
  assert.equal(result.row.linkedProductStatus, "linked");
  assert.equal(result.row.totalProductCommission, "15000.00000");
});

test("Phase 20H.8: normalizer falls back to order_status when linked_product_status is missing", () => {
  const result = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    order_status: "approved",
    sub_id1: VALID_SUB_ID,
    item_id: "12345",
  } satisfies AddlivetagRawRow);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.row.linkedProductStatus, "linked");
});

test("Phase 20H.8: normalizer maps pending -> pending and rejected -> rejected", () => {
  const pending = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    sub_id1: VALID_SUB_ID,
    item_id: "12345",
    order_status: "pending",
  } satisfies AddlivetagRawRow);
  assert.equal(pending.kind, "ok");
  if (pending.kind !== "ok") return;
  assert.equal(pending.row.linkedProductStatus, "pending");

  const rejected = normalizeAddlivetagRowToStaging({
    order_id: "order-2",
    sub_id1: VALID_SUB_ID,
    item_id: "12345",
    order_status: "rejected",
  } satisfies AddlivetagRawRow);
  assert.equal(rejected.kind, "ok");
  if (rejected.kind !== "ok") return;
  assert.equal(rejected.row.linkedProductStatus, "rejected");
});

test("Phase 20H.8: normalizer treats uppercase / mixed case status as canonical", () => {
  const result = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    sub_id1: VALID_SUB_ID,
    item_id: "12345",
    order_status: "  APPROVED  ",
  } satisfies AddlivetagRawRow);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.row.linkedProductStatus, "linked");
});

test("Phase 20H.8: normalizer classifies missing sub_id1 as missing_sub_id", () => {
  const result = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    item_id: "12345",
  } satisfies AddlivetagRawRow);
  assert.equal(result.kind, "missing_sub_id");
  if (result.kind !== "missing_sub_id") return;
  assert.equal(result.reason, "source_sub_id1_null");
});

test("Phase 20H.8: normalizer classifies blank sub_id1 as missing_sub_id", () => {
  const result = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    item_id: "12345",
    sub_id1: "   ",
  } satisfies AddlivetagRawRow);
  assert.equal(result.kind, "missing_sub_id");
});

test("Phase 20H.8: normalizer classifies malformed sub_id1 as malformed_sub_id", () => {
  const result = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    item_id: "12345",
    sub_id1: "not-a-vaflnk-token",
  } satisfies AddlivetagRawRow);
  assert.equal(result.kind, "malformed_sub_id");
});

test("Phase 20H.8: normalizer classifies missing order_id as malformed_row", () => {
  const result = normalizeAddlivetagRowToStaging({
    item_id: "12345",
    sub_id1: VALID_SUB_ID,
  } satisfies AddlivetagRawRow);
  assert.equal(result.kind, "malformed_row");
  if (result.kind !== "malformed_row") return;
  assert.equal(result.reason, "missing_external_order_id");
});

test("Phase 20H.8: normalizer classifies missing item_id as malformed_row", () => {
  const result = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    sub_id1: VALID_SUB_ID,
  } satisfies AddlivetagRawRow);
  assert.equal(result.kind, "malformed_row");
  if (result.kind !== "malformed_row") return;
  assert.equal(result.reason, "missing_item_id");
});

test("Phase 20H.8: normalizer converts numeric quantity but rejects fractional", () => {
  const ok = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    item_id: "12345",
    sub_id1: VALID_SUB_ID,
    quantity: 3,
  } satisfies AddlivetagRawRow);
  assert.equal(ok.kind, "ok");
  if (ok.kind !== "ok") return;
  assert.equal(ok.row.quantity, 3);

  const stringInt = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    item_id: "12345",
    sub_id1: VALID_SUB_ID,
    quantity: "2",
  } satisfies AddlivetagRawRow);
  assert.equal(stringInt.kind, "ok");
  if (stringInt.kind !== "ok") return;
  assert.equal(stringInt.row.quantity, 2);

  const fractional = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    item_id: "12345",
    sub_id1: VALID_SUB_ID,
    quantity: "1.5",
  } satisfies AddlivetagRawRow);
  assert.equal(fractional.kind, "ok");
  if (fractional.kind !== "ok") return;
  assert.equal(fractional.row.quantity, null);
});

test("Phase 20H.8: normalizer forwards money strings verbatim (no rounding)", () => {
  const result = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    item_id: "12345",
    sub_id1: VALID_SUB_ID,
    order_value: "100000.50000",
    total_product_commission: "6000.30000",
    refunded_amount: "0.00000",
  } satisfies AddlivetagRawRow);
  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") return;
  assert.equal(result.row.orderValue, "100000.50000");
  assert.equal(result.row.totalProductCommission, "6000.30000");
  assert.equal(result.row.refundedAmount, "0.00000");
});

test("Phase 20H.8: click normalizer maps a well-formed click row", () => {
  const result = normalizeAddlivetagClickRow({
    click_id: "click-1",
    click_token: "tk-1",
    item_id: "12345",
    shop_id: "67890",
    sub_id1: VALID_SUB_ID,
    channel: "shopee_app",
  });
  assert.equal(result.kind, "ok_click");
  if (result.kind !== "ok_click") return;
  assert.equal(result.row.clickId, "click-1");
  assert.equal(result.row.clickToken, "tk-1");
  assert.equal(result.row.sourceSubId1, VALID_SUB_ID);
});

test("Phase 20H.8: click normalizer rejects rows without a click_id", () => {
  const result = normalizeAddlivetagClickRow({
    item_id: "12345",
    sub_id1: VALID_SUB_ID,
  });
  assert.equal(result.kind, "malformed_row");
  if (result.kind !== "malformed_row") return;
  assert.equal(result.reason, "missing_click_id");
});

test("Phase 20H.8: row fingerprint is stable and 64-char lowercase hex", async () => {
  const a = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    item_id: "12345",
    sub_id1: VALID_SUB_ID,
  });
  assert.equal(a.kind, "ok");
  if (a.kind !== "ok") return;
  const fp1 = await computeAddlivetagRowFingerprintAsync(a.row, "orders");
  const fp2 = await computeAddlivetagRowFingerprintAsync(a.row, "orders");
  assert.equal(fp1, fp2);
  assert.match(fp1, /^[a-f0-9]{64}$/);
});

test("Phase 20H.8: different row content produces a different fingerprint", async () => {
  const a = normalizeAddlivetagRowToStaging({
    order_id: "order-1",
    item_id: "12345",
    sub_id1: VALID_SUB_ID,
  });
  const b = normalizeAddlivetagRowToStaging({
    order_id: "order-2",
    item_id: "12345",
    sub_id1: VALID_SUB_ID,
  });
  assert.equal(a.kind, "ok");
  assert.equal(b.kind, "ok");
  if (a.kind !== "ok" || b.kind !== "ok") return;
  const fp1 = await computeAddlivetagRowFingerprintAsync(a.row, "orders");
  const fp2 = await computeAddlivetagRowFingerprintAsync(b.row, "orders");
  assert.notEqual(fp1, fp2);
});
