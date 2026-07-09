/**
 * Phase 20I.2 -- service sync + selector invariant tests.
 *
 * The selectors MUST:
 *   - stay synchronous (existing RSC pages depend on sync reads);
 *   - never crash on an unknown category slug;
 *   - never include any "guaranteed cashback/voucher" wording in
 *     their output copy;
 *   - never leak internal identifier fields into the catalog
 *     list even after the adapter path has run.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  listCategories,
  listDealsByCategory,
  listDealsByPlatform,
  listFeaturedDeals,
  listPlatforms,
  parseCategorySlug,
  getPublicDealCatalogSnapshotSync,
  resetPublicDealCatalogSnapshot,
} from "./public-deals.service";
import { composePublicCatalog } from "@/lib/deals/public-deal-catalog.source";
import { PUBLIC_DEALS } from "@/lib/mock/public-deals";
import { MockOfferFeedAdapter } from "@/lib/deals/sources/mock-offer-feed.adapter";

const FORBIDDEN_HINT_SUBSTRINGS = [
  "networkSubId",
  "sourceSubId1",
  "purchaseIntentId",
  "trackingLinkId",
  "publisherId",
  "shortCode",
  "clickId",
  "trackingPath",
  "an_redir",
  "vaflnk",
  "aff_sub",
];

const GUARANTEE_PHRASES = [
  "chắc chắn",
  "đảm bảo",
  "cam kết",
  "100% nhận",
  "100% hoàn",
  "mua là có",
];

test("listPlatforms exposes the four documented platforms", () => {
  const platforms = listPlatforms().map((p) => p.platform).sort();
  assert.deepStrictEqual(platforms, ["lazada", "shopee", "tiki", "tiktok"]);
});

test("listCategories still exposes the MVP category slugs", () => {
  const slugs = listCategories().map((c) => c.slug);
  for (const slug of ["all", "popular", "electronics", "shopeepay", "home"]) {
    assert.ok(slugs.includes(slug as never), "missing MVP slug " + slug);
  }
});

test("parseCategorySlug never crashes on adversarial input", () => {
  const cases: unknown[] = [
    null,
    undefined,
    42,
    {},
    [],
    "",
    "ALIEN",
    "  ",
    "popular;DROP",
    "popular/",
    "popular?x=1",
    "not-a-real-slug",
  ];
  for (const c of cases) {
    assert.strictEqual(parseCategorySlug(c), "all");
  }
  assert.strictEqual(parseCategorySlug("popular"), "popular");
  assert.strictEqual(parseCategorySlug("electronics"), "electronics");
});

test("listDealsByPlatform never crashes for any platform", () => {
  for (const p of ["shopee", "lazada", "tiktok", "tiki"] as const) {
    const deals = listDealsByPlatform(p);
    assert.ok(Array.isArray(deals));
  }
});

test("listDealsByCategory never crashes on an unknown slug", () => {
  const deals = listDealsByCategory("shopee" as never, "not-a-real-slug" as never);
  assert.ok(Array.isArray(deals));
});

test("selectors always return data via the snapshot path", () => {
  resetPublicDealCatalogSnapshot();
  const snap = getPublicDealCatalogSnapshotSync();
  assert.ok(snap.all.length >= PUBLIC_DEALS.length);
  const featured = listFeaturedDeals();
  assert.ok(Array.isArray(featured));
});

test("selectors expose no internal tracking ids after running through adapters", async () => {
  const adapter = new MockOfferFeedAdapter({
    offers: [
      {
        vendorId: "tracked-1",
        platform: "shopee",
        kind: "deal",
        title: "Adapter deal",
        description: "Ưu đãi có thể thay đổi theo điều kiện của sàn.",
        destinationUrl: "https://shopee.vn/dien-tu/adapter",
        validUntil: undefined,
        status: "active",
        tracking: {
          networkSubId: "x",
          sourceSubId1: "y",
          purchaseIntentId: "z",
          an_redir: "https://an-redir.com/r",
          vaflnk: "https://vaflnk.com/r",
        },
        extra: { productId: 1, shopId: 2, must_not_leak: "x" },
      },
    ],
  });
  const adapterResult = await adapter.fetchOffers();
  const snap = composePublicCatalog({
    manual: PUBLIC_DEALS,
    adapterResults: [
      {
        source: adapter.source,
        result: adapterResult.ok
          ? { ok: true, offers: adapterResult.offers }
          : { ok: false, reason: adapterResult.reason },
      },
    ],
  });
  const serialised = JSON.stringify(snap.all);
  for (const hint of FORBIDDEN_HINT_SUBSTRINGS) {
    assert.ok(
      !serialised.toLowerCase().includes(hint.toLowerCase()),
      "snapshot leaked " + hint,
    );
  }
  assert.ok(!serialised.includes("productId"));
  assert.ok(!serialised.includes("must_not_leak"));
});

test("selectors do not introduce guaranteed cashback / voucher copy", async () => {
  const adapter = new MockOfferFeedAdapter({
    offers: [
      {
        vendorId: "guaranteed-1",
        platform: "shopee",
        kind: "cashback_program",
        title: "Cashback chắc chắn 100% nhận tiền",
        description: "Mua là có hoàn tiền. Đảm bảo nhận ngay.",
        cashbackHint: "Cam kết nhận tiền trong 24h",
        destinationUrl: "https://shopee.vn/dien-tu",
        validUntil: undefined,
        status: "active",
        tracking: undefined,
        extra: undefined,
      },
    ],
  });
  const adapterResult = await adapter.fetchOffers();
  const snap = composePublicCatalog({
    manual: PUBLIC_DEALS,
    adapterResults: [
      {
        source: adapter.source,
        result: adapterResult.ok
          ? { ok: true, offers: adapterResult.offers }
          : { ok: false, reason: adapterResult.reason },
      },
    ],
  });
  const serialised = JSON.stringify(snap.all);
  for (const phrase of GUARANTEE_PHRASES) {
    assert.ok(
      !serialised.includes(phrase),
      "snapshot leaked guarantee phrase " + phrase,
    );
  }
});

test("Phase 20I.4: voucher deal without a real code drops the Sao chep ma action", () => {
  resetPublicDealCatalogSnapshot();
  const snap = composePublicCatalog({
    manual: PUBLIC_DEALS,
    adapterResults: [
      {
        source: "mock",
        result: {
          ok: true,
          offers: [
            {
              vendorId: "adapter-voucher-no-code",
              platform: "shopee",
              kind: "voucher_code",
              title: "Shopee voucher no real code",
              description: "Adapter voucher without a real code.",
              destinationUrl: "https://shopee.vn/dien-tu",
              status: "active",
              // No `code` here -- the normalizer MUST NOT synthesise
              // one from offerName / discountText.
            },
          ],
        },
      },
    ],
  });
  const voucher = snap.all.find((d) => d.id === "adapter-voucher-no-code");
  assert.ok(voucher);
  if (voucher) {
    assert.strictEqual(voucher.kind, "voucher_code");
    assert.strictEqual(voucher.code, null);
  }
});

test("Phase 20I.4: offerLink / productLink / cashbackLabel survive the sanitiser", () => {
  resetPublicDealCatalogSnapshot();
  const snap = composePublicCatalog({
    manual: PUBLIC_DEALS,
    adapterResults: [
      {
        source: "mock",
        result: {
          ok: true,
          offers: [
            {
              vendorId: "adapter-meta-1",
              platform: "shopee",
              kind: "deal",
              title: "Clean adapter offer",
              description: "Clean adapter offer description.",
              imageUrl: "https://cf.shopee.vn/x.jpg",
              destinationUrl: "https://shopee.vn/dien-tu/sample",
              validUntil: "2099-12-31T00:00:00.000Z",
              status: "active",
              cashbackHint: "Hoa hong chien dich 7%",
              tracking: { affiliateUrl: "https://shopee.vn/r/sample" },
            },
          ],
        },
      },
    ],
  });
  const offer = snap.all.find((d) => d.id === "adapter-meta-1");
  assert.ok(offer);
  if (offer) {
    assert.strictEqual(offer.imageUrl, "https://cf.shopee.vn/x.jpg");
    assert.strictEqual(
      offer.offerLink,
      "https://shopee.vn/r/sample",
    );
    assert.strictEqual(offer.cashbackLabel, "Hoa hong chien dich 7%");
    assert.strictEqual(offer.endsAt, "2099-12-31T00:00:00.000Z");
  }
});
