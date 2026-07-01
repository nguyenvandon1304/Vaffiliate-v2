/**
 * Server-only entry point for the Shopee product metadata provider.
 *
 * Importing this module triggers the `server-only` guard so that the
 * provider can never end up in a Client Component bundle. The actual
 * network fetch + safety controls live in the sibling `provider-impl`
 * module which deliberately omits the guard so it can be unit-tested
 * under `node --test`.
 */
import "server-only";

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";

import {
  fetchMetadataForIdentity,
  productionFetch,
  shopeeProductMetadataProvider,
  type ShopeeProductMetadataFetchLike,
} from "./provider-impl";
import type { ShopeeProductMetadata } from "./types";

export {
  shopeeProductMetadataProvider,
  type ShopeeProductMetadataFetchLike,
};

export async function fetchShopeeProductMetadataFromUrl(
  productUrl: string,
  fetchImpl?: ShopeeProductMetadataFetchLike,
): Promise<ShopeeProductMetadata> {
  // Accept either a canonical Shopee product URL (legacy callers) or
  // an already-resolved identity. We delegate the heavy lifting
  // (network + redirect + safety) to the server-only helper.
  const mod = await import("@/lib/shopee/product-url");
  const identity: ShopeeProductIdentity =
    await mod.resolveShopeeProductUrl(productUrl);
  return await fetchMetadataForIdentity(
    identity,
    fetchImpl ?? productionFetch,
  );
}