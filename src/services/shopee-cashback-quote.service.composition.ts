/**
 * Pure factory that builds the Shopee cashback quote dependency bundle.
 *
 * This factory is intentionally server-only-free: it accepts every
 * dependency as a parameter so the unit test can wire fakes and assert
 * that the resulting object is structurally complete. The server-only
 * wrapper ({@link ./shopee-cashback-quote.service.server) supplies the
 * real production dependencies.
 *
 * The composition is intentionally a plain object literal so:
 *
 *   - tests can import it and assert that no field is missing;
 *   - production callers never need to know the shape - they only
 *     call {@link resolveShopeeProductPreview} from the server-only
 *     wrapper;
 *   - a future phase can swap one field (e.g. a different clock)
 *     without touching the rest of the dependency graph.
 *
 * Phase 20H.3d -- `lookupFixtureCommissionRateBps` is an OPTIONAL
 * identity-aware commission-rate source plumbed through to the offer
 * selector factory. Production callers pass
 * `lookupDevelopmentShopeeCommissionRateBps`; tests omit the field
 * to exercise the existing strict selector behaviour.
 */
import {
  calculateCashbackAllocation,
} from "@/lib/cashback/cashback-policy";
import type { ShopeeProductMetadataProvider } from "@/lib/shopee/product-metadata/types";

import type { ResolveShopeeDependencies } from "./shopee-cashback-quote.service";
import type { ShopeeOfferSelector } from "./shopee-offer-selector";

export interface BuildProductionDependenciesInputs {
  resolveUrl: ResolveShopeeDependencies["resolveUrl"];
  metadataProvider: ShopeeProductMetadataProvider;
  offerSelector: ShopeeOfferSelector;
  /**
   * Optional identity-aware fixture lookup consulted by the offer
   * selector as a last-resort fallback when no catalog row matches
   * the resolved (shopId, itemId) and the catalog contains exactly
   * one policy-bearing offer. Production wiring supplies the
   * dev/test commission rate fixture; tests leave this unset.
   */
  lookupFixtureCommissionRateBps?: ResolveShopeeDependencies["lookupFixtureCommissionRateBps"];
  calculateAllocation?: ResolveShopeeDependencies["calculateAllocation"];
  now?: ResolveShopeeDependencies["now"];
  /**
   * Phase 20H.3f (correction pass: API-first precedence) -- the
   * Unikorn commission provider is the PRIMARY source of the
   * network commission in the preview quote path. When this field
   * is configured, the service consults the provider BEFORE the
   * offer selector / catalog / fixture path. A successful response
   * short-circuits the rest of the pipeline; a missing provider,
   * network failure, timeout, or invalid commission value silently
   * falls back to the offer-selector + catalog/fixture path.
   *
   * Production wiring supplies the server-only Unikorn commission
   * client. Tests can omit the field to exercise the
   * offer-selector-only path (e.g. the canonical fixture regression
   * test) or supply a fake provider to exercise the API-first path.
   */
  unikornCommissionProvider?: ResolveShopeeDependencies["unikornCommissionProvider"];
}

/**
 * Builds the dependency object consumed by
 * `resolveShopeeProductPreviewWithDeps`.
 *
 * The function takes the canonical production dependencies as
 * parameters so unit tests can exercise the same composition logic
 * with fake dependencies - without importing any server-only module.
 *
 * The composition guarantees:
 *
 *   - every required dependency is wired;
 *   - the canonical cashback allocation function is the default;
 *   - `now` defaults to a fresh `Date` per call;
 *   - the optional identity-aware fixture lookup is forwarded
 *     verbatim (or omitted) so the service can hand it to the offer
 *     selector factory on lazy composition;
 *   - the optional Unikorn commission provider is forwarded verbatim
 *     so the production wiring can opt into API-first precedence
 *     without losing the offer-selector + catalog/fixture fallback.
 */
export function buildProductionShopeeProductPreviewDependencies(
  inputs: BuildProductionDependenciesInputs,
): ResolveShopeeDependencies {
  return {
    resolveUrl: inputs.resolveUrl,
    metadataProvider: inputs.metadataProvider,
    offerSelector: inputs.offerSelector,
    lookupFixtureCommissionRateBps: inputs.lookupFixtureCommissionRateBps,
    calculateAllocation:
      inputs.calculateAllocation ?? calculateCashbackAllocation,
    now: inputs.now ?? (() => new Date()),
    unikornCommissionProvider: inputs.unikornCommissionProvider,
  };
}
