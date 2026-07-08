import test from "node:test";
import assert from "node:assert/strict";

import type { ActiveShopeeCatalogOffer } from "@/repositories/affiliate-catalog.repository";

import {
  resolveGenericShopeeCashbackOfferAsync,
  sortActiveShopeeOffersByOfferId,
} from "./shopee-generic-cashback.service";

function makeOffer(
  offerId: string,
  campaignId: string = "cmp-generic",
  cashbackShareBps: number = 6000,
): ActiveShopeeCatalogOffer {
  return {
    offerId,
    campaignId,
    advertiserId: "adv-shopee",
    advertiserPlatform: "shopee",
    cashbackShareBps,
  };
}

test("sortActiveShopeeOffersByOfferId sorts ASC by offerId", () => {
  const sorted = sortActiveShopeeOffersByOfferId([
    makeOffer("off-zzz"),
    makeOffer("off-aaa"),
    makeOffer("off-mmm"),
  ]);

  assert.deepEqual(
    sorted.map((entry) => entry.offerId),
    ["off-aaa", "off-mmm", "off-zzz"],
  );
});

test("sortActiveShopeeOffersByOfferId returns a fresh array (no mutation)", () => {
  const input = [makeOffer("off-2"), makeOffer("off-1")];
  const before = input.map((entry) => entry.offerId);

  sortActiveShopeeOffersByOfferId(input);

  assert.deepEqual(
    input.map((entry) => entry.offerId),
    before,
  );
});

test("resolveGenericShopeeCashbackOfferAsync returns unavailable when no offers", async () => {
  const resolution = await resolveGenericShopeeCashbackOfferAsync({
    publisherId: "pub-1",
    dependencies: {
      listActiveOffers: async () => [],
    },
  });

  assert.deepEqual(resolution, {
    kind: "unavailable",
    reason: "no_active_offer",
  });
});

test("resolveGenericShopeeCashbackOfferAsync returns the canonical first offer", async () => {
  const resolution = await resolveGenericShopeeCashbackOfferAsync({
    publisherId: "pub-1",
    dependencies: {
      listActiveOffers: async () => [
        makeOffer("off-zzz", "cmp-zzz", 7000),
        makeOffer("off-aaa", "cmp-aaa", 6000),
        makeOffer("off-mmm", "cmp-mmm", 6500),
      ],
    },
  });

  assert.equal(resolution.kind, "available");
  if (resolution.kind !== "available") return;

  assert.equal(resolution.offerId, "off-aaa");
  assert.equal(resolution.campaignId, "cmp-aaa");
  assert.equal(resolution.cashbackShareBps, 6000);
});

test("resolveGenericShopeeCashbackOfferAsync is deterministic across call order", async () => {
  const stub = async (): Promise<ReadonlyArray<ActiveShopeeCatalogOffer>> => [
    makeOffer("off-merchant-2", "cmp-m2", 7000),
    makeOffer("off-generic-1", "cmp-g1", 6000),
    makeOffer("off-merchant-1", "cmp-m1", 6500),
  ];

  const first = await resolveGenericShopeeCashbackOfferAsync({
    publisherId: "pub-1",
    dependencies: { listActiveOffers: stub },
  });
  const second = await resolveGenericShopeeCashbackOfferAsync({
    publisherId: "pub-1",
    dependencies: { listActiveOffers: stub },
  });

  assert.deepEqual(first, second);
  if (first.kind !== "available") return;
  assert.equal(first.offerId, "off-generic-1");
});

test("resolveGenericShopeeCashbackOfferAsync falls back to the default repo when no override is passed", async () => {
  // The default path calls listActiveShopeeOffersAsync from the
  // affiliate-catalog.repository, which in turn hits Drizzle. With no
  // DATABASE_URL set in this unit test runtime, the default repo call
  // is expected to throw. We assert that the resolver surfaces the
  // throw -- it does NOT swallow it -- so a misconfigured environment
  // cannot silently produce an "unavailable" outcome.
  await assert.rejects(async () => {
    await resolveGenericShopeeCashbackOfferAsync({
      publisherId: "pub-1",
    });
  });
});

test("resolveGenericShopeeCashbackOfferAsync never returns offerId without campaignId", async () => {
  const resolution = await resolveGenericShopeeCashbackOfferAsync({
    publisherId: "pub-1",
    dependencies: {
      listActiveOffers: async () => [makeOffer("off-x", "cmp-x")],
    },
  });

  assert.equal(resolution.kind, "available");
  if (resolution.kind !== "available") return;

  assert.ok(resolution.offerId.length > 0);
  assert.ok(resolution.campaignId.length > 0);
  assert.ok(resolution.cashbackShareBps >= 0);
});
