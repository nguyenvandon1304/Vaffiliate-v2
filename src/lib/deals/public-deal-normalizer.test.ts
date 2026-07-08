/**
 * Phase 20I.2 -- normalizer tests.
 *
 * Verifies:
 *   - valid raw offer normalizes to PublicDeal;
 *   - missing title / image / destination URL does NOT crash;
 *   - raw tracking fields are stripped, not forwarded;
 *   - voucher / deal / cashback copy never claims a guaranteed
 *     outcome (the sanitizer pass enforces this; the normalizer
 *     forwards only safe-conditional copy).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRawOffer,
  normalizeRawOfferBatch,
  mapOfferSource,
} from "./public-deal-normalizer";
import type { RawOffer } from "./sources/public-offer-feed.types";

function rawOfferOf(overrides: Partial<RawOffer> = {}): RawOffer {
  return {
    vendorId: "raw-test-1",
    platform: "shopee",
    kind: "deal",
    title: "Laptop gaming test",
    description: "Ưu đãi có thể thay đổi theo điều kiện của sàn.",
    imageUrl: "https://cf.shopee.vn/test.jpg",
    destinationUrl: "https://shopee.vn/dien-tu/laptop",
    categoryHint: "electronics",
    priceText: "10000000",
    discountText: "-10%",
    voucherLabel: undefined,
    cashbackHint: undefined,
    validFrom: undefined,
    validUntil: "2099-12-31T00:00:00.000Z",
    status: "active",
    tracking: undefined,
    extra: undefined,
    ...overrides,
  };
}

test("normalizeRawOffer converts a clean raw offer into a PublicDeal", () => {
  const result = normalizeRawOffer(rawOfferOf());
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.platform, "shopee");
    assert.strictEqual(result.value.title, "Laptop gaming test");
    assert.strictEqual(result.value.kind, "deal");
    assert.strictEqual(result.value.status, "active");
  }
});

test("normalizeRawOffer strips the entire `tracking` hint bag", () => {
  const result = normalizeRawOffer(
    rawOfferOf({
      tracking: {
        networkSubId: "must-not-leak",
        sourceSubId1: "must-not-leak",
        publisherId: "must-not-leak",
        shortCode: "x",
        clickId: "y",
        trackingPath: "/r/abc",
        an_redir: "https://an-redir.com/r",
        vaflnk: "https://vaflnk.com/r",
        purchaseIntentId: "z",
        subId1: "1",
        aff_sub: "true",
      },
    }),
  );
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    const serialised = JSON.stringify(result.value);
    for (const hint of [
      "must-not-leak",
      "networkSubId",
      "sourceSubId1",
      "publisherId",
      "shortCode",
      "clickId",
      "trackingPath",
      "an_redir",
      "vaflnk",
      "purchaseIntentId",
      "aff_sub",
      "subId1",
    ]) {
      assert.ok(
        !serialised.toLowerCase().includes(hint.toLowerCase()),
        `normalizer leaked ${hint} into PublicDeal`,
      );
    }
  }
});

test("normalizeRawOffer does NOT leak any field of `extra`", () => {
  const result = normalizeRawOffer(
    rawOfferOf({
      extra: { internalProductId: 42, internalShopId: 99 },
    }),
  );
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    const serialised = JSON.stringify(result.value);
    assert.ok(!serialised.includes("internalProductId"));
    assert.ok(!serialised.includes("internalShopId"));
  }
});

test("normalizeRawOffer returns ok=false when title is missing", () => {
  const result = normalizeRawOffer(rawOfferOf({ title: undefined }));
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, "missing-title");
  }
});

test("normalizeRawOffer does NOT crash when destinationUrl is missing", () => {
  const result = normalizeRawOffer(
    rawOfferOf({ destinationUrl: undefined }),
  );
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.ok(result.value.destinationUrl.startsWith("https://shopee.vn"));
    assert.ok(result.warnings.includes("missing-destination-url"));
  }
});

test("normalizeRawOffer does NOT crash when imageUrl is missing", () => {
  const result = normalizeRawOffer(rawOfferOf({ imageUrl: undefined }));
  assert.strictEqual(result.ok, true);
});

test("normalizeRawOffer maps unknown vendor platform to ok=false", () => {
  const result = normalizeRawOffer(rawOfferOf({ platform: "wish" as never }));
  assert.strictEqual(result.ok, false);
});

test("normalizeRawOffer maps unknown category hint to the popular fallback bucket", () => {
  const result = normalizeRawOffer(rawOfferOf({ categoryHint: "alien-vendors" }));
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.categorySlug, "popular");
  }
});

test("normalizeRawOffer maps cashback_kind into a cashback_program", () => {
  const result = normalizeRawOffer(
    rawOfferOf({
      kind: "cashback_program",
      cashbackHint: "Dự kiến 5% sau khi đối soát.",
    }),
  );
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.kind, "cashback_program");
  }
});

test("normalizeRawOfferBatch drops malformed entries without throwing", () => {
  const result = normalizeRawOfferBatch([
    rawOfferOf({ vendorId: "ok-1" }),
    rawOfferOf({ vendorId: "ok-2", title: undefined }),
    { vendorId: "", platform: "shopee", kind: "deal" } as RawOffer,
  ]);
  assert.strictEqual(result.deals.length, 1);
  assert.strictEqual(result.skipped.length, 2);
});

test("mapOfferSource returns the raw source label verbatim", () => {
  assert.strictEqual(mapOfferSource("addlivetag"), "addlivetag");
  assert.strictEqual(mapOfferSource("shopee-feed"), "shopee-feed");
  assert.strictEqual(mapOfferSource("manual"), "manual");
});
