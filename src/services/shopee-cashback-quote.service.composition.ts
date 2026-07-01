/**
 * Pure factory that builds the Shopee cashback quote dependency bundle.
 *
 * This factory is intentionally server-only-free: it accepts every
 * dependency as a parameter so the unit test can wire fakes and assert
 * that the resulting object is structurally complete. The server-only
 * wrapper ({@link ./shopee-cashback-quote.service.server) supplies the real
 * production dependencies.
 *
 * The composition is intentionally a plain object literal so:
 *
 *   - tests can import it and assert that no field is missing;
 *   - production callers never need to know the shape - they only call
 *     {@link resolveShopeeProductPreview} from the server-only wrapper;
 *   - a future phase can swap one field (e.g. a different clock) without
 *     touching the rest of the dependency graph.
 */
import {
  calculateCashbackAllocation,
} from "@/lib/cashback/cashback-policy";
import type { ShopeeProductMetadataProvider } from "@/lib/shopee/product-metadata/types";

import type { ResolveShopeeDependencies } from "./shopee-cashback-quote.service";
import type {
  ShopeeOfferSelector,
} from "./shopee-offer-selector";

export interface BuildProductionDependenciesInputs {
  resolveUrl: ResolveShopeeDependencies["resolveUrl"];
  metadataProvider: ShopeeProductMetadataProvider;
  offerSelector: ShopeeOfferSelector;
  calculateAllocation?: ResolveShopeeDependencies["calculateAllocation"];
  now?: ResolveShopeeDependencies["now"];
}

/**
 * Builds the dependency object consumed by
 * `resolveShopeeProductPreviewWithDeps`.
 *
 * The function takes the canonical production dependencies as parameters
 * so unit tests can exercise the same composition logic with fake
 * dependencies - without importing any server-only module.
 *
 * The composition guarantees:
 *
 *   - every required dependency is wired;
 *   - the canonical cashback allocation function is the default;
 *   - `now` defaults to a fresh `Date` per call.
 */
export function buildProductionShopeeProductPreviewDependencies(
  inputs: BuildProductionDependenciesInputs,
): ResolveShopeeDependencies {
  return {
    resolveUrl: inputs.resolveUrl,
    metadataProvider: inputs.metadataProvider,
    offerSelector: inputs.offerSelector,
    calculateAllocation:
      inputs.calculateAllocation ?? calculateCashbackAllocation,
    now: inputs.now ?? (() => new Date()),
  };
}
