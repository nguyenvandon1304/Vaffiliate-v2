/**
 * Pure factory for the legacy `fetchShopeeProductMetadataFromUrl` wrapper.
 *
 * This module is dependency-injected: it does NOT import any server-only
 * module, the secured Shopee URL resolver, the production provider chain,
 * the Unikorn server wrapper, or any other server-side module. It only
 * declares the contract that production composition must satisfy.
 *
 * Production composition lives in `./provider.server.ts`, which is the
 * only module that wires the canonical production dependencies:
 *
 *   resolveProductUrl: resolveShopeeProductUrl from @/lib/shopee/product-url
 *   fetchDefaultMetadata: fetchMetadataForIdentity (production chain)
 *   fetchHtmlMetadata: fetchMetadataForIdentityFromHtml
 *
 * Unit tests import this factory directly and inject deterministic
 * functions for each dependency.
 */

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import type { ShopeeProductMetadata } from "./types";
import type { ShopeeProductMetadataFetchLike } from "./provider-impl";

export interface LegacyMetadataWrapperDeps {
  readonly resolveProductUrl: (
    productUrl: string,
  ) => Promise<ShopeeProductIdentity>;

  readonly fetchDefaultMetadata: (
    identity: ShopeeProductIdentity,
  ) => Promise<ShopeeProductMetadata>;

  readonly fetchHtmlMetadata: (
    identity: ShopeeProductIdentity,
    fetchImpl: ShopeeProductMetadataFetchLike,
  ) => Promise<ShopeeProductMetadata>;
}

export type FetchShopeeProductMetadataFromUrlFn = (
  productUrl: string,
  fetchImpl?: ShopeeProductMetadataFetchLike,
) => Promise<ShopeeProductMetadata>;

/**
 * Build the legacy `fetchShopeeProductMetadataFromUrl` wrapper from a
 * pure dependency bundle.
 *
 * Behavior:
 *
 * - The user-supplied `productUrl` is passed to `resolveProductUrl` first.
 *   That function handles both direct canonical Shopee product URLs and
 *   short links (`s.shopee.vn`, `s.shopee.com`) through the secured
 *   redirect resolver. Hostile redirect targets are rejected by that
 *   resolver.
 * - When `fetchImpl` is supplied, the resolved identity is forwarded to
 *   `fetchHtmlMetadata` with the injected fetch. The default provider is
 *   NOT called in this branch, so no live Unikorn request is issued.
 * - When `fetchImpl` is omitted, the resolved identity is forwarded to
 *   `fetchDefaultMetadata`, which is the production provider chain in
 *   production composition.
 *
 * The returned function is referentially transparent with respect to its
 * dependencies. There is no module-level state.
 */
export function createFetchShopeeProductMetadataFromUrl(
  deps: LegacyMetadataWrapperDeps,
): FetchShopeeProductMetadataFromUrlFn {
  return async function fetchShopeeProductMetadataFromUrl(
    productUrl: string,
    fetchImpl?: ShopeeProductMetadataFetchLike,
  ): Promise<ShopeeProductMetadata> {
    const identity: ShopeeProductIdentity = await deps.resolveProductUrl(productUrl);

    if (fetchImpl !== undefined) {
      return await deps.fetchHtmlMetadata(identity, fetchImpl);
    }

    return await deps.fetchDefaultMetadata(identity);
  };
}
