import test from "node:test";
import assert from "node:assert/strict";

import {
  SHOPEE_DEVELOPMENT_COMMISSION_RATES,
  lookupDevelopmentShopeeCommissionRateBps,
} from "./shopee-commission-rate-fixture";

test("Phase 20H.3d canonical fixture product returns 2000 bps", () => {
  const rate = lookupDevelopmentShopeeCommissionRateBps({
    shopId: "1408027998",
    itemId: "44812498433",
  });
  assert.equal(rate, 2000);
});

test("item-only match falls back to the canonical fixture product", () => {
  const rate = lookupDevelopmentShopeeCommissionRateBps({
    shopId: "99999",
    itemId: "44812498433",
  });
  assert.equal(rate, 2000);
});

test("shop-only match returns the canonical fixture product rate", () => {
  const rate = lookupDevelopmentShopeeCommissionRateBps({
    shopId: "1408027998",
    itemId: "99999",
  });
  assert.equal(rate, 2000);
});

test("unknown itemId and shopId returns null", () => {
  const rate = lookupDevelopmentShopeeCommissionRateBps({
    shopId: "11111",
    itemId: "22222",
  });
  assert.equal(rate, null);
});

test("whitespace-only shopId and itemId inputs return null safely", () => {
  const rate = lookupDevelopmentShopeeCommissionRateBps({
    shopId: "   ",
    itemId: "   ",
  });
  assert.equal(rate, null);
});

test("exported fixture constant is frozen", () => {
  assert.equal(Object.isFrozen(SHOPEE_DEVELOPMENT_COMMISSION_RATES), true);
  for (const entry of SHOPEE_DEVELOPMENT_COMMISSION_RATES) {
    assert.equal(Object.isFrozen(entry), true);
  }
});

test("every fixture entry has a valid bps value", () => {
  for (const entry of SHOPEE_DEVELOPMENT_COMMISSION_RATES) {
    assert.equal(typeof entry.commissionRateBps, "number");
    assert.ok(Number.isInteger(entry.commissionRateBps));
    assert.ok(entry.commissionRateBps >= 0);
    assert.ok(entry.commissionRateBps <= 10_000);
    assert.ok(typeof entry.note === "string");
    assert.ok(entry.note.length > 0);
  }
});
