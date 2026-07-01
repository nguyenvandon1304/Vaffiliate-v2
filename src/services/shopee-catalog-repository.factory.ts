/**
 * Server-only factory that wires the canonical Drizzle-backed Shopee
 * catalog repository into the pure selector contract.
 *
 * The factory is deliberately tiny:
 *
 *   - it returns an adapter whose only job is to call the canonical
 *     "listActiveShopeeOffersWithPolicyStatusAsync" read-only export from
 *     "@/repositories/affiliate-catalog.repository";
 *   - it normalises the canonical offer shape into the
 *     "ShopeeCatalogRepositoryOffer" shape the selector contract expects,
 *     adding the hasPolicy flag so the selector can distinguish
 *     "no offer" from "offer without policy";
 *   - it does NOT introduce caching, transactions, retries, or any
 *     other behaviour the canonical repository does not already provide.
 *
 * Unit tests bypass this factory entirely: they import
 * "createShopeeOfferSelector" from
 * "@/services/shopee-offer-selector.factory" and inject a fake
 * repository directly.
 */
import "server-only";

import {
  listActiveShopeeOffersWithPolicyStatusAsync,
  type ActiveShopeeOfferWithPolicyStatus,
} from "@/repositories/affiliate-catalog.repository";

import type {
  ShopeeCatalogRepository,
  ShopeeCatalogRepositoryOffer,
} from "./shopee-offer-selector";

/**
 * Builds the production Shopee catalog repository.
 *
 * The returned object satisfies the {@link ShopeeCatalogRepository}
 * contract that the pure selector consumes. Every call forwards to the
 * canonical read-only export and maps the canonical row into the
 * selector view shape, exposing hasPolicy so the selector can
 * distinguish "no active offer" from "offer without policy".
 */
export function createShopeeCatalogRepository(): ShopeeCatalogRepository {
  return {
    async listActiveShopeeOffers(): Promise<
      ReadonlyArray<ShopeeCatalogRepositoryOffer>
    > {
      const rows = await listActiveShopeeOffersWithPolicyStatusAsync();
      return rows.map(toSelectorView);
    },
  };
}

function toSelectorView(
  row: ActiveShopeeOfferWithPolicyStatus,
): ShopeeCatalogRepositoryOffer {
  return {
    offerId: row.offerId,
    campaignId: row.campaignId,
    commissionRateBps: null,
    cashbackShareBps: row.cashbackShareBps ?? 0,
    hasPolicy: row.cashbackShareBps !== null,
    shopId: null,
    categoryId: null,
    itemId: null,
    isPlatformWide: false,
  };
}