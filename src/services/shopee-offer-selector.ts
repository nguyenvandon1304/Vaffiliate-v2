/**
 * Offer selection contract for the Shopee cashback quote service.
 *
 * Phase 20H.2 — the selector bridges product identity + product
 * metadata to a concrete affiliate catalog offer. The pure selector
 * interface accepts both the resolved identity and the metadata
 * snapshot so the implementation can query the canonical affiliate
 * catalog with product-level evidence when a future phase introduces
 * a product/shop/category → offer mapping.
 *
 * Until that mapping is introduced, the production selector returns
 * `eligibility_unknown` for every product. The selector must:
 *
 *   - accept BOTH the identity and the product metadata on every call;
 *   - take a {@link ShopeeCatalogRepository} through dependency
 *     injection so the contract can be exercised by unit tests
 *     without a live database;
 *   - only return `eligible` when there is concrete catalog evidence
 *     that the product belongs to that offer (id, shop, category,
 *     etc.). It must never pick an offer simply because it is the
 *     only active Shopee offer, and it must never promote an
 *     offer as platform-wide unless the schema records a field that
 *     confirms it.
 */

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import type { ShopeeProductMetadata } from "@/lib/shopee/product-metadata/types";

export interface ShopeeOfferSelectorOffer {
  readonly offerId: string;
  readonly campaignId: string;
  readonly commissionRateBps: number | null;
  readonly cashbackShareBps: number;
  /**
   * Whether the matched offer has an associated cashback policy.
   * Populated by the selector when returning `eligible`.
   */
  readonly hasPolicy?: boolean;
}

export type ShopeeOfferSelectionOutcome =
  | { readonly kind: "eligible"; readonly offer: ShopeeOfferSelectorOffer }
  | { readonly kind: "no_active_offer" }
  | { readonly kind: "not_eligible" }
  | {
      readonly kind: "eligibility_unknown";
      /**
       * When the catalog returns an offer but it lacks a cashback policy,
       * this field carries the specific reason so the service can return a
       * more precise `quote.status = "unavailable"` message to the UI.
       */
      readonly reason?: "cashback_policy_unavailable";
      readonly message?: string;
    };

/**
 * Canonical Shopee catalog repository shape the production selector
 * relies on. The implementation MUST query the persisted affiliate
 * catalog to decide whether an active Shopee offer exists and whether
 * there is a concrete mapping to the current product.
 *
 * The structural type keeps the selector callable both from
 * production code (which wires `db`-backed implementations) and from
 * unit tests (which wire fakes that do not touch a database).
 */
export interface ShopeeCatalogRepository {
  /**
   * Returns active Shopee offers with policy presence information.
   *
   * The returned array includes offers that may or may not have a cashback
   * policy, so the selector can distinguish three cases:
   *
   *   - empty array: no active offer exists → `no_active_offer`
   *   - non-empty array, matched offer has no policy → `cashback_policy_unavailable`
   *   - non-empty array, matched offer has policy → `eligible`
   *
   * An `INNER JOIN` on cashback_policies would collapse the second case
   * into the first, making it impossible for the UI to show the right
   * error message. Use a `LEFT JOIN` (or equivalent) so null-policy
   * offers are still returned.
   */
  listActiveShopeeOffers(): Promise<
    ReadonlyArray<ShopeeCatalogRepositoryOffer>
  >;
}

export interface ShopeeCatalogRepositoryOffer {
  readonly offerId: string;
  readonly campaignId: string;
  readonly commissionRateBps: number | null;
  readonly cashbackShareBps: number;
  /**
   * Whether the offer has an associated cashback policy in the catalog.
   * When false (offer exists but policy is null), the selector returns
   * `cashback_policy_unavailable` instead of `eligibility_unknown` so
   * the UI distinguishes catalog-data issues from eligibility issues.
   */
  readonly hasPolicy: boolean;
  /**
   * Optional evidence the catalog has that ties the offer to a
   * specific shop, category, or product. When every field is
   * `null`/`undefined` and the array length is zero, the catalog
   * has no product-level mapping and the selector must return
   * `eligibility_unknown` regardless of how many active Shopee
   * offers exist.
   */
  readonly shopId?: string | null;
  readonly categoryId?: string | null;
  readonly itemId?: string | null;
  /**
   * When true, the offer is the platform-wide default for any Shopee
   * product. The current production schema does not record such a
   * flag, so production must never treat this as true.
   */
  readonly isPlatformWide?: boolean;
}

export interface ShopeeOfferSelectorInput {
  readonly identity: ShopeeProductIdentity;
  readonly product: ShopeeProductMetadata;
}

export interface ShopeeOfferSelector {
  selectOffer(
    input: ShopeeOfferSelectorInput,
  ): Promise<ShopeeOfferSelectionOutcome>;
}
