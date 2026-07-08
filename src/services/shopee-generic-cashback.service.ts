/**
 * Phase 20H.7a -- canonical generic Shopee cashback offer resolver.
 *
 * The buyer purchase flow needs a single, deterministic Shopee offer
 * it can attach to every newly-created tracking link, so the Phase
 * 20H.6 reconciliation flow always has a usable catalog snapshot.
 *
 * Selection rule (smallest correct change):
 *
 *   1. Load the active Shopee offer list via
 *      {@link listActiveShopeeOffersAsync} from the existing
 *      affiliate catalog repository.
 *   2. If the list is empty, return `{ kind: "unavailable", reason:
 *      "no_active_offer" }`. The buyer purchase action proceeds with
 *      an unclassified tracking link, which Phase 20H.6 will
 *      surface as `catalog_snapshot_not_found` -- the documented
 *      safe-skip path. No exception is thrown.
 *   3. Otherwise pick the FIRST offer sorted by `offerId ASC` so the
 *      selection is deterministic across environments. The
 *      `affiliate-catalog.repository` already enforces the full
 *      eligibility contract (advertiser active + platform=shopee,
 *      campaign active, offer active, cashback policy present with
 *      non-null share), so by the time we read this row we already
 *      know it is safe to use.
 *
 * The service takes an optional `listActiveOffers` dependency so unit
 * tests can stub the catalog read without touching Drizzle. Production
 * callers should leave it undefined and rely on the default.
 */
import type { ActiveShopeeCatalogOffer } from "@/repositories/affiliate-catalog.repository";

/**
 * Lazy proxy over {@link import("@/repositories/affiliate-catalog.repository").listActiveShopeeOffersAsync}.
 *
 * Defined as an arrow function (not a direct re-export) so that
 * importing this service does NOT eagerly load the affiliate-catalog
 * repository. The repository transitively imports `@/db/client`,
 * which throws at module-load time when `DATABASE_URL` is missing.
 *
 * Unit tests that inject a stub `listActiveOffers` override never
 * reach this lazy path, so the test runtime does not need a live
 * database.
 */
async function defaultListActiveShopeeOffers(): Promise<
  ReadonlyArray<ActiveShopeeCatalogOffer>
> {
  const { listActiveShopeeOffersAsync } = await import(
    "@/repositories/affiliate-catalog.repository"
  );
  return listActiveShopeeOffersAsync();
}

/**
 * Discriminated union returned by the resolver.
 *
 *   - `available` -- the action should call
 *     `classifyShopeeTrackingLinkAsync` with the chosen offerId.
 *   - `unavailable` -- the action should skip classification and let
 *     the buyer proceed; the link stays unclassified, which
 *     reconciliation treats as a safe-skip `catalog_snapshot_not_found`.
 */
export type GenericShopeeCashbackOfferResolution =
  | {
      readonly kind: "available";
      readonly offerId: string;
      readonly campaignId: string;
      readonly cashbackShareBps: number;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "no_active_offer";
    };

export interface ResolveGenericShopeeCashbackOfferDependencies {
  /**
   * Optional override for the catalog read. Production callers leave
   * it undefined; tests inject a stub that returns an in-memory list.
   */
  readonly listActiveOffers?: () => Promise<
    ReadonlyArray<ActiveShopeeCatalogOffer>
  >;
}

/**
 * Stable ascending sort by `offerId`. Pure; exported so unit tests
 * can assert the deterministic ordering without re-implementing it.
 *
 * Ties are not possible: `offerId` is a `text` PRIMARY KEY so it is
 * unique per row.
 */
export function sortActiveShopeeOffersByOfferId<
  T extends { readonly offerId: string },
>(offers: ReadonlyArray<T>): ReadonlyArray<T> {
  return [...offers].sort((a, b) => {
    if (a.offerId < b.offerId) return -1;
    if (a.offerId > b.offerId) return 1;
    return 0;
  });
}

/**
 * Resolve the canonical generic Shopee offer for the buyer purchase
 * flow. Always resolves; never throws.
 *
 * The `publisherId` argument is reserved for a future phase that may
 * scope the choice to per-publisher deals (merchant_deal). For now
 * the generic offer is global per platform.
 */
export async function resolveGenericShopeeCashbackOfferAsync(args: {
  readonly publisherId: string;
  readonly dependencies?: ResolveGenericShopeeCashbackOfferDependencies;
}): Promise<GenericShopeeCashbackOfferResolution> {
  // Touch publisherId so callers see the parameter shape and a future
  // per-publisher implementation has a stable hook. Today every active
  // Shopee offer is eligible for every authenticated publisher.
  void args.publisherId;

  const listActiveOffers =
    args.dependencies?.listActiveOffers ??
    defaultListActiveShopeeOffers;

  const offers = await listActiveOffers();

  if (offers.length === 0) {
    return { kind: "unavailable", reason: "no_active_offer" };
  }

  const sorted = sortActiveShopeeOffersByOfferId(offers);
  const canonical = sorted[0];

  if (!canonical) {
    // Defensive: the length check above already proves this is
    // unreachable, but TypeScript cannot narrow the noUncheckedIndexedAccess
    // shape here.
    return { kind: "unavailable", reason: "no_active_offer" };
  }

  return {
    kind: "available",
    offerId: canonical.offerId,
    campaignId: canonical.campaignId,
    cashbackShareBps: canonical.cashbackShareBps,
  };
}
