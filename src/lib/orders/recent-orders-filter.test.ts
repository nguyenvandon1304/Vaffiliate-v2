/**
 * Phase 20I.8 follow-up safety -- active-recent-orders filter tests.
 *
 * Locks the contract enforced by `filterActiveRecentOrders` so a
 * future regression cannot reintroduce TikTok Shop (or any other
 * upcoming-platform) into active buyer-facing order rows with
 * cashback amounts or reconciliation statuses.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  filterActiveRecentOrders,
  isActiveOrderStore,
} from "./recent-orders-filter";
import type { RecentOrder } from "@/types/orders";

const BASE_ORDER: RecentOrder = {
  store: "Shopee",
  item: "Thời trang nam - Áo thun",
  status: "approved",
  amount: "+18.000đ",
  total: "320.000đ",
  time: "2 giờ trước",
};

const TIKTOK_ORDER: RecentOrder = {
  store: "TikTok Shop",
  item: "Kem chống nắng SPF50",
  status: "approved",
  amount: "+26.000đ",
  total: "410.000đ",
  time: "1 giờ trước",
};

test("isActiveOrderStore recognises Shopee as the sole active store", () => {
  assert.equal(isActiveOrderStore("Shopee"), true);
  assert.equal(isActiveOrderStore("shopee"), true);
  assert.equal(isActiveOrderStore(" Shopee "), true);
});

test("isActiveOrderStore rejects TikTok Shop and other upcoming platforms", () => {
  assert.equal(isActiveOrderStore("TikTok Shop"), false);
  assert.equal(isActiveOrderStore("tiktok shop"), false);
  assert.equal(isActiveOrderStore("Lazada"), false);
  assert.equal(isActiveOrderStore("Tiki"), false);
  assert.equal(isActiveOrderStore("Sendo"), false);
  assert.equal(isActiveOrderStore("Shopee Food"), false);
  assert.equal(isActiveOrderStore(""), false);
});

test("filterActiveRecentOrders keeps Shopee rows untouched", () => {
  const out = filterActiveRecentOrders([BASE_ORDER]);
  assert.equal(out.length, 1);
  assert.equal(out[0], BASE_ORDER);
});

test("filterActiveRecentOrders drops TikTok Shop rows entirely", () => {
  const out = filterActiveRecentOrders([BASE_ORDER, TIKTOK_ORDER]);
  assert.equal(out.length, 1);
  assert.equal(out[0].store, "Shopee");
});

test("filterActiveRecentOrders drops TikTok Shop even when paired with active reconciliation statuses", () => {
  // Manual QA screenshot blocker: TikTok Shop was surfacing with
  // "+26.000đ", "+22.000đ", "+31.000đ" statuses, plus reconciliation
  // statuses. None of those rows are acceptable on a buyer-facing
  // surface today.
  const statuses: RecentOrder["status"][] = [
    "recorded",
    "reconciling",
    "approved",
    "payable",
    "paid",
  ];
  for (const status of statuses) {
    const tiktokRow: RecentOrder = {
      ...TIKTOK_ORDER,
      status,
      amount: "+26.000đ",
    };
    const out = filterActiveRecentOrders([tiktokRow]);
    assert.equal(
      out.length,
      0,
      `filter must drop a TikTok Shop row with status '${status}'`,
    );
  }
});

test("filterActiveRecentOrders drops TikTok Shop regardless of cashback amount", () => {
  // The exact manually-flagged amounts must never reach the buyer.
  const amounts = ["+26.000đ", "+22.000đ", "+31.000đ", "+186.000đ"];
  for (const amount of amounts) {
    const tiktokRow: RecentOrder = { ...TIKTOK_ORDER, amount };
    const out = filterActiveRecentOrders([tiktokRow]);
    assert.equal(
      out.length,
      0,
      `filter must drop a TikTok Shop row with amount '${amount}'`,
    );
  }
});

test("filterActiveRecentOrders keeps TikTok-style product names only on Shopee rows", () => {
  // It is fine for a Shopee order to mention "Kem chống nắng SPF50"
  // (Shopee sells it). The contract is store-based, not item-based.
  const shopeeSkincare: RecentOrder = {
    ...BASE_ORDER,
    item: "Kem chống nắng SPF50",
  };
  const out = filterActiveRecentOrders([shopeeSkincare]);
  assert.equal(out.length, 1);
  assert.equal(out[0].item, "Kem chống nắng SPF50");
});

test("filterActiveRecentOrders is defensive against non-object or missing store values", () => {
  // Cast forces a runtime sanity check; the runtime guards in the
  // filter must absorb these without throwing.
  const messy = [
    null,
    undefined,
    {},
    { store: 123 },
    { store: "Shopee", item: "ok", status: "approved", amount: "+1đ", total: "1đ", time: "x" },
  ] as unknown as RecentOrder[];
  const out = filterActiveRecentOrders(messy);
  assert.equal(out.length, 1);
  assert.equal(out[0].store, "Shopee");
});

test("filterActiveRecentOrders does not mutate the input array", () => {
  const input = [BASE_ORDER, TIKTOK_ORDER];
  const inputCopy = [...input];
  filterActiveRecentOrders(input);
  assert.deepEqual(input, inputCopy, "input array must not be mutated");
});
