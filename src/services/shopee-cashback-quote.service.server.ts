/**
 * Server-only production wiring for the Shopee cashback quote service.
 *
 * The pure orchestration layer lives in
 * {@link ./shopee-cashback-quote.service} and exposes the dependency-injected
 * `*WithDeps` entry points. This module:
 *
 *   1. adds the `server-only` guard so the dependency bundle never reaches
 *      a Client Component bundle;
 *   2. composes the production dependencies through
 *      {@link ./shopee-cashback-quote.service.composition};
 *   3. exposes the production `resolveShopeeProductPreview` entry point so
 *      Server Actions do NOT need to know how the service is wired.
 *
 * No service container, no DI framework, no plugin registry — just a
 * thin wrapper that adds the `server-only` guard on top of the pure
 * composition helper. Unit tests import the composition helper directly
 * (without triggering the guard) and assert that the production wiring
 * always provides a fully-populated dependency bundle.
 */
import "server-only";

import { resolveShopeeProductUrl } from "@/lib/shopee/product-url";
import { shopeeProductMetadataProvider } from "@/lib/shopee/product-metadata/provider.server";

import { resolveShopeeProductPreviewWithDeps } from "./shopee-cashback-quote.service";
import { buildProductionShopeeProductPreviewDependencies } from "./shopee-cashback-quote.service.composition";
import { createShopeeOfferSelector } from "./shopee-offer-selector.factory";
import { createShopeeCatalogRepository } from "./shopee-catalog-repository.factory";

export {
  buildProductionShopeeProductPreviewDependencies,
  type BuildProductionDependenciesInputs,
} from "./shopee-cashback-quote.service.composition";

export type {
  ResolveShopeeInput,
  ResolveShopeeDependencies,
} from "./shopee-cashback-quote.service";

export type {
  ProductResolutionFailureCode,
  QuoteUnavailableReason,
  ShopeeCashbackQuote,
  ShopeeCashbackQuoteFailure,
  ShopeeCashbackQuoteFailureCode,
  ShopeeCashbackQuoteResult,
  ShopeeCashbackQuoteSuccess,
  ShopeeProductMetadataAvailableQuote,
  ShopeeProductMetadataUnavailableQuote,
  ShopeeProductMetadataQuote,
  ShopeeProductMetadataView,
  ShopeeProductPreviewFailure,
  ShopeeProductPreviewResult,
  ShopeeProductPreviewSuccess,
} from "./shopee-cashback-quote.types";

export type {
  ShopeeCatalogRepository,
  ShopeeCatalogRepositoryOffer,
  ShopeeOfferSelector,
  ShopeeOfferSelectorInput,
  ShopeeOfferSelectorOffer,
  ShopeeOfferSelectionOutcome,
} from "./shopee-offer-selector";

/**
 * Production dependency bundle consumed by the pure service.
 *
 * `offerSelector` is built once at module load from the canonical
 * Drizzle-backed Shopee catalog repository. The selector itself rejects
 * any attempt to claim eligibility without explicit product/shop/category
 * evidence — it returns `eligibility_unknown` for every product until the
 * catalog schema records a mapping. The service therefore never falls
 * back to a fabricated offer.
 */
export const productionShopeeProductPreviewDependencies = buildProductionShopeeProductPreviewDependencies(
  {
    resolveUrl: async (input: unknown) =>
      await resolveShopeeProductUrl(String(input)),
    metadataProvider: shopeeProductMetadataProvider,
    offerSelector: createShopeeOfferSelector(createShopeeCatalogRepository()),
  },
);

/**
 * Production product-preview entry point used by Server Actions.
 *
 * Always composes the full production dependency bundle. There is no
 * Server Action code path that bypasses this wrapper.
 */
export async function resolveShopeeProductPreview(
  input: import("./shopee-cashback-quote.service").ResolveShopeeInput,
): Promise<
  import("./shopee-cashback-quote.types").ShopeeProductPreviewResult
> {
  return await resolveShopeeProductPreviewWithDeps(
    input,
    productionShopeeProductPreviewDependencies,
  );
}