/**
 * Server-only HTTP client and primary provider for the Unikorn Product Data API.
 *
 * Phase 20H.4 -- this module combines the HTTP client with response validation
 * and exposes the production primary provider. Import "server-only" prevents
 * bundling into Client Components.
 *
 * Production dependency path:
 *   provider.server.ts
 *   -> unikorn-client.server.ts (contains server-only)
 *   -> unikorn-client.ts (pure core, no server-only)
 */

import "server-only";

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import { parseUnikornProductDataResponse } from "./unikorn-response";
import { createUnikornProductDataClient } from "./unikorn-client";
import type { ShopeeProductMetadata } from "./types";

export type { UnikornApiFetchLike } from "./unikorn-client";

const fetchUnikornRaw = createUnikornProductDataClient({ fetchImpl: fetch });

/**
 * Primary metadata provider: fetches from the Unikorn API and validates
 * the response into typed ShopeeProductMetadata.
 *
 * @param identity - An already-resolved Shopee product identity.
 * @returns Validated product metadata.
 * @throws ShopeeProductMetadataError on network failure, HTTP errors, or
 *   invalid/unsafe response data.
 */
export async function fetchUnikornProductMetadata(
  identity: ShopeeProductIdentity,
): Promise<ShopeeProductMetadata> {
  const rawResponse = await fetchUnikornRaw(identity);
  return parseUnikornProductDataResponse(rawResponse, identity);
}
