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
 *
 * Phase 20H.3d -- the factory accepts an OPTIONAL
 * `lookupFixtureCommissionRateBps` hook so production can resolve a
 * commission rate from a dev/test fixture for known (shopId, itemId)
 * pairs without changing the canonical catalog schema. The hook is
 * only consulted as a last-resort fallback after the catalog's normal
 * product/shop evidence lookup returns no match, AND the catalog has
 * exactly one policy-bearing offer; in every other situation the
 * selector returns the existing eligible/no_active_offer/
 * not_eligible/cashback_policy_unavailable outcomes unchanged.
 */

import type {
  ShopeeCatalogRepository,
  ShopeeOfferSelector,
  ShopeeOfferSelectorFixtureLookup,
  ShopeeOfferSelectorInput,
} from "./shopee-offer-selector";

export type { ShopeeOfferSelectorFixtureLookup };

export interface CreateShopeeOfferSelectorOptions {
  /**
   * Optional identity-aware commission-rate fallback consulted only
   * after every identity-shaped match (`offer.shopId ===
   * input.product.shopId || offer.itemId === input.product.itemId`)
   * has failed. The selector never consults the lookup when any
   * catalog row already matched, and never consults it when the
   * catalog has zero or more than one policy-bearing offers.
   */
  readonly lookupFixtureCommissionRateBps?: ShopeeOfferSelectorFixtureLookup;
}

/**
 * Whether the catalog row carries a usable cashback policy (positive
 * cashbackShareBps plus the hasPolicy flag the factory surfaces from
 * the canonical repository).
 */
function hasUsablePolicy(
  offer: import("./shopee-offer-selector").ShopeeCatalogRepositoryOffer,
): boolean {
  return offer.hasPolicy && offer.cashbackShareBps > 0;
}

function isValidBps(value: number): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10_000
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function createShopeeOfferSelector(
  catalog: ShopeeCatalogRepository,
  options: CreateShopeeOfferSelectorOptions = {},
): ShopeeOfferSelector {
  const lookupFixtureCommissionRateBps =
    options.lookupFixtureCommissionRateBps;

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
              "Chua co chinh sach hoan tien dang ap dung cho san pham nay.",
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

      // Identity-aware fixture fallback (Phase 20H.3d):
      //
      //   - only triggered when the normal shopId/itemId evidence
      //     lookup has failed;
      //   - only triggered when the catalog carries EXACTLY ONE
      //     policy-bearing offer, so a unit selection remains
      //     unambiguous even though the row does not record which
      //     product it advertises;
      //   - only triggered when both the resolved identity and the
      //     fixture lookup provide concrete (shopId, itemId) and a
      //     valid non-null bps rate in [0, 10000];
      //   - cannot promote to a platform-wide selection and cannot
      //     synthesise cashbackShareBps (the offer's persisted
      //     share is used verbatim).
      if (lookupFixtureCommissionRateBps) {
        const policyBearingOffers = offers.filter(hasUsablePolicy);
        if (policyBearingOffers.length === 1) {
          const productShopId = input.product.shopId;
          const productItemId = input.product.itemId;
          if (
            isNonEmptyString(productShopId) &&
            isNonEmptyString(productItemId)
          ) {
            const fixtureRateBps = lookupFixtureCommissionRateBps({
              shopId: productShopId,
              itemId: productItemId,
            });
            const policyOffer = policyBearingOffers[0];
            if (
              fixtureRateBps !== null &&
              isValidBps(fixtureRateBps) &&
              policyOffer
            ) {
              return {
                kind: "eligible",
                offer: {
                  offerId: policyOffer.offerId,
                  campaignId: policyOffer.campaignId,
                  commissionRateBps: fixtureRateBps,
                  cashbackShareBps: policyOffer.cashbackShareBps,
                },
              };
            }
          }
        }
      }

      return { kind: "eligibility_unknown" };
    },
  };
}