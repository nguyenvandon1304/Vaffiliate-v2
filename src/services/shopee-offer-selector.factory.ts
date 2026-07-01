/**
 * Offer selector factory for the Shopee cashback quote service.
 *
 * Phase 20H.2 -- the production selector bridges product identity +
 * metadata to a concrete affiliate catalog offer. The pure factory
 * lives in this module so unit tests can construct selectors
 * against in-memory repositories without touching a live database
 * or triggering the server-only guard.
 *
 * Production callers MUST wire the selector through
 * @/services/shopee-offer-selector.server which composes this
 * factory with the Drizzle-backed repository. Tests should
 * import { createShopeeOfferSelector } from
 * @/services/shopee-offer-selector directly and inject a fake
 * repository.
 */

import type {
  ShopeeCatalogRepository,
  ShopeeOfferSelector,
  ShopeeOfferSelectorInput,
} from "./shopee-offer-selector";

export function createShopeeOfferSelector(
  catalog: ShopeeCatalogRepository,
): ShopeeOfferSelector {
  return {
    async selectOffer(
      input: ShopeeOfferSelectorInput,
    ): ReturnType<ShopeeOfferSelector["selectOffer"]> {
      const offers = await catalog.listActiveShopeeOffers();

      if (offers.length === 0) {
        return { kind: "no_active_offer" };
      }

      const matchedOffer = offers.find(
        (offer) =>
          offer.shopId === input.product.shopId ||
          offer.itemId === input.product.itemId,
      );

      if (matchedOffer) {
        if (!matchedOffer.hasPolicy) {
          return {
            kind: "eligibility_unknown",
            reason: "cashback_policy_unavailable",
            message:
              "Chưa có chính sách hoàn tiền đang áp dụng cho sản phẩm này.",
          };
        }
        return {
          kind: "eligible",
          offer: {
            offerId: matchedOffer.offerId,
            campaignId: matchedOffer.campaignId,
            commissionRateBps: matchedOffer.commissionRateBps,
            cashbackShareBps: matchedOffer.cashbackShareBps,
          },
        };
      }

      return { kind: "eligibility_unknown" };
    },
  };
}