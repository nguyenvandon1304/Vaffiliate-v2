/**
 * Phase 20I.2 -- raw Addlivetag v2 payload mapping tests.
 *
 * Verifies:
 *   - mapped RawOffer DOES NOT carry any internal productId /
 *     shopId / brandId / categoryId / collectionId / commissionRate
 *     into the buyer-facing layer;
 *   - mappers tolerate missing fields (no crash);
 *   - the deterministic vendor id is stable across replays.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  mapBrandOfferV2ToRawOffer,
  mapProductOfferV2ToRawOffer,
  mapShopeeOfferV2ToRawOffer,
  type AddlivetagBrandOfferV2Raw,
  type AddlivetagProductOfferV2Raw,
  type AddlivetagShopeeOfferV2Raw,
} from "./addlivetag-offer-raw.types";

const INTERNAL_ID_FIELDS = [
  "productId",
  "shopId",
  "brandId",
  "categoryId",
  "collectionId",
  "shopName",
  "offerType",
  "soldCount",
  "ratingStar",
  "price",
  "priceMin",
  "priceMax",
];

function serialise(value: unknown): string {
  return JSON.stringify(value);
}

test("mapShopeeOfferV2ToRawOffer drops categoryId + collectionId + offerType", () => {
  const raw: AddlivetagShopeeOfferV2Raw = {
    offerName: "Sale",
    offerLink: "https://an-redir.com/r?clickId=x",
    originalLink: "https://shopee.vn/dien-tu/sale",
    imageUrl: "https://cf.shopee.vn/sale.jpg",
    commissionRate: 0.05,
    offerType: 2,
    categoryId: 99,
    collectionId: 7,
    periodStartTime: 0,
    periodEndTime: 9999999999999,
  };
  const out = mapShopeeOfferV2ToRawOffer(raw);
  const serialised = serialise(out);
  for (const field of INTERNAL_ID_FIELDS) {
    assert.ok(!serialised.includes(field), "leaked " + field);
  }
  assert.strictEqual(out.platform, "shopee");
  assert.strictEqual(out.destinationUrl, "https://shopee.vn/dien-tu/sale");
  assert.strictEqual(out.tracking?.affiliateUrl, "https://an-redir.com/r?clickId=x");
});

test("mapShopeeOfferV2ToRawOffer does not crash on empty payload", () => {
  const out = mapShopeeOfferV2ToRawOffer({});
  assert.ok(typeof out.vendorId === "string");
  assert.strictEqual(out.platform, "shopee");
});

test("mapBrandOfferV2ToRawOffer drops brandId + commissionRate", () => {
  const raw: AddlivetagBrandOfferV2Raw = {
    brandId: 77,
    brandName: "Sony",
    commissionRate: 0.07,
    imageUrl: "https://cf.shopee.vn/sony.jpg",
    offerLink: "https://shp.ee/r",
    originalLink: "https://shopee.vn/sony",
    periodStartTime: 0,
    periodEndTime: 9999999999999,
  };
  const out = mapBrandOfferV2ToRawOffer(raw);
  const serialised = serialise(out);
  for (const field of INTERNAL_ID_FIELDS) {
    assert.ok(!serialised.includes(field), "leaked " + field);
  }
  assert.strictEqual(out.title, "Sony");
  assert.strictEqual(out.destinationUrl, "https://shopee.vn/sony");
});

test("mapProductOfferV2ToRawOffer drops productId/shopId/shopName/soldCount/ratingStar/price", () => {
  const raw: AddlivetagProductOfferV2Raw = {
    productId: 12345,
    productName: "Tai nghe bluetooth",
    commissionRate: 0.04,
    price: 120000,
    priceMin: 100000,
    priceMax: 200000,
    imageUrl: "https://cf.shopee.vn/tainghe.jpg",
    offerLink: "https://shp.ee/abc",
    shopId: 99,
    shopName: "Top Tech Shop",
    soldCount: 1234,
    ratingStar: 4.8,
    periodStartTime: 0,
    periodEndTime: 9999999999999,
  };
  const out = mapProductOfferV2ToRawOffer(raw);
  const serialised = serialise(out);
  for (const field of INTERNAL_ID_FIELDS) {
    assert.ok(!serialised.includes(field), "leaked " + field);
  }
  assert.strictEqual(out.title, "Tai nghe bluetooth");
  assert.strictEqual(out.destinationUrl, undefined);
});

test("productOfferV2 mapper uses offerLink when originalLink missing", () => {
  const out = mapProductOfferV2ToRawOffer({
    productName: "Hang A",
    offerLink: "https://shp.ee/hanga",
  });
  // destinationUrl stays undefined since originalLink is missing;
  // the affiliate url still rides along in `tracking`.adapterUrl.
  assert.strictEqual(out.destinationUrl, undefined);
  assert.strictEqual(out.tracking?.affiliateUrl, "https://shp.ee/hanga");
});

test("vendor id is stable across replays for the same payload", () => {
  const a = mapShopeeOfferV2ToRawOffer({
    offerName: "Stable id",
    offerLink: "https://shp.ee/r1",
  });
  const b = mapShopeeOfferV2ToRawOffer({
    offerName: "Stable id",
    offerLink: "https://shp.ee/r1",
  });
  assert.strictEqual(a.vendorId, b.vendorId);
  assert.ok(a.vendorId.startsWith("shopeeOfferV2-"));
});
