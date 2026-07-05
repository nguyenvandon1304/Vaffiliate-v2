/**
 * Server-only factory that wires the canonical Drizzle-backed Shopee
 * catalog repository into the pure selector contract.
 *
 * The factory is deliberately tiny:
 *
 *   - it returns an adapter whose only job is to call the canonical
 *     "listActiveShopeeOffersWithPolicyStatusAsync" read-only export
 *     from "@/repositories/affiliate-catalog.repository";
 *   - it normalises the canonical offer shape into the
 *     "ShopeeCatalogRepositoryOffer" shape the selector contract
 *     expects, adding the hasPolicy flag so the selector can
 *     distinguish "no offer" from "offer without policy";
 *   - it does NOT introduce caching, transactions, retries, or any
 *     other behaviour the canonical repository does not already
 *     provide.
 *
 * Identity evidence (shopId, itemId, categoryId) is NOT populated on
 * the selector view because the canonical
 * "ActiveShopeeOfferWithPolicyStatus" row shape (and the underlying
 * `offers` / `cashback_policies` schema) does not record per-product
 * mapping. The selector consults those fields during its normal
 * product-matching step; for production rows they are `null`, and the
 * selector treats that as "no concrete product evidence" unless a
 * separately-wired fixture lookup is provided at composition time.
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
 * contract that the pure selector consumes. Every call forwards to
 * the canonical read-only export and maps the canonical row into the
 * selector view shape, exposing hasPolicy so the selector can
 * distinguish "no active offer" from "offer without policy".
 *
 * Per-row commission rate resolution is intentionally NOT performed
 * here: the canonical row shape carries `cashbackShareBps` only;
 * resolving a `commissionRateBps` against an out-of-band fixture is
 * the caller's job (composition layer) because it requires resolved
 * product identity, which is not in scope for a repository adapter.
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
  // The canonical row does not carry `commission_rate_bps`; the
  // canonical Shopee offers table records advertiser/campaign/offer
  // identity only. Per-row rate resolution is handled at the
  // composition layer (see `buildProductionShopeeProductPreviewDependencies`
  // for the production wiring) using a separate fixture lookup that
  // is identity-aware and runs at selector-call time, NOT at row-read
  // time.
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