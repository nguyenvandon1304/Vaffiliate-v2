/**
 * Server-only entry point for the Shopee product metadata provider.
 *
 * Phase 20H.4 -- the provider chain uses the Unikorn Product Data API
 * as the primary metadata source with the existing HTML provider as
 * fallback.
 *
 * Importing this module triggers the `server-only` guard so that the
 * provider can never end up in a Client Component bundle.
 *
 * This file is the ONLY place where the production provider chain is
 * composed and the only place where the secured Shopee URL resolver is
 * imported. The legacy `fetchShopeeProductMetadataFromUrl` wrapper is
 * composed here through the pure factory exported by
 * `./provider-legacy-wrapper.ts`; that factory file does not pull in any
 * server-only module on its own.
 *
 * Production dependency path:
 *   provider.server.ts
 *   -> resolveShopeeProductUrl from @/lib/shopee/product-url (secured)
 *   -> unikorn-client.server.ts (server-only, primary provider)
 *   -> unikorn-client.ts (pure core)
 *   -> provider-impl.ts (HTML fallback)
 *   -> provider-chain.ts (pure chain logic)
 *
 * Public exports preserved from the Phase 20H.2 baseline:
 *   - shopeeProductMetadataProvider
 *   - fetchMetadataForIdentity
 *   - ShopeeProductMetadataFetchLike
 *   - fetchShopeeProductMetadataFromUrl
 */
import "server-only";

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import { resolveShopeeProductUrl } from "@/lib/shopee/product-url";

import { fetchUnikornProductMetadata } from "./unikorn-client.server";
import {
  createShopeeProductMetadataProviderChain,
  type ShopeeMetadataProvider,
} from "./provider-chain";
import type {
  ShopeeProductMetadata,
  ShopeeProductMetadataProvider,
} from "./types";
import {
  fetchMetadataForIdentity as fetchMetadataForIdentityFromHtml,
  productionFetch as htmlProductionFetch,
  type ShopeeProductMetadataFetchLike,
} from "./provider-impl";
import { createFetchShopeeProductMetadataFromUrl } from "./provider-legacy-wrapper";

export type { ShopeeMetadataProvider, ShopeeProductMetadataFetchLike };

// Cached production provider chain.
// This is the single production provider-chain composition in the
// Phase 20H.4 code. The legacy wrapper composes the chain indirectly
// through `fetchMetadataForIdentity`, which delegates to the same
// instance below.
let _productionChain: ShopeeMetadataProvider | null = null;

async function getProductionChain(): Promise<ShopeeMetadataProvider> {
  if (!_productionChain) {
    const fallbackProvider: ShopeeMetadataProvider = async (identity) =>
      await fetchMetadataForIdentityFromHtml(identity, htmlProductionFetch);

    _productionChain = createShopeeProductMetadataProviderChain({
      primaryProvider: fetchUnikornProductMetadata,
      fallbackProvider,
    });
  }
  return _productionChain;
}

/**
 * Production metadata provider that tries the Unikorn API first and falls
 * back to the HTML provider on failure.
 *
 * This conforms to the ShopeeProductMetadataProvider interface with a
 * getProduct method, matching the contract expected by the quote service.
 */
export const shopeeProductMetadataProvider: ShopeeProductMetadataProvider = {
  async getProduct(
    identity: ShopeeProductIdentity,
  ): Promise<ShopeeProductMetadata> {
    const chain = await getProductionChain();
    return await chain(identity);
  },
};

/**
 * Fetch product metadata for a resolved Shopee product identity.
 *
 * Uses the provider chain: Unikorn Product Data API (primary) -> HTML provider (fallback).
 *
 * @param identity - An already-resolved Shopee product identity.
 * @returns Typed product metadata.
 * @throws ShopeeProductMetadataError on provider failure.
 */
export async function fetchMetadataForIdentity(
  identity: ShopeeProductIdentity,
): Promise<ShopeeProductMetadata> {
  return await shopeeProductMetadataProvider.getProduct(identity);
}

/**
 * Legacy entry point: resolve a productUrl and fetch metadata.
 *
 * - URL resolution is delegated to the secured Shopee URL resolver
 *   (`resolveShopeeProductUrl` from `@/lib/shopee/product-url`). That
 *   resolver accepts both direct canonical Shopee product URLs and
 *   short links (`s.shopee.vn`) by following redirects through a
 *   network fetch. Hostile redirect targets are rejected by the
 *   resolver.
 * - When fetchImpl is omitted, the production provider chain is used
 *   through `fetchMetadataForIdentity`.
 * - When fetchImpl is explicitly supplied, the call is restricted to
 *   the HTML provider implementation with the injected fetch. No live
 *   Unikorn request is issued in this branch.
 */
export const fetchShopeeProductMetadataFromUrl =
  createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: resolveShopeeProductUrl,
    fetchDefaultMetadata: fetchMetadataForIdentity,
    fetchHtmlMetadata: fetchMetadataForIdentityFromHtml,
  });
