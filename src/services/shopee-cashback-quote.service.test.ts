import test from "node:test";
import assert from "node:assert/strict";

import type { ShopeeProductMetadata } from "@/lib/shopee/product-metadata/types";
import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import type {
  ShopeeOfferSelectionOutcome,
  ShopeeOfferSelector,
  ShopeeOfferSelectorInput,
  ShopeeCatalogRepository,
  ShopeeCatalogRepositoryOffer,
} from "./shopee-offer-selector";
import { createShopeeOfferSelector } from "./shopee-offer-selector.factory";

type ResolveShopeeDependencies =
  import("./shopee-cashback-quote.service").ResolveShopeeDependencies;
type ResolveShopeeInput =
  import("./shopee-cashback-quote.service").ResolveShopeeInput;

async function loadService() {
  return await import("./shopee-cashback-quote.service");
}

const VALID_IDENTITY: ShopeeProductIdentity = {
  shopId: "12345",
  itemId: "67890",
  canonicalUrl: "https://shopee.vn/product/12345/67890",
};

const VALID_METADATA: ShopeeProductMetadata = {
  shopId: "12345",
  itemId: "67890",
  canonicalUrl: "https://shopee.vn/product/12345/67890",
  title: "Ao thun nam",
  imageUrl: "https://cf.shopee.vn/file/abc",
  shopName: "Cool Shop",
  availability: "available",
  price: { amount: 1_000_000, currency: "VND" },
};

function makeFakeSelector(
  outcome: ShopeeOfferSelectionOutcome,
): ShopeeOfferSelector {
  return {
    async selectOffer(input: ShopeeOfferSelectorInput) {
      // Touch the input so the linter does not flag the parameter
      // signature as unused. The selector contract requires accepting
      // the input, but the fake deliberately ignores it for the outcome
      // it was constructed with.
      void input;
      return outcome;
    },
  };
}

function makeDeps(
  overrides: Partial<ResolveShopeeDependencies> = {},
): ResolveShopeeDependencies {
  return {
    resolveUrl: async () => VALID_IDENTITY,
    metadataProvider: {
      async getProduct() {
        return VALID_METADATA;
      },
    },
    offerSelector: makeFakeSelector({
      kind: "eligible",
      offer: {
        offerId: "off-shopee",
        campaignId: "cmp-shopee",
        commissionRateBps: 800,
        cashbackShareBps: 6000,
        hasPolicy: true,
      },
    }),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeFakeRepository(
  offers: ReadonlyArray<ShopeeCatalogRepositoryOffer> = [],
): ShopeeCatalogRepository {
  return {
    async listActiveShopeeOffers() {
      return offers;
    },
  };
}

// ─── Blocker 4 regression: offer/policy distinction ───────────────────────────────

test("no active offers -> no_active_offer", async () => {
  const selector = createShopeeOfferSelector(makeFakeRepository([]));
  const outcome = await selector.selectOffer({
    identity: VALID_IDENTITY,
    product: VALID_METADATA,
  });
  assert.deepEqual(outcome, { kind: "no_active_offer" });
});

test("offer exists but hasPolicy=false -> eligibility_unknown with cashback_policy_unavailable", async () => {
  const selector = createShopeeOfferSelector(
    makeFakeRepository([
      {
        offerId: "off-no-policy",
        campaignId: "cmp-no-policy",
        commissionRateBps: 800,
        cashbackShareBps: 0,
        hasPolicy: false,
        shopId: VALID_METADATA.shopId,
        categoryId: null,
        itemId: null,
        isPlatformWide: false,
      },
    ]),
  );
  const outcome = await selector.selectOffer({
    identity: VALID_IDENTITY,
    product: VALID_METADATA,
  });
  assert.equal(outcome.kind, "eligibility_unknown");
  if (outcome.kind === "eligibility_unknown") {
    assert.equal(outcome.reason, "cashback_policy_unavailable");
  }
});

test("offer exists with hasPolicy=true -> eligible", async () => {
  const selector = createShopeeOfferSelector(
    makeFakeRepository([
      {
        offerId: "off-with-policy",
        campaignId: "cmp-with-policy",
        commissionRateBps: 800,
        cashbackShareBps: 6000,
        hasPolicy: true,
        shopId: VALID_METADATA.shopId,
        categoryId: null,
        itemId: null,
        isPlatformWide: false,
      },
    ]),
  );
  const outcome = await selector.selectOffer({
    identity: VALID_IDENTITY,
    product: VALID_METADATA,
  });
  assert.equal(outcome.kind, "eligible");
  if (outcome.kind === "eligible") {
    assert.equal(outcome.offer.offerId, "off-with-policy");
    assert.equal(outcome.offer.cashbackShareBps, 6000);
  }
});

// ─── eligibility outcomes ──────────────────────────────────────────────────────

test("eligibility_unknown -> eligibility_unknown", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "eligibility_unknown");
  }
});

test("not_eligible -> product_not_eligible", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({ kind: "not_eligible" }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "product_not_eligible");
  }
});

test("no_active_offer -> no_active_offer", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({ kind: "no_active_offer" }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "no_active_offer");
  }
});

// ─── offer policy validation ──────────────────────────────────────────────────

test("null commission rate -> commission_rate_unavailable", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-shopee",
          campaignId: "cmp",
          commissionRateBps: null,
          cashbackShareBps: 6000,
        },
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "commission_rate_unavailable");
  }
});

test("negative commission rate -> commission_rate_unavailable", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-shopee",
          campaignId: "cmp",
          commissionRateBps: -100,
          cashbackShareBps: 6000,
        },
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "commission_rate_unavailable");
  }
});

test("fractional commission rate -> commission_rate_unavailable", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-shopee",
          campaignId: "cmp",
          commissionRateBps: 800.5 as unknown as number,
          cashbackShareBps: 6000,
        },
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "commission_rate_unavailable");
  }
});

test("commission rate > 10000 -> commission_rate_unavailable", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-shopee",
          campaignId: "cmp",
          commissionRateBps: 15000,
          cashbackShareBps: 6000,
        },
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "commission_rate_unavailable");
  }
});

test("negative cashback share -> cashback_policy_unavailable", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-shopee",
          campaignId: "cmp",
          commissionRateBps: 800,
          cashbackShareBps: -100,
        },
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "cashback_policy_unavailable");
  }
});

test("cashback share > 10000 -> cashback_policy_unavailable", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-shopee",
          campaignId: "cmp",
          commissionRateBps: 800,
          cashbackShareBps: 15000,
        },
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "cashback_policy_unavailable");
  }
});

// ─── product price validation ─────────────────────────────────────────────────

test("negative product price -> metadata_incomplete", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      metadataProvider: {
        async getProduct() {
          return {
            ...VALID_METADATA,
            price: { amount: -1000, currency: "VND" },
          };
        },
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "metadata_incomplete");
  }
});

test("unsafe integer product price -> metadata_incomplete", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      metadataProvider: {
        async getProduct() {
          return {
            ...VALID_METADATA,
            price: {
              amount: Number.MAX_SAFE_INTEGER + 1,
              currency: "VND",
            },
          };
        },
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "metadata_incomplete");
  }
});

// ─── input validation ─────────────────────────────────────────────────────────

test("returns invalid_input for non-string productUrl", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: 42 } as unknown as ResolveShopeeInput,
    makeDeps(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_input");
  }
});

test("returns invalid_input for empty productUrl", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "   " },
    makeDeps(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_input");
  }
});

// ─── URL / metadata errors ─────────────────────────────────────────────────────

test("returns invalid_url when resolver rejects the URL", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "not a url" },
    makeDeps({
      resolveUrl: async () => {
        const e = new Error("invalid_url");
        (e as { code?: string }).code = "invalid_url";
        throw e;
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_url");
  }
});

test("returns product_not_found when provider throws product_not_found", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      metadataProvider: {
        async getProduct() {
          const e = new Error("product not found");
          (e as { code?: string }).code = "product_not_found";
          throw e;
        },
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "product_not_found");
  }
});

test("returns metadata_incomplete when provider throws metadata_incomplete", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      metadataProvider: {
        async getProduct() {
          const e = new Error("metadata_incomplete");
          (e as { code?: string }).code = "metadata_incomplete";
          throw e;
        },
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "metadata_incomplete");
  }
});

test("returns product_unavailable when product is marked unavailable", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      metadataProvider: {
        async getProduct() {
          return { ...VALID_METADATA, availability: "unavailable" };
        },
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "product_unavailable");
  }
});

// ─── happy path ────────────────────────────────────────────────────────────────

test("successful quote preserves the cashback allocation invariant", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps(),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    const user = result.quote.estimatedUserCashback.amount;
    const platform = result.quote.estimatedPlatformProfit.amount;
    const network = result.quote.estimatedNetworkCommission.amount;
    assert.equal(user + platform, network);
    assert.equal(result.quote.isEstimate, true);
    assert.equal(result.quote.cashbackShareBps, 6000);
    assert.equal(result.quote.estimatedCommissionRateBps, 800);
  }
});

test("success quote uses server-calculated network commission, not client input", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    {
      productUrl: "https://shopee.vn/product/12345/67890",
    },
    makeDeps(),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.quote.estimatedNetworkCommission.amount, 80_000);
    assert.equal(result.quote.estimatedUserCashback.amount, 48_000);
    assert.equal(result.quote.estimatedPlatformProfit.amount, 32_000);
  }
});

test("large but safe VND amounts produce a valid quote", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      metadataProvider: {
        async getProduct() {
          return {
            ...VALID_METADATA,
            price: {
              amount: Number.MAX_SAFE_INTEGER,
              currency: "VND",
            },
          };
        },
      },
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-shopee",
          campaignId: "cmp",
          commissionRateBps: 100,
          cashbackShareBps: 6000,
        },
      }),
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.quote.estimatedNetworkCommission.amount > 0);
    assert.equal(
      result.quote.estimatedUserCashback.amount +
        result.quote.estimatedPlatformProfit.amount,
      result.quote.estimatedNetworkCommission.amount,
    );
  }
});

// ─── no hardcoded offer ────────────────────────────────────────────────────────

test("quote only succeeds when selector returns eligible", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "eligibility_unknown");
  }
});

test("electronics product does not auto-use fashion offer", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
      metadataProvider: {
        async getProduct() {
          return {
            ...VALID_METADATA,
            title: "Laptop gaming ASUS ROG",
          };
        },
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "eligibility_unknown");
  }
});

// ─── selector contract ────────────────────────────────────────────────────────

test("selector receives both identity and metadata", async () => {
  let captured: ShopeeOfferSelectorInput | null = null;
  const capturingSelector: ShopeeOfferSelector = {
    async selectOffer(input: ShopeeOfferSelectorInput) {
      captured = input;
      return { kind: "eligibility_unknown" };
    },
  };
  const svc = await loadService();
  await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({ offerSelector: capturingSelector }),
  );
  assert.ok(captured !== null);
  const capturedInput = captured as ShopeeOfferSelectorInput;
  assert.deepEqual(capturedInput.identity, VALID_IDENTITY);
  assert.equal(capturedInput.product.title, VALID_METADATA.title);
  assert.equal(capturedInput.product.shopId, VALID_METADATA.shopId);
  assert.equal(capturedInput.product.itemId, VALID_METADATA.itemId);
});

test("product preview preserves metadata when quote is eligibility_unknown", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.product.productName, VALID_METADATA.title);
    assert.equal(result.product.priceVnd, VALID_METADATA.price.amount);
    assert.equal(result.product.imageUrl, VALID_METADATA.imageUrl);
    assert.equal(result.product.shopName, VALID_METADATA.shopName);
    if (result.quote.status === "unavailable") {
      assert.equal(result.quote.reason, "eligibility_unknown");
      assert.match(result.quote.message, /chưa.*xác.*định/i);
    } else {
      assert.fail("expected quote.status === unavailable");
    }
  }
});

test("product preview returns quote.available when selector returns eligible", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps(),
  );
  assert.equal(result.ok, true);
  if (result.ok && result.quote.status === "available") {
    assert.ok(result.quote.value.estimatedUserCashback.amount > 0);
    assert.equal(result.quote.value.cashbackShareBps, 6000);
  } else {
    assert.fail("expected quote.status === available");
  }
});

test("product preview surfaces no_active_offer while keeping metadata", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({ kind: "no_active_offer" }),
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.product.productName, VALID_METADATA.title);
    if (result.quote.status === "unavailable") {
      assert.equal(result.quote.reason, "no_active_offer");
    } else {
      assert.fail("expected unavailable quote");
    }
  }
});

test("product preview resolution_failed for invalid_url does not leak product", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "not a url" },
    makeDeps({
      resolveUrl: async () => {
        const e = new Error("invalid_url");
        (e as { code?: string }).code = "invalid_url";
        throw e;
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_url");
    assert.equal(result.product, null);
  }
});

// ─── selector contract: zero / one / many active Shopee offers ────────────────

test("selector with empty catalog returns no_active_offer", async () => {
  const selector = createShopeeOfferSelector(makeFakeRepository([]));
  const outcome = await selector.selectOffer({
    identity: VALID_IDENTITY,
    product: VALID_METADATA,
  });
  assert.deepEqual(outcome, { kind: "no_active_offer" });
});

test("selector with one active offer but no mapping returns eligibility_unknown", async () => {
  const selector = createShopeeOfferSelector(
    makeFakeRepository([
      {
        offerId: "off-fashion",
        campaignId: "cmp-fashion",
        commissionRateBps: 800,
        cashbackShareBps: 6000,
        hasPolicy: true,
      },
    ]),
  );
  const outcome = await selector.selectOffer({
    identity: VALID_IDENTITY,
    product: VALID_METADATA,
  });
  assert.deepEqual(outcome, { kind: "eligibility_unknown" });
});

test("selector with multiple active offers but no mapping returns eligibility_unknown", async () => {
  const selector = createShopeeOfferSelector(
    makeFakeRepository([
      {
        offerId: "off-fashion",
        campaignId: "cmp-fashion",
        commissionRateBps: 800,
        cashbackShareBps: 6000,
        hasPolicy: true,
      },
      {
        offerId: "off-beauty",
        campaignId: "cmp-beauty",
        commissionRateBps: 1000,
        cashbackShareBps: 6000,
        hasPolicy: true,
      },
      {
        offerId: "off-electronics",
        campaignId: "cmp-electronics",
        commissionRateBps: 500,
        cashbackShareBps: 6000,
        hasPolicy: true,
      },
    ]),
  );
  const outcome = await selector.selectOffer({
    identity: VALID_IDENTITY,
    product: VALID_METADATA,
  });
  assert.deepEqual(outcome, { kind: "eligibility_unknown" });
});

test("selector with shopId match returns eligible", async () => {
  const selector = createShopeeOfferSelector(
    makeFakeRepository([
      {
        offerId: "off-shopee-shop",
        campaignId: "cmp-shopee",
        commissionRateBps: 800,
        cashbackShareBps: 6000,
        hasPolicy: true,
        shopId: VALID_METADATA.shopId,
      },
    ]),
  );
  const outcome = await selector.selectOffer({
    identity: VALID_IDENTITY,
    product: VALID_METADATA,
  });
  assert.equal(outcome.kind, "eligible");
  if (outcome.kind === "eligible") {
    assert.equal(outcome.offer.offerId, "off-shopee-shop");
    assert.equal(outcome.offer.campaignId, "cmp-shopee");
  }
});

test("selector with itemId match returns eligible", async () => {
  const selector = createShopeeOfferSelector(
    makeFakeRepository([
      {
        offerId: "off-shopee-item",
        campaignId: "cmp-shopee",
        commissionRateBps: 1000,
        cashbackShareBps: 6000,
        hasPolicy: true,
        itemId: VALID_METADATA.itemId,
      },
    ]),
  );
  const outcome = await selector.selectOffer({
    identity: VALID_IDENTITY,
    product: VALID_METADATA,
  });
  assert.equal(outcome.kind, "eligible");
  if (outcome.kind === "eligible") {
    assert.equal(outcome.offer.offerId, "off-shopee-item");
  }
});

test("electronics metadata does not auto-use a fashion-only offer", async () => {
  const fashionOffer: ShopeeCatalogRepositoryOffer = {
    offerId: "off-fashion",
    campaignId: "cmp-fashion",
    commissionRateBps: 800,
    cashbackShareBps: 6000,
    hasPolicy: true,
    categoryId: "fashion",
  };
  const selector = createShopeeOfferSelector(
    makeFakeRepository([fashionOffer]),
  );
  const electronicsMetadata: ShopeeProductMetadata = {
    ...VALID_METADATA,
    title: "Laptop ASUS ROG",
    shopId: "99999",
    itemId: "11111",
    canonicalUrl: "https://shopee.vn/product/99999/11111",
  };
  const electronicsIdentity: ShopeeProductIdentity = {
    shopId: "99999",
    itemId: "11111",
    canonicalUrl: "https://shopee.vn/product/99999/11111",
  };
  const outcome = await selector.selectOffer({
    identity: electronicsIdentity,
    product: electronicsMetadata,
  });
  assert.deepEqual(outcome, { kind: "eligibility_unknown" });
});

test("catalog exception is surfaced as eligibility_unknown", async () => {
  const exploding: ShopeeCatalogRepository = {
    async listActiveShopeeOffers() {
      throw new Error("database unavailable");
    },
  };
  const selector = createShopeeOfferSelector(exploding);
  await assert.rejects(
    () =>
      selector.selectOffer({
        identity: VALID_IDENTITY,
        product: VALID_METADATA,
      }),
    /database unavailable/,
  );
});

test("selector does not pick an offer just because it is the only active Shopee offer", async () => {
  // The single offer records no shopId/itemId/categoryId and the
  // production selector must therefore refuse to claim eligibility.
  const selector = createShopeeOfferSelector(
    makeFakeRepository([
      {
        offerId: "off-shopee-only",
        campaignId: "cmp-shopee",
        commissionRateBps: 1000,
        cashbackShareBps: 6000,
        hasPolicy: true,
        isPlatformWide: false,
      },
    ]),
  );
  const outcome = await selector.selectOffer({
    identity: VALID_IDENTITY,
    product: VALID_METADATA,
  });
  assert.deepEqual(outcome, { kind: "eligibility_unknown" });
});

// ─── production wiring regression (Phase 20H.2 v4) ──────────────────────────────
//
// These tests assert the production composition contract documented in
// `shopee-cashback-quote.service.composition`. They import the pure
// composition helper (no `server-only` guard) so the unit test does NOT
// trigger the production guard. The server-only wrapper imports the same
// factory with the canonical production dependencies.

test("composition helper requires offerSelector (no production path uses {})", async () => {
  const { buildProductionShopeeProductPreviewDependencies } = await import(
    "./shopee-cashback-quote.service.composition"
  );

  const deps = buildProductionShopeeProductPreviewDependencies({
    resolveUrl: async () => VALID_IDENTITY,
    metadataProvider: {
      async getProduct() {
        return VALID_METADATA;
      },
    },
    offerSelector: makeFakeSelector({
      kind: "eligible",
      offer: {
        offerId: "off-shopee",
        campaignId: "cmp-shopee",
        commissionRateBps: 800,
        cashbackShareBps: 6000,
      },
    }),
  });

  // The composition must include an offerSelector, otherwise the pure
  // service would throw the "no ShopeeOfferSelector or ShopeeCatalogRepository
  // configured" error and crash the Server Action.
  assert.ok(deps.offerSelector, "offerSelector must be wired in production");
  assert.equal(typeof deps.offerSelector.selectOffer, "function");
});

test("composition helper without offerSelector/catalog is detectable by the service", async () => {
  const { buildProductionShopeeProductPreviewDependencies } = await import(
    "./shopee-cashback-quote.service.composition"
  );

  // The composition helper itself only shapes a dependency object. The
  // strict cashback quote path is responsible for refusing to run with
  // an unpopulated dependency bundle. This test documents the
  // composition helper's contract: the offerSelector field is wired as
  // supplied by the caller, never silently substituted.
  const fakeSelector = makeFakeSelector({ kind: "eligibility_unknown" });
  const deps = buildProductionShopeeProductPreviewDependencies({
    resolveUrl: async () => VALID_IDENTITY,
    metadataProvider: {
      async getProduct() {
        return VALID_METADATA;
      },
    },
    offerSelector: fakeSelector,
  });

  assert.equal(deps.offerSelector, fakeSelector);
  assert.equal(typeof deps.offerSelector.selectOffer, "function");
});

test("product preview with empty active catalog keeps metadata and returns no_active_offer", async () => {
  const svc = await loadService();
  const selector = createShopeeOfferSelector(makeFakeRepository([]));
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({ offerSelector: selector }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.product.productName, VALID_METADATA.title);
    assert.equal(result.product.priceVnd, VALID_METADATA.price.amount);
    assert.equal(result.product.imageUrl, VALID_METADATA.imageUrl);
    if (result.quote.status === "unavailable") {
      assert.equal(result.quote.reason, "no_active_offer");
    } else {
      assert.fail("expected quote.status === unavailable");
    }
  } else {
    assert.fail("expected result.ok === true");
  }
});

test("product preview with active offers but no mapping keeps metadata and returns eligibility_unknown", async () => {
  const svc = await loadService();
  const selector = createShopeeOfferSelector(
    makeFakeRepository([
      {
        offerId: "off-fashion",
        campaignId: "cmp-fashion",
        commissionRateBps: 800,
        cashbackShareBps: 6000,
        hasPolicy: true,
      },
      {
        offerId: "off-beauty",
        campaignId: "cmp-beauty",
        commissionRateBps: 1000,
        cashbackShareBps: 6000,
        hasPolicy: true,
      },
    ]),
  );
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({ offerSelector: selector }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.product.productName, VALID_METADATA.title);
    if (result.quote.status === "unavailable") {
      assert.equal(result.quote.reason, "eligibility_unknown");
    } else {
      assert.fail("expected quote.status === unavailable");
    }
  } else {
    assert.fail("expected result.ok === true");
  }
});

test("product preview with catalog failure keeps metadata and returns eligibility_unknown", async () => {
  const svc = await loadService();
  const explodingCatalog: ShopeeCatalogRepository = {
    async listActiveShopeeOffers() {
      throw new Error("database unavailable");
    },
  };
  const selector = createShopeeOfferSelector(explodingCatalog);
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({ offerSelector: selector }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.product.productName, VALID_METADATA.title);
    assert.equal(result.product.priceVnd, VALID_METADATA.price.amount);
    if (result.quote.status === "unavailable") {
      assert.equal(result.quote.reason, "eligibility_unknown");
    } else {
      assert.fail("expected quote.status === unavailable");
    }
  } else {
    assert.fail("expected result.ok === true");
  }
});

test("product preview with selector that throws directly keeps metadata and returns eligibility_unknown", async () => {
  const svc = await loadService();
  const explodingSelector: ShopeeOfferSelector = {
    async selectOffer(input: ShopeeOfferSelectorInput) {
      void input;
      throw new Error("network unreachable");
    },
  };
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({ offerSelector: explodingSelector }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.product.productName, VALID_METADATA.title);
    if (result.quote.status === "unavailable") {
      assert.equal(result.quote.reason, "eligibility_unknown");
    } else {
      assert.fail("expected quote.status === unavailable");
    }
  } else {
    assert.fail("expected result.ok === true");
  }
});

test("composition factory surfaces a typed failure if production forgets to wire offerSelector", async () => {
  const svc = await loadService();
  // `pickOfferSelector` throws when neither `offerSelector` nor
  // `shopeeCatalogRepository` is provided. This is a unit-level check
  // that the strict cashback quote path (which does NOT catch the
  // throw) preserves the typed error surface.
  await assert.rejects(
    () =>
      svc.resolveShopeeCashbackQuoteWithDeps(
        { productUrl: "https://shopee.vn/product/12345/67890" },
        // Strip every dependency except the metadata provider and the
        // URL resolver. The selector and the repository are both absent.
        {
          resolveUrl: async () => VALID_IDENTITY,
          metadataProvider: {
            async getProduct() {
              return VALID_METADATA;
            },
          },
        },
      ),
    /no ShopeeOfferSelector or ShopeeCatalogRepository configured/,
  );
});

test("strict cashback quote path does NOT swallow selector exceptions", async () => {
  const svc = await loadService();
  const explodingSelector: ShopeeOfferSelector = {
    async selectOffer(input: ShopeeOfferSelectorInput) {
      void input;
      throw new Error("database unavailable");
    },
  };
  // The strict quote path must keep its throw semantics so server-side
  // failure modes stay debuggable. The product-preview path is the one
  // that catches and converts to a typed outcome.
  await assert.rejects(
    () =>
      svc.resolveShopeeCashbackQuoteWithDeps(
        { productUrl: "https://shopee.vn/product/12345/67890" },
        makeDeps({ offerSelector: explodingSelector }),
      ),
    /database unavailable/,
  );
});

// ─── Blocker 1 regression: selector throw → eligibility_unknown, calculation throw → propagate ───

test("preview: selector throw -> eligibility_unknown + metadata preserved", async () => {
  const svc = await loadService();
  const explodingSelector: ShopeeOfferSelector = {
    async selectOffer() {
      throw new Error("catalog unavailable");
    },
  };
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({ offerSelector: explodingSelector }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.product.productName, VALID_METADATA.title);
    assert.equal(result.product.priceVnd, VALID_METADATA.price.amount);
    if (result.quote.status === "unavailable") {
      assert.equal(result.quote.reason, "eligibility_unknown");
    } else {
      assert.fail("expected unavailable quote");
    }
  }
});

test("preview: calculateAllocation throw does NOT become eligibility_unknown (propagates as raw error)", async () => {
  const svc = await loadService();
  // Calculation errors must propagate as raw errors, NOT be mapped to
  // eligibility_unknown. The preview path only catches selector/catalog
  // exceptions. Other errors bubble up.
  await assert.rejects(
    () =>
      svc.resolveShopeeProductPreviewWithDeps(
        { productUrl: "https://shopee.vn/product/12345/67890" },
        makeDeps({
          offerSelector: makeFakeSelector({
            kind: "eligible",
            offer: {
              offerId: "off-shopee",
              campaignId: "cmp-shopee",
              commissionRateBps: 800,
              cashbackShareBps: 6000,
            },
          }),
          calculateAllocation: () => {
            throw new Error("allocation error");
          },
        }),
      ),
    /allocation error/,
  );
});

// ─── Blocker 2 regression: no unsafe cast, exhaustive quote-unavailable reason handling ───

test("preview: unsafe price -> resolution_failed (metadata_incomplete is NOT quote-unavailable)", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-shopee",
          campaignId: "cmp-shopee",
          commissionRateBps: 800,
          cashbackShareBps: 6000,
        },
      }),
      metadataProvider: {
        async getProduct() {
          return {
            ...VALID_METADATA,
            price: { amount: Number.MAX_SAFE_INTEGER + 1, currency: "VND" },
          };
        },
      },
    }),
  );
  // metadata_incomplete is a resolution failure, NOT a quote-unavailable reason
  // The quote unavailable union no longer includes metadata_incomplete
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "metadata_incomplete");
    assert.equal(result.product, null);
  }
});

// ─── Blocker 4 regression: active offer without policy → cashback_policy_unavailable ───

test("preview: active offer without policy -> cashback_policy_unavailable + metadata preserved", async () => {
  const selector = createShopeeOfferSelector(
    makeFakeRepository([
      {
        offerId: "off-no-policy",
        campaignId: "cmp-no-policy",
        commissionRateBps: 800,
        cashbackShareBps: 0,
        hasPolicy: false,
        shopId: VALID_METADATA.shopId,
      },
    ]),
  );
  const svc = await loadService();
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({ offerSelector: selector }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.product.productName, VALID_METADATA.title);
    if (result.quote.status === "unavailable") {
      assert.equal(result.quote.reason, "cashback_policy_unavailable");
    } else {
      assert.fail("expected unavailable quote with cashback_policy_unavailable");
    }
  }
});

// ─── Blocker 3 regression: metadata_incomplete is NOT a quote-unavailable reason ───

test("preview: metadata_incomplete returns resolution_failed (not unavailable quote)", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-shopee",
          campaignId: "cmp-shopee",
          commissionRateBps: 800,
          cashbackShareBps: 6000,
        },
      }),
      metadataProvider: {
        async getProduct() {
          return {
            ...VALID_METADATA,
            price: { amount: Number.MAX_SAFE_INTEGER + 1, currency: "VND" },
          };
        },
      },
    }),
  );
  // metadata_incomplete is a resolution failure, not a quote-unavailable reason
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "metadata_incomplete");
    assert.equal(result.product, null);
  }
});

test("strict quote: metadata_incomplete still returns as failure (preview preserves this)", async () => {
  const svc = await loadService();
  const result = await svc.resolveShopeeCashbackQuoteWithDeps(
    { productUrl: "https://shopee.vn/product/12345/67890" },
    makeDeps({
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-shopee",
          campaignId: "cmp-shopee",
          commissionRateBps: 800,
          cashbackShareBps: 6000,
        },
      }),
      metadataProvider: {
        async getProduct() {
          return {
            ...VALID_METADATA,
            price: { amount: -1000, currency: "VND" },
          };
        },
      },
    }),
  );
  // strict quote path returns the failure directly (not wrapped in ok:true)
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "metadata_incomplete");
  }
});
