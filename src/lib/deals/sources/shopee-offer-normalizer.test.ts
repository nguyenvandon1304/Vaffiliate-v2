/**
 * Phase 20I.4 -- tests for the pure Shopee offer v2 / brand v2 /
 * product v2 raw-offer normalizers.
 *
 * Every test uses a fixture that mirrors the documented response
 * shape and the sample the team has captured from the "Thu ngay"
 * button. The point is to fix the wire contract so the production
 * parser does not regress when the response evolves.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBrandOfferV2Raw,
  normalizeProductOfferV2Raw,
  normalizeShopeeOfferV2Raw,
} from "./shopee-offer-normalizer";

test("Phase 20I.4: normalizeShopeeOfferV2Raw maps the documented sample", () => {
  const result = normalizeShopeeOfferV2Raw({
    commissionRate: "0.07",
    imageUrl: "https://cf.shopee.vn/file/vn-11111111-7bee3",
    offerLink: "https://s.shopee.vn/AAAAA",
    originalLink: "https://shopee.vn/ma-giam-gia",
    offerName:
      "KOL - High commision for Social KOL_01.07.2026 - 31.07.2026 - Fashion Accessories",
    offerType: 2,
    categoryId: 100636,
    collectionId: 1000,
    periodStartTime: 1782838800,
    periodEndTime: 1785517199,
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.platform, "shopee");
    assert.strictEqual(result.value.kind, "deal");
    assert.ok(
      typeof result.value.title === "string" &&
        result.value.title.startsWith("KOL - High commision"),
    );
    assert.strictEqual(
      result.value.destinationUrl,
      "https://s.shopee.vn/AAAAA",
    );
    assert.strictEqual(
      result.value.validUntil,
      new Date(1785517199 * 1000).toISOString(),
    );
    const serialised = JSON.stringify(result.value);
    assert.ok(!serialised.includes("categoryId"));
    assert.ok(!serialised.includes("collectionId"));
    assert.ok(!serialised.includes("offerType"));
    // Phase 20I.4 follow-up: `commissionRate` is now a typed
    // buyer-facing field on RawOffer / PublicDeal. The raw STRING
    // form `"0.07"` and the raw field-name alias `originalCommission`
    // must NOT leak; the typed numeric IS allowed to appear.
    assert.ok(!/"commissionRate"\s*:\s*"0\.07"/.test(serialised));
    assert.ok(
      typeof result.value.cashbackHint === "string" &&
        result.value.cashbackHint.includes("7"),
      "cashbackHint should mention the percentage",
    );
  }
});

test("Phase 20I.4: normalizeShopeeOfferV2Raw refuses to synthesise a voucher code", () => {
  const result = normalizeShopeeOfferV2Raw({
    offerName: "Anything",
    offerLink: "https://shopee.vn/anything",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.kind, "deal");
    assert.strictEqual(result.value.voucherLabel, undefined);
  }
});

test("Phase 20I.4: normalizeShopeeOfferV2Raw returns ok=false when title is missing", () => {
  const result = normalizeShopeeOfferV2Raw({});
  assert.strictEqual(result.ok, false);
});

test("Phase 20I.4: normalizeShopeeOfferV2Raw coerces numeric commissionRate", () => {
  const result = normalizeShopeeOfferV2Raw({
    offerName: "Sample",
    offerLink: "https://shopee.vn/sample",
    commissionRate: 0.125,
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.ok(
      typeof result.value.cashbackHint === "string" &&
        result.value.cashbackHint.includes("12.50"),
      "commissionRate should render as a percentage with 2dp",
    );
  }
});

test("Phase 20I.4: normalizeShopeeOfferV2Raw tolerates malformed numeric commissionRate", () => {
  const result = normalizeShopeeOfferV2Raw({
    offerName: "Sample",
    offerLink: "https://shopee.vn/sample",
    commissionRate: "not-a-number",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.cashbackHint, undefined);
  }
});

test("Phase 20I.4: normalizeShopeeOfferV2Raw does NOT divide periodEndTime by 1000", () => {
  const result = normalizeShopeeOfferV2Raw({
    offerName: "Sample",
    offerLink: "https://shopee.vn/sample",
    periodEndTime: 1785517199,
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(
      result.value.validUntil,
      new Date(1785517199 * 1000).toISOString(),
    );
  }
});

test("Phase 20I.4: normalizeBrandOfferV2Raw maps the documented sample", () => {
  const result = normalizeBrandOfferV2Raw({
    brandId: 12345,
    brandName: "Sony Vietnam",
    commissionRate: 0.07,
    imageUrl: "https://cf.shopee.vn/sony.jpg",
    offerLink: "https://s.shopee.vn/BRAND",
    originalLink: "https://shopee.vn/sony",
    periodStartTime: 1782838800,
    periodEndTime: 1785517199,
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.title, "Sony Vietnam");
    assert.strictEqual(result.value.destinationUrl, "https://s.shopee.vn/BRAND");
    const serialised = JSON.stringify(result.value);
    assert.ok(!serialised.includes("brandId"));
    // Phase 20I.4 follow-up: commissionRate is now a typed
    // buyer-facing field. Only the raw STRING form must NOT leak.
    assert.ok(!/"commissionRate"\s*:\s*"0\.07"/.test(serialised));
  }
});

test("Phase 20I.4: normalizeProductOfferV2Raw maps the documented sample", () => {
  const result = normalizeProductOfferV2Raw({
    productName: "Giay ve sinh treo tuong TopGia",
    productLink: "https://shopee.vn/product/1016604648/23552060269",
    productCatIds: [100636, 100716, 101212],
    commissionRate: 0.125,
    price: "69000",
    priceMin: "69000",
    priceMax: "428000",
    imageUrl: "https://cf.shopee.vn/topgia.jpg",
    offerLink: "https://s.shopee.vn/PROD",
    shopId: 1016604648,
    shopName: "TopGia HCM Store",
    ratingStar: "4.9",
    periodStartTime: 1782838800,
    periodEndTime: 1785517199,
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.title, "Giay ve sinh treo tuong TopGia");
    assert.strictEqual(result.value.destinationUrl, "https://s.shopee.vn/PROD");
    const serialised = JSON.stringify(result.value);
    assert.ok(!serialised.includes("shopId"));
    // Phase 20I.4 follow-up: the raw `price` / `priceMin` /
    // `priceMax` keys are mapped into `priceText` only. They must
    // NOT survive verbatim, and the buyer-facing `priceText` field
    // may legitimately appear.
    assert.ok(!/"price"\s*:/.test(serialised));
    assert.ok(!/"priceMin"\s*:/.test(serialised));
    assert.ok(!/"priceMax"\s*:/.test(serialised));
    assert.ok(!serialised.includes("ratingStar"));
    assert.ok(
      typeof result.value.cashbackHint === "string" &&
        !/chac-chan|dam-bao|cam-ket/.test(result.value.cashbackHint),
    );
  }
});

test("Phase 20I.4: normalizeProductOfferV2Raw accepts ratingStar as a number too", () => {
  const result = normalizeProductOfferV2Raw({
    productName: "Sample",
    offerLink: "https://shopee.vn/x",
    ratingStar: 4.5,
  });
  assert.strictEqual(result.ok, true);
});

test("Phase 20I.4: normalizeProductOfferV2Raw does not crash on missing optional fields", () => {
  const result = normalizeProductOfferV2Raw({
    productName: "Sample",
    offerLink: "https://shopee.vn/x",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.cashbackHint, undefined);
  }
});

test("Phase 20I.4 follow-up: productOfferV2 maps shopName / rating / productCatIds / commissionRate", () => {
  const result = normalizeProductOfferV2Raw({
    productName: "Sample",
    offerLink: "https://s.shopee.vn/PROD",
    productLink: "https://shopee.vn/product/123",
    productCatIds: [100636, 100716],
    commissionRate: 0.125,
    shopName: "TopGia HCM Store",
    ratingStar: "4.9",
    price: "69000",
    priceMin: "69000",
    priceMax: "428000",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.shopName, "TopGia HCM Store");
    assert.strictEqual(result.value.rating, "4.9");
    assert.deepStrictEqual(result.value.productCatIds, [100636, 100716]);
    assert.strictEqual(result.value.commissionRate, 0.125);
  }
});

test("Phase 20I.4 follow-up: productOfferV2 keeps offerLink and productLink as separate concepts", () => {
  const result = normalizeProductOfferV2Raw({
    productName: "Sample",
    offerLink: "https://s.shopee.vn/PROD",
    productLink: "https://shopee.vn/product/123",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.offerLink, "https://s.shopee.vn/PROD");
    assert.strictEqual(result.value.productLink, "https://shopee.vn/product/123");
    assert.strictEqual(result.value.destinationUrl, "https://s.shopee.vn/PROD");
  }
});

test("Phase 20I.4 follow-up: productOfferV2 falls back to productLink when offerLink missing", () => {
  const result = normalizeProductOfferV2Raw({
    productName: "Sample",
    productLink: "https://shopee.vn/product/123",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.offerLink, undefined);
    assert.strictEqual(result.value.productLink, "https://shopee.vn/product/123");
    assert.strictEqual(result.value.destinationUrl, "https://shopee.vn/product/123");
  }
});

test("Phase 20I.4 follow-up: productOfferV2 tolerates malformed rating / commission / productCatIds", () => {
  const result = normalizeProductOfferV2Raw({
    productName: "Sample",
    offerLink: "https://s.shopee.vn/PROD",
    ratingStar: "not-a-number",
    commissionRate: "boom",
    productCatIds: [-1, 0, "x", 1.5, 99999999] as never,
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.rating, undefined);
    assert.strictEqual(result.value.commissionRate, undefined);
    assert.strictEqual(result.value.productCatIds, undefined);
  }
});

test("Phase 20I.4 follow-up: productOfferV2 filters productCatIds to positive integers", () => {
  const result = normalizeProductOfferV2Raw({
    productName: "Sample",
    offerLink: "https://s.shopee.vn/PROD",
    productCatIds: [100, -1, 0, 1.5, 200, "x" as never],
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.deepStrictEqual(result.value.productCatIds, [100, 200]);
  }
});

test("Phase 20I.4 follow-up: productOfferV2 forwards price as priceText", () => {
  const result = normalizeProductOfferV2Raw({
    productName: "Sample",
    offerLink: "https://s.shopee.vn/PROD",
    price: "69000",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.priceText, "69000");
  }
});

test("Phase 20I.4 follow-up: productOfferV2 derives priceText from priceMin / priceMax when price absent", () => {
  const result = normalizeProductOfferV2Raw({
    productName: "Sample",
    offerLink: "https://s.shopee.vn/PROD",
    priceMin: "69000",
    priceMax: "428000",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.priceText, "69000-428000");
  }
});
