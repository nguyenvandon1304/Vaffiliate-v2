/**
 * Phase 20I.4 -- GraphQL query builder tests.
 *
 * These verify:
 *   - the documented query strings are produced unchanged;
 *   - the variables payload matches the input;
 *   - validation rejects malformed inputs at the boundary so the
 *     downstream Shopee API is never called with garbage.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBrandOfferV2Query,
  buildProductOfferV2Query,
  buildShopeeOfferV2Query,
  SHOPEE_OFFER_SORT_TYPES,
  SHOPEE_PRODUCT_OFFER_SORT_TYPES,
} from "./shopee-offer-graphql.types";

test("Phase 20I.4: buildShopeeOfferV2Query produces the documented query", () => {
  const req = buildShopeeOfferV2Query({
    keyword: "fashion",
    sortType: 2,
    page: 1,
    limit: 20,
  });
  assert.ok(req.query.startsWith("query ShopeeOfferV2("));
  assert.ok(req.query.includes("shopeeOfferV2(keyword: $keyword"));
  assert.ok(req.query.includes("commissionRate"));
  assert.ok(req.query.includes("imageUrl"));
  assert.ok(req.query.includes("offerLink"));
  assert.ok(req.query.includes("originalLink"));
  assert.ok(req.query.includes("offerName"));
  assert.ok(req.query.includes("offerType"));
  assert.deepStrictEqual(req.variables, {
    keyword: "fashion",
    sortType: 2,
    page: 1,
    limit: 20,
  });
});

test("Phase 20I.4: buildBrandOfferV2Query produces the documented query", () => {
  const req = buildBrandOfferV2Query({
    keyword: "sony",
    sortType: 1,
    page: 3,
    limit: 50,
  });
  assert.ok(req.query.startsWith("query BrandOfferV2("));
  assert.ok(req.query.includes("brandOfferV2(keyword: $keyword"));
  assert.ok(req.query.includes("brandId"));
  assert.ok(req.query.includes("brandName"));
  assert.deepStrictEqual(req.variables, {
    keyword: "sony",
    sortType: 1,
    page: 3,
    limit: 50,
  });
});

test("Phase 20I.4: buildProductOfferV2Query carries categoryId when supplied", () => {
  const req = buildProductOfferV2Query({
    keyword: "tainghe",
    sortType: 3,
    categoryId: 100636,
    page: 1,
    limit: 25,
  });
  assert.ok(req.query.startsWith("query ProductOfferV2("));
  assert.ok(req.query.includes("productOfferV2(keyword: $keyword"));
  assert.ok(req.query.includes("productName"));
  assert.ok(req.query.includes("productLink"));
  assert.ok(req.query.includes("price"));
  assert.deepStrictEqual(req.variables, {
    keyword: "tainghe",
    sortType: 3,
    categoryId: 100636,
    page: 1,
    limit: 25,
  });
});

test("Phase 20I.4: buildProductOfferV2Query omits categoryId when undefined", () => {
  const req = buildProductOfferV2Query({
    keyword: "tainghe",
    sortType: 1,
    page: 1,
    limit: 10,
  });
  assert.deepStrictEqual(req.variables, {
    keyword: "tainghe",
    sortType: 1,
    categoryId: undefined,
    page: 1,
    limit: 10,
  });
});

test("Phase 20I.4: builders validate sortType values", () => {
  assert.throws(() =>
    buildShopeeOfferV2Query({
      keyword: "x",
      sortType: 99 as never,
      page: 1,
      limit: 10,
    }),
  );
  assert.throws(() =>
    buildProductOfferV2Query({
      keyword: "x",
      sortType: 4 as never,
      page: 1,
      limit: 10,
    }),
  );
  assert.deepStrictEqual([...SHOPEE_OFFER_SORT_TYPES], [1, 2]);
  assert.deepStrictEqual([...SHOPEE_PRODUCT_OFFER_SORT_TYPES], [1, 2, 3]);
});

test("Phase 20I.4: builders validate page and limit", () => {
  assert.throws(() =>
    buildShopeeOfferV2Query({
      keyword: "x",
      sortType: 1,
      page: 0,
      limit: 10,
    }),
  );
  assert.throws(() =>
    buildShopeeOfferV2Query({
      keyword: "x",
      sortType: 1,
      page: 1.5,
      limit: 10,
    }),
  );
  assert.throws(() =>
    buildBrandOfferV2Query({
      keyword: "x",
      sortType: 1,
      page: 1,
      limit: 0,
    }),
  );
  assert.throws(() =>
    buildBrandOfferV2Query({
      keyword: "x",
      sortType: 1,
      page: 1,
      limit: 9999,
    }),
  );
});

test("Phase 20I.4: builders reject GraphQL-injection-ish keyword strings", () => {
  for (const bad of [
    'a"b',
    "a\\b",
    "a\nb",
    "a{b}c",
    " ",
    "",
  ]) {
    assert.throws(() =>
      buildShopeeOfferV2Query({
        keyword: bad,
        sortType: 1,
        page: 1,
        limit: 10,
      }),
      `keyword ${JSON.stringify(bad)} must be rejected`,
    );
  }
});
