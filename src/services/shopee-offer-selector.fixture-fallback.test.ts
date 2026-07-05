import test from "node:test";
import assert from "node:assert/strict";

import type {
  ShopeeCatalogRepository,
  ShopeeCatalogRepositoryOffer,
  ShopeeOfferSelectorFixtureLookup,
} from "./shopee-offer-selector";
import { createShopeeOfferSelector } from "./shopee-offer-selector.factory";
import type { ShopeeProductMetadata } from "@/lib/shopee/product-metadata/types";
import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import type { ShopeeOfferSelectorInput } from "./shopee-offer-selector";

const PRODUCT_SHOP_ID = "1408027998";
const PRODUCT_ITEM_ID = "44812498433";
const CANONICAL_URL = `https://shopee.vn/product/${PRODUCT_SHOP_ID}/${PRODUCT_ITEM_ID}`;

const VALID_IDENTITY: ShopeeProductIdentity = {
  shopId: PRODUCT_SHOP_ID,
  itemId: PRODUCT_ITEM_ID,
  canonicalUrl: CANONICAL_URL,
};

const VALID_METADATA: ShopeeProductMetadata = {
  shopId: PRODUCT_SHOP_ID,
  itemId: PRODUCT_ITEM_ID,
  canonicalUrl: CANONICAL_URL,
  title: "San pham fixture",
  imageUrl: "https://cf.shopee.vn/file/fixture",
  shopName: "Fixture Shop",
  availability: "available",
  price: { amount: 96_900, currency: "VND" },
};

function makeRepo(
  offers: ReadonlyArray<ShopeeCatalogRepositoryOffer>,
): ShopeeCatalogRepository {
  return {
    async listActiveShopeeOffers() {
      return offers;
    },
  };
}

function policyOffer(
  overrides: Partial<ShopeeCatalogRepositoryOffer> = {},
): ShopeeCatalogRepositoryOffer {
  return {
    offerId: "off-shopee-q",
    campaignId: "cmp-shopee-q",
    commissionRateBps: null,
    cashbackShareBps: 6000,
    hasPolicy: true,
    shopId: null,
    categoryId: null,
    itemId: null,
    isPlatformWide: false,
    ...overrides,
  };
}

function fixtureLookup(
  impl: ShopeeOfferSelectorFixtureLookup,
): ShopeeOfferSelectorFixtureLookup {
  return impl;
}

const INPUT: ShopeeOfferSelectorInput = {
  identity: VALID_IDENTITY,
  product: VALID_METADATA,
};

function withIdentity(
  override: Partial<ShopeeProductIdentity>,
): ShopeeOfferSelectorInput {
  // The selector reads `input.product.shopId` / `input.product.itemId`,
  // not the identity's, so the override must propagate to both halves
  // of the input to faithfully exercise the empty-string fallback.
  const identity = { ...VALID_IDENTITY, ...override };
  const product: ShopeeProductMetadata = {
    ...VALID_METADATA,
    shopId: identity.shopId,
    itemId: identity.itemId,
    canonicalUrl: identity.canonicalUrl,
  };
  return { identity, product };
}

test("Phase 20H.3d fixture fallback returns eligible for the canonical fixture product when catalog carries exactly one policy-bearing offer", async () => {
  const calls: Array<{ shopId: string; itemId: string }> = [];
  const selector = createShopeeOfferSelector(makeRepo([policyOffer()]), {
    lookupFixtureCommissionRateBps: (params) => {
      calls.push(params);
      if (
        params.shopId === PRODUCT_SHOP_ID &&
        params.itemId === PRODUCT_ITEM_ID
      ) {
        return 2000;
      }
      return null;
    },
  });

  const outcome = await selector.selectOffer(INPUT);

  assert.deepEqual(calls, [{ shopId: PRODUCT_SHOP_ID, itemId: PRODUCT_ITEM_ID }]);
  assert.equal(outcome.kind, "eligible");
  if (outcome.kind !== "eligible") throw new Error("unreachable");
  assert.equal(outcome.offer.offerId, "off-shopee-q");
  assert.equal(outcome.offer.campaignId, "cmp-shopee-q");
  assert.equal(outcome.offer.commissionRateBps, 2000);
  assert.equal(outcome.offer.cashbackShareBps, 6000);
});

test("Phase 20H.3d fixture fallback preserves the persisted cashbackShareBps from the policy-bearing offer and never fabricates it", async () => {
  const selector = createShopeeOfferSelector(
    makeRepo([policyOffer({ cashbackShareBps: 7500 })]),
    { lookupFixtureCommissionRateBps: fixtureLookup(() => 2500) },
  );

  const outcome = await selector.selectOffer(INPUT);

  assert.equal(outcome.kind, "eligible");
  if (outcome.kind !== "eligible") throw new Error("unreachable");
  assert.equal(outcome.offer.cashbackShareBps, 7500);
  assert.equal(outcome.offer.commissionRateBps, 2500);
});

test("Phase 20H.3d fixture fallback returns eligibility_unknown when the catalog has no policy-bearing offer", async () => {
  const selector = createShopeeOfferSelector(
    makeRepo([policyOffer({ hasPolicy: false, cashbackShareBps: 0 })]),
    { lookupFixtureCommissionRateBps: fixtureLookup(() => 2000) },
  );

  const outcome = await selector.selectOffer(INPUT);

  assert.equal(outcome.kind, "eligibility_unknown");
});

test("Phase 20H.3d fixture fallback refuses to run when the catalog has multiple policy-bearing offers", async () => {
  let lookupCalls = 0;
  const selector = createShopeeOfferSelector(
    makeRepo([
      policyOffer(),
      policyOffer({
        offerId: "off-shopee-q2",
        campaignId: "cmp-shopee-q2",
      }),
    ]),
    {
      lookupFixtureCommissionRateBps: fixtureLookup(() => {
        lookupCalls++;
        return 2000;
      }),
    },
  );

  const outcome = await selector.selectOffer(INPUT);

  assert.equal(lookupCalls, 0);
  assert.equal(outcome.kind, "eligibility_unknown");
});

test("Phase 20H.3d fixture fallback returns eligibility_unknown when the resolved identity has no shopId or itemId", async () => {
  let lookupCalls = 0;
  const selector = createShopeeOfferSelector(makeRepo([policyOffer()]), {
    lookupFixtureCommissionRateBps: fixtureLookup(() => {
      lookupCalls++;
      return 2000;
    }),
  });

  const outcome = await selector.selectOffer(
    withIdentity({ shopId: "", itemId: "" }),
  );

  assert.equal(lookupCalls, 0);
  assert.equal(outcome.kind, "eligibility_unknown");
});

test("Phase 20H.3d fixture fallback returns eligibility_unknown when the lookup yields null", async () => {
  const selector = createShopeeOfferSelector(makeRepo([policyOffer()]), {
    lookupFixtureCommissionRateBps: fixtureLookup(() => null),
  });

  const outcome = await selector.selectOffer(INPUT);

  assert.equal(outcome.kind, "eligibility_unknown");
});

test("Phase 20H.3d fixture fallback rejects out-of-range or non-integer bps from the lookup", async () => {
  for (const bad of [
    -1,
    10_001,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    const selector = createShopeeOfferSelector(makeRepo([policyOffer()]), {
      lookupFixtureCommissionRateBps: fixtureLookup(() => bad),
    });

    const outcome = await selector.selectOffer(INPUT);

    assert.equal(outcome.kind, "eligibility_unknown", `bps=${bad}`);
  }
});

test("Phase 20H.3d fixture fallback never overrides an existing shopId/itemId match", async () => {
  let lookupCalls = 0;
  const selector = createShopeeOfferSelector(
    makeRepo([
      policyOffer({
        offerId: "off-matched",
        campaignId: "cmp-matched",
        shopId: PRODUCT_SHOP_ID,
        commissionRateBps: 1500,
        cashbackShareBps: 6000,
      }),
    ]),
    {
      lookupFixtureCommissionRateBps: fixtureLookup(() => {
        lookupCalls++;
        return 2000;
      }),
    },
  );

  const outcome = await selector.selectOffer(INPUT);

  assert.equal(lookupCalls, 0);
  assert.equal(outcome.kind, "eligible");
  if (outcome.kind !== "eligible") throw new Error("unreachable");
  assert.equal(outcome.offer.commissionRateBps, 1500);
});

test("Phase 20H.3d selector without a lookup still returns eligibility_unknown for production-shaped rows", async () => {
  const selector = createShopeeOfferSelector(makeRepo([policyOffer()]));

  const outcome = await selector.selectOffer(INPUT);

  assert.equal(outcome.kind, "eligibility_unknown");
});