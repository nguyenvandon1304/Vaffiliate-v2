/**
 * Phase 20I.2 -- catalog source / fallback composition tests.
 *
 * Verifies:
 *   - empty / failing adapter list falls back to manual list;
 *   - successful adapter results are normalized + sanitized
 *     before being merged;
 *   - duplicates resolve with manual winning;
 *   - no internal tracking hint leaks into the final snapshot.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicDealCatalog,
  composePublicCatalog,
} from "./public-deal-catalog.source";
import { MockOfferFeedAdapter } from "./sources/mock-offer-feed.adapter";
import type { PublicDeal, PublicPromoDeal } from "@/services/public-deals.types";
import type { RawOffer } from "./sources/public-offer-feed.types";

function makeManualDeal(overrides: Partial<PublicPromoDeal> = {}): PublicDeal {
  return {
    id: "manual-1",
    platform: "shopee",
    kind: "deal",
    status: "active",
    title: "Manual seeded deal",
    description: "Ưu đãi có thể thay đổi theo điều kiện của sàn.",
    categorySlug: "popular",
    isExclusive: false,
    isFeatured: false,
    expiresAt: null,
    destinationUrl: "https://shopee.vn/dien-tu/manual",
    discountText: null,
    minSpendText: null,
    ...overrides,
  };
}

function makeRaw(overrides: Partial<RawOffer> = {}): RawOffer {
  return {
    vendorId: "adapter-vendor-1",
    platform: "shopee",
    kind: "deal",
    title: "Adapter deal",
    description: "Ưu đãi có thể thay đổi theo điều kiện của sàn.",
    imageUrl: "https://cf.shopee.vn/adapter.jpg",
    destinationUrl: "https://shopee.vn/dien-tu/adapter",
    validUntil: undefined,
    status: "active",
    tracking: { affiliateUrl: "https://an-redir.com/r" },
    extra: { productId: 12345, shopId: 6789, internalToken: "must-not-leak" },
    ...overrides,
  };
}

test("composePublicCatalog falls back to manual when adapter list is empty", () => {
  const manual = [makeManualDeal({ id: "manual-only" })];
  const snap = composePublicCatalog({
    manual,
    adapterResults: [],
  });
  assert.strictEqual(snap.all.length, 1);
  assert.strictEqual(snap.all[0].id, "manual-only");
  assert.strictEqual(snap.adapter.length, 0);
  assert.strictEqual(snap.manual.length, 1);
});

test("composePublicCatalog falls back to manual when every adapter fails", () => {
  const snap = composePublicCatalog({
    manual: [makeManualDeal({ id: "manual-fallback" })],
    adapterResults: [
      { source: "addlivetag", result: { ok: false, reason: "timeout" } },
      { source: "shopee-feed", result: { ok: false, reason: "parse" } },
    ],
  });
  assert.strictEqual(snap.all.length, 1);
  assert.strictEqual(snap.all[0].id, "manual-fallback");
  assert.strictEqual(snap.adapter.length, 0);
  assert.strictEqual(snap.diagnostics.adapterFailures.length, 2);
});

test("composePublicCatalog merges adapter results after normalization + sanitization", () => {
  const snap = composePublicCatalog({
    manual: [makeManualDeal({ id: "manual-only" })],
    adapterResults: [
      {
        source: "addlivetag",
        result: { ok: true, offers: [makeRaw({ vendorId: "vendor-1" })] },
      },
    ],
  });
  assert.ok(snap.all.length >= 2);
  const ids = snap.all.map((d) => d.id);
  assert.ok(ids.includes("manual-only"));
});

test("composePublicCatalog resolves duplicate ids with manual winning", () => {
  const snap = composePublicCatalog({
    manual: [makeManualDeal({ id: "shared-id", title: "Manual wins" })],
    adapterResults: [
      {
        source: "addlivetag",
        result: { ok: true, offers: [makeRaw({ vendorId: "shared-id" })] },
      },
    ],
  });
  const matches = snap.all.filter((d) => d.id === "shared-id");
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].title, "Manual wins");
});

test("composePublicCatalog rejects adapter entries that contain forbidden tracking hints in destinationUrl", () => {
  const snap = composePublicCatalog({
    manual: [],
    adapterResults: [
      {
        source: "addlivetag",
        result: {
          ok: true,
          offers: [
            makeRaw({
              vendorId: "tracked-1",
              destinationUrl: "https://shopee.vn/dien-tu?clickId=abc",
            }),
          ],
        },
      },
    ],
  });
  assert.strictEqual(snap.all.length, 1);
  assert.ok(snap.all[0].destinationUrl.startsWith("https://shopee.vn/"));
  assert.ok(!snap.all[0].destinationUrl.includes("clickId"));
});

test("composePublicCatalog strips the entire tracking + extra bag", () => {
  const snap = composePublicCatalog({
    manual: [],
    adapterResults: [
      {
        source: "addlivetag",
        result: { ok: true, offers: [makeRaw()] },
      },
    ],
  });
  const serialised = JSON.stringify(snap.all);
  for (const forbidden of [
    "productId",
    "shopId",
    "internalToken",
    "must-not-leak",
    "networkSubId",
    "sourceSubId1",
    "purchaseIntentId",
    "an_redir",
    "vaflnk",
  ]) {
    assert.ok(
      !serialised.toLowerCase().includes(forbidden.toLowerCase()),
      "catalog leaked " + forbidden + " into final snapshot",
    );
  }
});

test("buildPublicDealCatalog uses mock adapter + manual fallback", async () => {
  const manual = [makeManualDeal({ id: "manual-1" })];
  const adapter = new MockOfferFeedAdapter({
    offers: [makeRaw({ vendorId: "adapter-1" })],
  });
  const snap = await buildPublicDealCatalog({ manual, adapters: [adapter] });
  const ids = snap.all.map((d) => d.id);
  assert.ok(ids.includes("manual-1"));
});

test("buildPublicDealCatalog falls back gracefully when the adapter throws synchronously", async () => {
  const manual = [makeManualDeal({ id: "manual-still-here" })];
  const adapter = new (class {
    readonly source = "mock" as const;
    async fetchOffers() {
      throw new Error("boom");
    }
  })();
  const snap = await buildPublicDealCatalog({
    manual,
    adapters: [adapter as never],
  });
  assert.strictEqual(snap.all.length, 1);
  assert.strictEqual(snap.all[0].id, "manual-still-here");
  assert.strictEqual(snap.diagnostics.adapterFailures.length, 1);
});

test("buildPublicDealCatalog surfaces the same safe list when adapter returns ok:false", async () => {
  const manual = [makeManualDeal({ id: "manual-ok-false" })];
  const adapter = new MockOfferFeedAdapter({
    forceFailure: { reason: "vendor-outage" },
  });

  const snap = await buildPublicDealCatalog({ manual, adapters: [adapter] });
  assert.strictEqual(snap.all[0].id, "manual-ok-false");
  assert.ok(
    snap.diagnostics.adapterFailures.some(
      (f) => f.reason === "vendor-outage",
    ),
  );
});
