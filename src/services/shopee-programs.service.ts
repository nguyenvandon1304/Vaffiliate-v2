import {
  sortActiveShopeeOffersByOfferId,
} from "@/services/shopee-generic-cashback.service";

import type { ActiveShopeeCatalogOffer } from "@/repositories/affiliate-catalog.repository";

import { FUTURE_SHOPEE_PROGRAM_CARDS } from "@/lib/mock/shopee-programs";

import type {
  ShopeeActiveProgramCard,
  ShopeeComingSoonProgramCard,
  ShopeeProgramCard,
} from "@/services/shopee-programs.types";

/**
 * Phase 20H.7a -- server-side reader for the "Chương trình phổ biến" section.
 *
 * Returns a merged list of program cards in display order:
 *
 *   1. LIVE catalog offers first (active cards).
 *   2. Mock future traffic-source campaign cards second
 *      (coming-soon, display-only).
 *
 * The action that handles the buyer purchase flow must NEVER call
 * this helper to choose a classification target. Only the generic
 * Shopee offer (resolved via {@link resolveGenericShopeeCashbackOfferAsync})
 * is authoritative for tracking-link classification.
 */

export interface ListShopeeProgramCardsDependencies {
  readonly listActiveOffers?: () => Promise<
    ReadonlyArray<ActiveShopeeCatalogOffer>
  >;
}

async function defaultListActiveShopeeOffers(): Promise<
  ReadonlyArray<ActiveShopeeCatalogOffer>
> {
  const { listActiveShopeeOffersAsync } = await import(
    "@/repositories/affiliate-catalog.repository"
  );
  return listActiveShopeeOffersAsync();
}

function isShopeeActiveOffer(
  offer: ActiveShopeeCatalogOffer,
): offer is ActiveShopeeCatalogOffer {
  // Narrowing helper -- TypeScript cannot narrow the structural type.
  // Every ActiveShopeeCatalogOffer has advertiserPlatform = "shopee"
  // by construction (the source join filters to that platform), but
  // we re-check here so a future refactor cannot silently widen it.
  return offer.advertiserPlatform === "shopee";
}

function mapActiveOfferToCard(
  offer: ActiveShopeeCatalogOffer,
  displayOrder: number,
): ShopeeActiveProgramCard {
  return {
    kind: "active",
    id: `active-${offer.offerId}`,
    platform: "shopee",
    programType: "generic_affiliate",
    title: "Shopee Cashback cơ bản",
    subtitle:
      "Áp dụng khi Shopee ghi nhận hoa hồng cho đơn hàng.",
    badge: "Hoàn tiền dự kiến",
    category: "Hoàn tiền chung",
    displayOrder,
    campaignId: offer.campaignId,
    offerId: offer.offerId,
  };
}

function mapFutureCardToCard(
  future: (typeof FUTURE_SHOPEE_PROGRAM_CARDS)[number],
  displayOrder: number,
): ShopeeComingSoonProgramCard {
  return {
    kind: "coming_soon",
    id: future.id,
    platform: future.platform,
    programType: future.programType,
    title: future.title,
    subtitle: future.subtitle,
    badge: future.badge,
    category: future.category,
    displayOrder,
    campaignId: null,
    offerId: null,
    safeNote: future.safeNote,
  };
}

export async function listShopeeProgramCardsAsync(args?: {
  readonly dependencies?: ListShopeeProgramCardsDependencies;
}): Promise<ReadonlyArray<ShopeeProgramCard>> {
  const listActiveOffers =
    args?.dependencies?.listActiveOffers ??
    defaultListActiveShopeeOffers;

  const liveOffers = await listActiveOffers();
  const sortedLive = sortActiveShopeeOffersByOfferId(
    liveOffers.filter(isShopeeActiveOffer),
  );

  const cards: ShopeeProgramCard[] = [];

  sortedLive.forEach((offer, index) => {
    cards.push(mapActiveOfferToCard(offer, index));
  });

  FUTURE_SHOPEE_PROGRAM_CARDS.forEach((future) => {
    cards.push(
      mapFutureCardToCard(
        future,
        sortedLive.length + future.displayOrderOffset,
      ),
    );
  });

  cards.sort((a, b) => a.displayOrder - b.displayOrder);
  return cards;
}
