/**
 * Phase 20H.3d regression test -- drives the production-wired commission
 * fixture path end-to-end through the pure cashback quote service so the
 * canonical dev/test fixture product can produce an `available` quote
 * even though the canonical Shopee catalog rows do not carry
 * product-level evidence (shopId/itemId).
 *
 * This test replaces the missing integration gap that previously let the
 * `lookupDevelopmentShopeeCommissionRateBps` lookup be silently dead in
 * production. It composes:
 *
 *   - the composition helper `buildProductionShopeeProductPreviewDependencies`
 *     with a fake canonical repository shaped exactly like the real one
 *     (one policy-bearing Shopee offer with `shopId:null`, `itemId:null`);
 *   - the same identity-aware fixture lookup the production server-only
 *     module wires (`lookupDevelopmentShopeeCommissionRateBps` proxied
 *     via the lookup hook);
 *   - the pure service `resolveShopeeProductPreviewWithDeps`.
 *
 * The assertions cover the full quote math, not just the selector outcome.
 *
 * NOTE on the "real per-offer commissionRateBps is preserved" guarantee:
 * that invariant is exercised in `shopee-offer-selector.fixture-fallback.test.ts`
 * ("Phase 20H.3d fixture fallback never overrides an existing shopId/itemId
 * match"), which proves the selector itself short-circuits the fixture
 * before it can ever run when an identity-bearing catalog row matches the
 * resolved product. In the production-shape scenario (rows with null
 * shopId/itemId) there is no "persisted per-offer rate" to preserve, so
 * the production-wired quote necessarily flows through the fixture path.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import type { ShopeeProductMetadata } from "@/lib/shopee/product-metadata/types";
import { lookupDevelopmentShopeeCommissionRateBps } from "./shopee-commission-rate-fixture";
import { createShopeeOfferSelector } from "./shopee-offer-selector.factory";
import { buildProductionShopeeProductPreviewDependencies } from "./shopee-cashback-quote.service.composition";

type ServiceModule = typeof import("./shopee-cashback-quote.service");

async function loadService(): Promise<ServiceModule> {
  return await import("./shopee-cashback-quote.service");
}

const FIXTURE_SHOP_ID = "1408027998";
const FIXTURE_ITEM_ID = "44812498433";
const FIXTURE_URL = `https://shopee.vn/product/${FIXTURE_SHOP_ID}/${FIXTURE_ITEM_ID}`;

// Phase 20H.3d canonical values for the canonical fixture product
// (https://shopee.vn/product/1408027998/44812498433). These are the
// numbers downstream UI rendering MUST agree with; pinning them here
// makes the production-wired quote pipeline regression-proof.
//
//   product price          = 161,500 VND
//   commissionRateBps      = 2,000  (20%)
//   cashbackShareBps       = 6,000  (60%)
//   network commission     = price * commissionRateBps / 10,000
//                          = 32,300 VND
//   buyer cashback         = network commission * cashbackShareBps / 10,000
//                          = 19,380 VND
//   platform profit        = network commission - buyer cashback
//                          = 12,920 VND
//
// The UI card renders buyer cashback as "19.380 đ" (Vietnamese-dong
// decimal format). Regression coverage for that rendering lives in
// `src/features/cashback/ShopeeProductPreviewCard.available.test.tsx`.
const CANONICAL_PRICE_VND = 161_500;
const CANONICAL_COMMISSION_RATE_BPS = 2_000;
const CANONICAL_CASHBACK_SHARE_BPS = 6_000;
const CANONICAL_NETWORK_COMMISSION_VND = 32_300;
const CANONICAL_USER_CASHBACK_VND = 19_380;
const CANONICAL_PLATFORM_PROFIT_VND = 12_920;

function makeResolvedIdentity(): ShopeeProductIdentity {
  return {
    shopId: FIXTURE_SHOP_ID,
    itemId: FIXTURE_ITEM_ID,
    canonicalUrl: FIXTURE_URL,
  };
}

function makeResolvedProduct(priceVnd: number): ShopeeProductMetadata {
  return {
    shopId: FIXTURE_SHOP_ID,
    itemId: FIXTURE_ITEM_ID,
    canonicalUrl: FIXTURE_URL,
    title: "San pham fixture 20H.3d",
    imageUrl: "https://cf.shopee.vn/file/fixture",
    shopName: "Fixture Shop",
    availability: "available",
    price: { amount: priceVnd, currency: "VND" },
  };
}

/**
 * Builds a hand-rolled "canonical catalog repository" view that mirrors
 * the shape `toSelectorView` emits for the real
 * `ActiveShopeeOfferWithPolicyStatus` row:
 *
 *   - `shopId` / `itemId` / `categoryId` are null because the underlying
 *     catalog schema does not record per-product mapping;
 *   - `commissionRateBps` is null on the row because the canonical
 *     shopee catalog rows do not record it (per-row rate resolution
 *     happens at the selector layer via the identity-aware fixture
 *     fallback -- see `createShopeeOfferSelector`'s options);
 *   - `hasPolicy` is true when the cashback policy row carries a
 *     non-null share, and a single policy-bearing offer is the natural
 *     production state today.
 */
function makeProductionShapeRepo(cashbackShareBps: number) {
  return {
    listActiveShopeeOffers: async () => [
      {
        offerId: "off-shopee-q",
        campaignId: "cmp-shopee-q",
        commissionRateBps: null,
        cashbackShareBps,
        hasPolicy: true,
        shopId: null,
        categoryId: null,
        itemId: null,
        isPlatformWide: false,
      },
    ],
  };
}

async function loadCompositionFixtureDeps(
  priceVnd: number,
  cashbackShareBps: number,
) {
  return buildProductionShopeeProductPreviewDependencies({
    resolveUrl: async () => makeResolvedIdentity(),
    metadataProvider: {
      async getProduct() {
        return makeResolvedProduct(priceVnd);
      },
    },
    offerSelector: createShopeeOfferSelector(
      makeProductionShapeRepo(cashbackShareBps),
      { lookupFixtureCommissionRateBps: lookupDevelopmentShopeeCommissionRateBps },
    ),
    lookupFixtureCommissionRateBps: lookupDevelopmentShopeeCommissionRateBps,
    now: () => new Date("2026-07-06T00:00:00.000Z"),
  });
}

test(
  "Phase 20H.3d canonical: production-wired fixture path produces 19,380 buyer cashback for the canonical fixture product (price 161,500 VND, commission 20%, share 60%)",
  async () => {
    const svc = await loadService();

    const result = await svc.resolveShopeeProductPreviewWithDeps(
      { productUrl: FIXTURE_URL },
      await loadCompositionFixtureDeps(
        CANONICAL_PRICE_VND,
        CANONICAL_CASHBACK_SHARE_BPS,
      ),
    );

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.product.productUrl, FIXTURE_URL);
    assert.equal(result.product.priceVnd, CANONICAL_PRICE_VND);
    assert.equal(result.quote.status, "available");
    if (result.quote.status !== "available") throw new Error("unreachable");

    const quote = result.quote.value;

    assert.equal(quote.offerId, "off-shopee-q");
    assert.equal(quote.campaignId, "cmp-shopee-q");
    assert.equal(quote.product.price.amount, CANONICAL_PRICE_VND);
    assert.equal(quote.cashbackShareBps, CANONICAL_CASHBACK_SHARE_BPS);
    assert.equal(
      quote.estimatedCommissionRateBps,
      CANONICAL_COMMISSION_RATE_BPS,
    );
    assert.equal(quote.isEstimate, true);

    assert.equal(
      quote.estimatedOrderAmount.amount,
      CANONICAL_PRICE_VND,
      "estimatedOrderAmount must reflect the product price the quote was computed against",
    );
    assert.equal(
      quote.estimatedNetworkCommission.amount,
      CANONICAL_NETWORK_COMMISSION_VND,
      "network commission must equal price * commissionRateBps / 10000",
    );
    assert.equal(
      quote.estimatedUserCashback.amount,
      CANONICAL_USER_CASHBACK_VND,
      "user cashback must equal network commission * cashbackShareBps / 10000",
    );
    assert.equal(
      quote.estimatedPlatformProfit.amount,
      CANONICAL_PLATFORM_PROFIT_VND,
      "platform profit must be the remainder so user + platform = network",
    );

    assert.equal(
      quote.estimatedUserCashback.amount +
        quote.estimatedPlatformProfit.amount,
      quote.estimatedNetworkCommission.amount,
      "cashback allocation invariant must hold",
    );
  },
);

test(
  "Phase 20H.3d production-wired fixture path: unknown products still produce an unavailable quote",
  async () => {
    const svc = await loadService();
    const cashbackShareBps = CANONICAL_CASHBACK_SHARE_BPS;
    const fakeRepo = makeProductionShapeRepo(cashbackShareBps);

    const deps = buildProductionShopeeProductPreviewDependencies({
      resolveUrl: async () => ({
        shopId: "99999",
        itemId: "88888",
        canonicalUrl: "https://shopee.vn/product/99999/88888",
      }),
      metadataProvider: {
        async getProduct() {
          return {
            shopId: "99999",
            itemId: "88888",
            canonicalUrl: "https://shopee.vn/product/99999/88888",
            title: "Unknown product",
            imageUrl: "https://cf.shopee.vn/file/unknown",
            shopName: "Random Shop",
            availability: "available" as const,
            price: { amount: 50_000, currency: "VND" },
          };
        },
      },
      offerSelector: createShopeeOfferSelector(fakeRepo, {
        lookupFixtureCommissionRateBps: lookupDevelopmentShopeeCommissionRateBps,
      }),
      lookupFixtureCommissionRateBps: lookupDevelopmentShopeeCommissionRateBps,
      now: () => new Date("2026-07-06T00:00:00.000Z"),
    });

    const result = await svc.resolveShopeeProductPreviewWithDeps(
      { productUrl: "https://shopee.vn/product/99999/88888" },
      deps,
    );

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(
      result.product.productUrl,
      "https://shopee.vn/product/99999/88888",
    );
    assert.equal(result.quote.status, "unavailable");
    if (result.quote.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.quote.reason, "eligibility_unknown");
  },
);