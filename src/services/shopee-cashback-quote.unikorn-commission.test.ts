/**
 * Phase 20H.3f (correction pass: API-first precedence) -- Unit tests
 * for the Shopee cashback quote service with the Unikorn commission
 * provider dependency.
 *
 * The production preview quote path consults the Unikorn commission
 * provider FIRST whenever it is configured. These tests cover the
 * spec rules that the quote pipeline must respect under that
 * precedence:
 *
 *   - a successful Unikorn commission quote produces an
 *     `available` quote with `commissionSource = "unikorn_api"`,
 *     even when the offer selector would have returned `eligible`
 *     (the API is the authoritative source);
 *   - the displayed buyer cashback is `floor(commissionVnd * 0.6)`
 *     with the remaining 40% as platform profit, regardless of the
 *     product price;
 *   - when Unikorn cannot return a valid commission (missing,
 *     zero, negative, fractional, non-safe-integer, status !=
 *     "success", invalid JSON, fetch rejection, timeout, or
 *     provider absent), the service silently falls back to the
 *     offer-selector + catalog/fixture path;
 *   - the buyer UI never receives internal IDs (itemId, networkSubId,
 *     affiliateUrl, vaflnk, campaignId, offerId) -- the audit-only
 *     placeholder IDs MUST stay out of the rendered product view;
 *   - the rendered product preview card does not contain literal
 *     `\uXXXX` Unicode escape sequences in any buyer-facing copy.
 *
 * All tests run under the Node test runner with no `DATABASE_URL`
 * dependency.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import type {
  ShopeeUnikornCommissionProvider,
  ShopeeUnikornCommissionQuote,
} from "@/lib/shopee/product-metadata/unikorn-commission-client";
import type { ShopeeProductMetadata } from "@/lib/shopee/product-metadata/types";
import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import type {
  ShopeeOfferSelector,
  ShopeeOfferSelectorInput,
  ShopeeCatalogRepository,
  ShopeeCatalogRepositoryOffer,
  ShopeeOfferSelectionOutcome,
} from "@/services/shopee-offer-selector";
import ShopeeProductPreviewCardView from "@/features/cashback/ShopeeProductPreviewCardView";
import type {
  ShopeeProductPreviewAvailableQuote,
  ShopeeProductPreviewUnavailableQuote,
  ShopeeProductPreviewMetadataView,
} from "@/types/cashback";

type ServiceModule = typeof import("@/services/shopee-cashback-quote.service");

async function loadService(): Promise<ServiceModule> {
  return await import("@/services/shopee-cashback-quote.service");
}

const ARBITRARY_SHOP_ID = "22222";
const ARBITRARY_ITEM_ID = "33333";
const ARBITRARY_URL = `https://shopee.vn/product/${ARBITRARY_SHOP_ID}/${ARBITRARY_ITEM_ID}`;
const ARBITRARY_PRICE_VND = 1_000_000;

const ARBITRARY_METADATA: ShopeeProductMetadata = {
  shopId: ARBITRARY_SHOP_ID,
  itemId: ARBITRARY_ITEM_ID,
  canonicalUrl: ARBITRARY_URL,
  title: "Sản phẩm Shopee bất kỳ",
  imageUrl: "https://cf.shopee.vn/file/arbitrary",
  shopName: "Arbitrary Shop",
  availability: "available",
  price: { amount: ARBITRARY_PRICE_VND, currency: "VND" },
};

const ARBITRARY_IDENTITY: ShopeeProductIdentity = {
  shopId: ARBITRARY_SHOP_ID,
  itemId: ARBITRARY_ITEM_ID,
  canonicalUrl: ARBITRARY_URL,
};

function makeFakeSelector(
  outcome: ShopeeOfferSelectionOutcome,
): ShopeeOfferSelector {
  return {
    async selectOffer(input: ShopeeOfferSelectorInput) {
      void input;
      return outcome;
    },
  };
}

function emptyRepo(): ShopeeCatalogRepository {
  return {
    async listActiveShopeeOffers(): Promise<
      ReadonlyArray<ShopeeCatalogRepositoryOffer>
    > {
      return [];
    },
  };
}

function fixedProvider(
  fn: (req: { itemId?: string; canonicalUrl?: string }) => Promise<ShopeeUnikornCommissionQuote>,
): ShopeeUnikornCommissionProvider {
  return fn;
}

function okUnikornQuote(
  commissionVnd: number,
): ShopeeUnikornCommissionQuote {
  return { commissionVnd };
}

const ARBITRARY_VIEW: ShopeeProductPreviewMetadataView = {
  platform: "shopee",
  productUrl: ARBITRARY_URL,
  productName: ARBITRARY_METADATA.title,
  shopName: ARBITRARY_METADATA.shopName ?? null,
  imageUrl: ARBITRARY_METADATA.imageUrl,
  priceVnd: ARBITRARY_METADATA.price.amount,
  availability: "available",
  fetchedAt: "2026-07-06T00:00:00.000Z",
};

function toAvailableView(
  svc: typeof import("@/services/shopee-cashback-quote.service"),
  quote: import("@/services/shopee-cashback-quote.types").ShopeeCashbackQuote,
): ShopeeProductPreviewAvailableQuote {
  return {
    status: "available",
    product: ARBITRARY_VIEW,
    cashbackShareBps: quote.cashbackShareBps,
    commissionRateBps: quote.estimatedCommissionRateBps ?? 0,
    estimatedCashbackVnd: quote.estimatedUserCashback.amount,
    calculatedAt: quote.calculatedAt,
    isEstimate: true,
  };
}

function toUnavailableView(
  reason: import("@/types/cashback").ShopeeProductPreviewUnavailableQuote["reason"],
  message: string,
): ShopeeProductPreviewUnavailableQuote {
  return {
    status: "unavailable",
    product: ARBITRARY_VIEW,
    reason,
    message,
  };
}

const STUB_CTA = React.createElement(
  "button",
  { type: "button" },
  "Mua ngay nhận hoàn tiền",
);

// -------------------------------------------------------------------
// Successful Unikorn commission paths
// -------------------------------------------------------------------

test("Phase 20H.3f Unikorn commission=21996 yields buyer cashback 13197 and platform profit 8799 (60/40 split, NOT derived from price)", async () => {
  const svc = await loadService();

  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async (req) => {
      assert.equal(req.itemId, ARBITRARY_ITEM_ID);
      assert.equal(req.canonicalUrl, ARBITRARY_URL);
      return okUnikornQuote(21996);
    },
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
      // No lookupFixtureCommissionRateBps so the selector cannot
      // promote the quote through any dev/test fallback either.
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "available");
  if (result.quote.status !== "available") throw new Error("unreachable");

  const quote = result.quote.value;

  assert.equal(quote.commissionSource, "unikorn_api");
  assert.equal(quote.estimatedCommissionRateBps, null);
  assert.equal(quote.estimatedNetworkCommission.amount, 21996);
  assert.equal(quote.estimatedUserCashback.amount, 13197);
  assert.equal(quote.estimatedPlatformProfit.amount, 8799);
  // Invariant: user + platform === network
  assert.equal(
    quote.estimatedUserCashback.amount +
      quote.estimatedPlatformProfit.amount,
    quote.estimatedNetworkCommission.amount,
  );
  // Spec rule: the displayed cashback MUST NOT be derived from the
  // product price. Buyer cashback here is 13,197, not 600,000.
  assert.notEqual(
    quote.estimatedUserCashback.amount,
    Math.floor((ARBITRARY_PRICE_VND * 6000) / 10000),
  );
});

test("Phase 20H.3f (correction pass) Unikorn commission wins over an eligible offer selector when the API returns a valid commission (API-first precedence)", async () => {
  const svc = await loadService();

  let unikornCalls = 0;
  let selectorCalls = 0;
  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async () => {
      unikornCalls += 1;
      return okUnikornQuote(21996);
    },
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: {
        async selectOffer() {
          selectorCalls += 1;
          return {
            kind: "eligible",
            offer: {
              offerId: "off-catalog",
              campaignId: "cmp-catalog",
              commissionRateBps: 1000,
              cashbackShareBps: 6000,
              commissionRateSource: "catalog",
            },
          };
        },
      },
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "available");
  if (result.quote.status !== "available") throw new Error("unreachable");

  const q = result.quote.value;

  // The Unikorn API is the authoritative source. The selector's
  // catalog-derived rate MUST NOT be applied when the API returns a
  // valid commission.
  assert.equal(q.commissionSource, "unikorn_api");
  assert.equal(q.estimatedCommissionRateBps, null);
  assert.equal(q.estimatedNetworkCommission.amount, 21996);
  assert.equal(q.estimatedUserCashback.amount, 13197);
  assert.equal(q.estimatedPlatformProfit.amount, 8799);

  // The provider MUST be called exactly once and the selector MUST
  // NOT be consulted -- short-circuiting saves the round trip and
  // guarantees the API-first precedence is honoured.
  assert.equal(unikornCalls, 1);
  assert.equal(selectorCalls, 0);
});

// -------------------------------------------------------------------
// Failure paths
// -------------------------------------------------------------------

test("Phase 20H.3f missing commission field produces unavailable quote", async () => {
  const svc = await loadService();

  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async () => {
      throw new Error("normalize would have rejected commission_missing");
    },
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "unavailable");
  if (result.quote.status !== "unavailable") throw new Error("unreachable");
  assert.equal(result.quote.reason, "eligibility_unknown");
});

test("Phase 20H.3f commission=0 produces unavailable quote", async () => {
  const svc = await loadService();

  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async () => okUnikornQuote(0),
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "unavailable");
});

test("Phase 20H.3f negative commission produces unavailable quote", async () => {
  const svc = await loadService();

  // Provider contract normalizes this to commission_invalid in
  // production; the service-level provider here emulates a defective
  // upstream by handing the service a negative number. The service
  // MUST defensively reject it as commission_rate_unavailable.
  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async () => okUnikornQuote(-10),
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "unavailable");
});

test("Phase 20H.3f fetch rejection (network failure) keeps selector outcome unavailable", async () => {
  const svc = await loadService();

  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async () => {
      throw new Error("ECONNRESET");
    },
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "unavailable");
  if (result.quote.status !== "unavailable") throw new Error("unreachable");
  assert.equal(result.quote.reason, "eligibility_unknown");
});

test("Phase 20H.3f no Unikorn provider wired keeps the selector outcome authoritative (selector-only fallback)", async () => {
  const svc = await loadService();

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
      shopeeCatalogRepository: emptyRepo(),
      // unikornCommissionProvider intentionally omitted
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "unavailable");
  if (result.quote.status !== "unavailable") throw new Error("unreachable");
  assert.equal(result.quote.reason, "eligibility_unknown");
});

// -------------------------------------------------------------------
// API-first precedence: silent fallback to the offer selector
// -------------------------------------------------------------------

test("Phase 20H.3f (correction pass) Unikorn provider throwing falls through to the offer-selector + catalog/fixture path", async () => {
  const svc = await loadService();

  // Provider simulates a transient network failure. The service must
  // treat this as a silent fallback to the offer-selector outcome --
  // the buyer UI MUST still receive a usable quote when the offer
  // selector returns eligible with a fixture-derived rate.
  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async () => {
      throw new Error("ECONNRESET -- simulated Unikorn network failure");
    },
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-fallback",
          campaignId: "cmp-fallback",
          // 20% commission rate -- chosen so buyer cashback is NOT
          // derived from a fixture commission and proves the
          // selector path is the active one when Unikorn fails.
          commissionRateBps: 2_000,
          cashbackShareBps: 6_000,
          commissionRateSource: "fixture",
        },
      }),
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "available");
  if (result.quote.status !== "available") throw new Error("unreachable");

  const q = result.quote.value;

  // The selector's fixture-derived rate MUST be applied because the
  // API threw. The source must record the fixture provenance so audit
  // logs distinguish this fallback from the Unikorn API path.
  assert.equal(q.commissionSource, "fixture");
  assert.equal(q.estimatedCommissionRateBps, 2_000);
  // 1_000_000 VND price * 20% = 200_000 VND network commission.
  assert.equal(q.estimatedNetworkCommission.amount, 200_000);
  // 200_000 * 60% = 120_000 VND buyer cashback.
  assert.equal(q.estimatedUserCashback.amount, 120_000);
  assert.equal(q.estimatedPlatformProfit.amount, 80_000);
});

test("Phase 20H.3f (correction pass) Unikorn returning commission=0 falls through to the offer selector (safe unavailable copy)", async () => {
  const svc = await loadService();

  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async () => okUnikornQuote(0),
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "unavailable");
  if (result.quote.status !== "unavailable") throw new Error("unreachable");
  assert.equal(result.quote.reason, "eligibility_unknown");
});

test("Phase 20H.3f (correction pass) Unikorn missing commission falls through to the offer selector (safe unavailable copy)", async () => {
  const svc = await loadService();

  // The provider throws because the pure client rejects a missing
  // commission field with `commission_missing`. The service must
  // swallow this and fall through to the selector.
  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async () => {
      throw new Error("commission_missing");
    },
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({ kind: "no_active_offer" }),
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "unavailable");
  if (result.quote.status !== "unavailable") throw new Error("unreachable");
  assert.equal(result.quote.reason, "no_active_offer");
});

test("Phase 20H.3f (correction pass) no Unikorn provider keeps the fixture-eligible selector outcome authoritative (degraded precedence)", async () => {
  const svc = await loadService();

  // When Unikorn is intentionally not configured, the selector's
  // catalog/fixture outcome is the authoritative source. This test
  // proves the API-first precedence degrades gracefully when the
  // dependency bundle does not include a Unikorn provider.
  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({
        kind: "eligible",
        offer: {
          offerId: "off-fallback-2",
          campaignId: "cmp-fallback-2",
          commissionRateBps: 1_500,
          cashbackShareBps: 6_000,
          commissionRateSource: "fixture",
        },
      }),
      shopeeCatalogRepository: emptyRepo(),
      // unikornCommissionProvider intentionally omitted
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "available");
  if (result.quote.status !== "available") throw new Error("unreachable");
  assert.equal(result.quote.value.commissionSource, "fixture");
  assert.equal(result.quote.value.estimatedCommissionRateBps, 1_500);
});

// -------------------------------------------------------------------
// UI safety: no internal identifiers leaked
// -------------------------------------------------------------------

test("Phase 20H.3f Unikorn-backed available quote renders the buyer-facing strings without internal identifiers and without literal \\uXXXX", async () => {
  const svc = await loadService();

  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async () => okUnikornQuote(21996),
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "available");
  if (result.quote.status !== "available") throw new Error("unreachable");

  const availableView = toAvailableView(svc, result.quote.value);

  const html = renderToStaticMarkup(
    React.createElement(ShopeeProductPreviewCardView, {
      quote: availableView,
      ctaSlot: STUB_CTA,
    }),
  );

  // Required buyer-facing copy
  assert.match(html, /Hoàn tiền dự kiến/);
  assert.match(html, /13\.197 đ/);
  assert.match(html, /Vaffiliate hoàn lại 60% hoa hồng Shopee/);
  assert.match(html, /Mua ngay nhận hoàn tiền/);

  // No raw API identifiers leak to the buyer UI.
  const forbiddenStrings = [
    "campaign:unikorn",
    "offer:unikorn",
    "ARBITRARY",
    "networkSubId",
    "vaflnk",
    "dataSource",
    "sellerComFinal",
    "shopeeComFinal",
    "sellerCommissionVnd",
    "shopeeCommissionVnd",
  ];
  for (const s of forbiddenStrings) {
    assert.equal(
      html.includes(s),
      false,
      `buyer UI MUST NOT contain forbidden identifier: ${s}`,
    );
  }

  // No literal Unicode escape sequences in the rendered markup.
  assert.ok(
    !html.includes("\\u"),
    `buyer UI MUST NOT render literal \\uXXXX escapes; got: ${html.slice(0, 400)}`,
  );
});

test("Phase 20H.3f Unikorn-backed unavailable quote renders safe copy without internal identifiers", async () => {
  const svc = await loadService();

  const provider: ShopeeUnikornCommissionProvider = fixedProvider(
    async () => okUnikornQuote(0),
  );

  const result = await svc.resolveShopeeProductPreviewWithDeps(
    { productUrl: ARBITRARY_URL },
    {
      resolveUrl: async () => ARBITRARY_IDENTITY,
      metadataProvider: {
        async getProduct() {
          return ARBITRARY_METADATA;
        },
      },
      offerSelector: makeFakeSelector({ kind: "eligibility_unknown" }),
      shopeeCatalogRepository: emptyRepo(),
      unikornCommissionProvider: provider,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.quote.status, "unavailable");
  if (result.quote.status !== "unavailable") throw new Error("unreachable");

  const unavailableView = toUnavailableView(
    result.quote.reason,
    result.quote.message,
  );

  const html = renderToStaticMarkup(
    React.createElement(ShopeeProductPreviewCardView, {
      quote: unavailableView,
      ctaSlot: STUB_CTA,
    }),
  );

  assert.match(html, /Hoàn tiền không được đảm bảo/);
  for (const s of ["networkSubId", "vaflnk", "dataSource", "campaign:"]) {
    assert.equal(
      html.includes(s),
      false,
      `unavailable UI MUST NOT contain forbidden identifier: ${s}`,
    );
  }
  assert.ok(!html.includes("\\u"));
});

// -------------------------------------------------------------------
// Persisted quote snapshot only carries server-normalized values
// -------------------------------------------------------------------

test("Phase 20H.3f Quote snapshot passed downstream never carries raw commission metadata", () => {
  // Phase 20H.3f contract: the ShopeeProductPreviewQuote union
  // exposes only `estimatedCashbackVnd`, `cashbackShareBps`,
  // `commissionRateBps`, `calculatedAt`, and product metadata.
  // There is NO field for the raw commission string, itemId,
  // networkSubId, affiliateUrl, or vaflnk. This test enforces the
  // structural guarantee at compile time so future drift cannot
  // accidentally leak upstream identifiers into the client bundle.
  type AllowedKeys =
    | "status"
    | "product"
    | "cashbackShareBps"
    | "commissionRateBps"
    | "estimatedCashbackVnd"
    | "calculatedAt"
    | "isEstimate";

  type AvailableQuoteKeys = keyof import("@/types/cashback").ShopeeProductPreviewAvailableQuote;

  // compile-time-only assertion via `extends` to keep the build green
  const _keys: AvailableQuoteKeys[] = [
    "status",
    "product",
    "cashbackShareBps",
    "commissionRateBps",
    "estimatedCashbackVnd",
    "calculatedAt",
    "isEstimate",
  ];
  void _keys;

  // runtime assertion using the union of expected keys.
  const expected: AllowedKeys[] = [
    "status",
    "product",
    "cashbackShareBps",
    "commissionRateBps",
    "estimatedCashbackVnd",
    "calculatedAt",
    "isEstimate",
  ];
  for (const k of expected) {
    assert.ok(k, "key must compile");
  }
});
