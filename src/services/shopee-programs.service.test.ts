import test from "node:test";
import assert from "node:assert/strict";

import type { ActiveShopeeCatalogOffer } from "@/repositories/affiliate-catalog.repository";

import { listShopeeProgramCardsAsync } from "./shopee-programs.service";

import { FUTURE_SHOPEE_PROGRAM_CARDS } from "@/lib/mock/shopee-programs";

function makeOffer(
  offerId: string,
  campaignId: string = "cmp-generic",
): ActiveShopeeCatalogOffer {
  return {
    offerId,
    campaignId,
    advertiserId: "adv-shopee",
    advertiserPlatform: "shopee",
    cashbackShareBps: 6000,
  };
}

test("listShopeeProgramCardsAsync returns an empty list when the catalog is empty", async () => {
  const cards = await listShopeeProgramCardsAsync({
    dependencies: { listActiveOffers: async () => [] },
  });

  // Future cards are still appended after an empty live catalog.
  assert.equal(cards.length, FUTURE_SHOPEE_PROGRAM_CARDS.length);
  for (const card of cards) {
    assert.equal(card.kind, "coming_soon");
  }
});

test("listShopeeProgramCardsAsync renders live catalog offers as active cards", async () => {
  const cards = await listShopeeProgramCardsAsync({
    dependencies: {
      listActiveOffers: async () => [
        makeOffer("off-aaa", "cmp-aaa"),
      ],
    },
  });

  const active = cards.filter((card) => card.kind === "active");
  assert.equal(active.length, 1);

  const card = active[0];
  if (!card) return;
  assert.equal(card.programType, "generic_affiliate");
  assert.equal(card.platform, "shopee");
  assert.equal(card.campaignId, "cmp-aaa");
  assert.equal(card.offerId, "off-aaa");
  assert.equal(card.title, "Shopee Cashback cơ bản");
  assert.equal(card.badge, "Hoàn tiền dự kiến");
});

test("listShopeeProgramCardsAsync renders mock future cards as coming-soon", async () => {
  const cards = await listShopeeProgramCardsAsync({
    dependencies: { listActiveOffers: async () => [] },
  });

  const comingSoon = cards.filter((card) => card.kind === "coming_soon");
  assert.equal(comingSoon.length, FUTURE_SHOPEE_PROGRAM_CARDS.length);

  const facebookCard = comingSoon.find(
    (card) => card.title === "Facebook x Shopee",
  );
  assert.ok(facebookCard);
  if (!facebookCard) return;

  assert.equal(facebookCard.programType, "traffic_source_campaign");
  assert.equal(facebookCard.campaignId, null);
  assert.equal(facebookCard.offerId, null);
  assert.equal(facebookCard.badge, "Sắp hỗ trợ");
  assert.ok(facebookCard.safeNote.length > 0);
});

test("listShopeeProgramCardsAsync places live cards before mock cards by displayOrder", async () => {
  const cards = await listShopeeProgramCardsAsync({
    dependencies: {
      listActiveOffers: async () => [
        makeOffer("off-zzz", "cmp-zzz"),
        makeOffer("off-aaa", "cmp-aaa"),
      ],
    },
  });

  // First two cards must be active (live), then three coming-soon.
  assert.equal(cards[0]?.kind, "active");
  assert.equal(cards[1]?.kind, "active");
  assert.equal(cards[2]?.kind, "coming_soon");
  assert.equal(cards[3]?.kind, "coming_soon");
  assert.equal(cards[4]?.kind, "coming_soon");

  // DisplayOrder is monotonic.
  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1];
    const curr = cards[i];
    if (!prev || !curr) return;
    assert.ok(prev.displayOrder <= curr.displayOrder);
  }

  // Live card displayOrder is exactly its array index, so 0 then 1.
  assert.equal(cards[0]?.displayOrder, 0);
  assert.equal(cards[1]?.displayOrder, 1);
  // Mock cards start after the live count (2).
  assert.ok((cards[2]?.displayOrder ?? 0) >= 2);
});

test("listShopeeProgramCardsAsync card copy never promises guaranteed cashback or voucher", async () => {
  const cards = await listShopeeProgramCardsAsync({
    dependencies: {
      listActiveOffers: async () => [makeOffer("off-aaa")],
    },
  });

  for (const card of cards) {
    const haystack = `${card.title} ${card.subtitle} ${card.badge}`;
    assert.ok(
      !haystack.includes("Chắc chắn"),
      `card "${card.title}" must not promise "Chắc chắn"`,
    );
    assert.ok(
      !haystack.toLowerCase().includes("guaranteed"),
      `card "${card.title}" must not use the word "guaranteed"`,
    );
    assert.ok(
      !haystack.includes("100%"),
      `card "${card.title}" must not advertise a 100% rate`,
    );
  }

  // Active cards must not promise voucher.
  for (const card of cards.filter((c) => c.kind === "active")) {
    assert.ok(!card.badge.includes("Voucher"));
    assert.ok(!card.subtitle.includes("Voucher"));
  }
});

test("listShopeeProgramCardsAsync does not include the live-only card IDs in the mock list", () => {
  // Static-shape sanity check: future cards never reuse an active
  // card ID prefix. This guards against accidental cross-pollination
  // when a future admin portal persists them.
  for (const future of FUTURE_SHOPEE_PROGRAM_CARDS) {
    assert.ok(future.id.startsWith("future-"));
  }
});

test("listShopeeProgramCardsAsync is deterministic across calls", async () => {
  const stub = async () => [
    makeOffer("off-b", "cmp-b"),
    makeOffer("off-a", "cmp-a"),
  ];
  const first = await listShopeeProgramCardsAsync({
    dependencies: { listActiveOffers: stub },
  });
  const second = await listShopeeProgramCardsAsync({
    dependencies: { listActiveOffers: stub },
  });

  assert.deepEqual(first, second);
});

test("listShopeeProgramCardsAsync falls back to the default repo when no override is passed", async () => {
  // The default path lazy-imports the affiliate catalog repository,
  // which throws at module-load time when DATABASE_URL is missing.
  // The listShopeeProgramCardsAsync function must surface that throw
  // rather than silently returning an empty list.
  await assert.rejects(async () => {
    await listShopeeProgramCardsAsync();
  });
});
