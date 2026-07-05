/**
 * Phase 20H.3f -- Server-only entry point for the Unikorn Shopee
 * commission client.
 *
 * The pure HTTP / normalization logic lives in
 * `./unikorn-commission-client.ts`. This module is the production
 * wrapper that:
 *
 *   1. Marks the dependency graph with the `server-only` guard so the
 *      client can never end up in a Client Component bundle.
 *   2. Reads the optional
 *      `SHOPEE_PRODUCT_DATA_API_BASE_URL` env var, defaulting to the
 *      documented public endpoint.
 *   3. Composes a singleton commission quote fetcher with the real
 *      global `fetch` so callers can request a normalized commission
 *      value for a resolved Shopee identity.
 *
 * The fetcher is intentionally dependency-style:
 *
 *   fetchUnikornCommissionQuote({ itemId?, canonicalUrl? })
 *
 * either `itemId` or `canonicalUrl` MUST be provided. The
 * normalization layer rejects any API response that lacks a valid
 * `productInfo.commission`. Failure is always thrown as a
 * `ShopeeUnikornCommissionError`; the caller is responsible for
 * mapping the failure into a buyer-safe unavailable quote.
 */
import "server-only";

import {
  createUnikornCommissionClient,
  UNIKORN_API_BASE_FALLBACK,
} from "./unikorn-commission-client";
import type {
  ShopeeUnikornCommissionQuote,
  ShopeeUnikornCommissionProvider,
  UnikornCommissionRequest,
} from "./unikorn-commission-client";

export type {
  ShopeeUnikornCommissionQuote,
  ShopeeUnikornCommissionFailureCode,
  ShopeeUnikornCommissionError,
  ShopeeUnikornCommissionProvider,
  UnikornCommissionRequest,
  UnikornApiFetchLike,
} from "./unikorn-commission-client";

/**
 * Resolved Unikorn Shopee commission quote fetcher.
 *
 * Returns the normalized VND commission amount plus optional
 * audit-only fields. Throws `ShopeeUnikornCommissionError` on any
 * network / validation failure; the cashback quote service maps the
 * failure to a buyer-safe unavailable quote.
 */
export async function fetchUnikornCommissionQuote(
  request: UnikornCommissionRequest,
): Promise<ShopeeUnikornCommissionQuote> {
  return await getUnikornCommissionClient()(request);
}

let _client: ReturnType<typeof createUnikornCommissionClient> | null = null;

function getUnikornCommissionClient(): ReturnType<
  typeof createUnikornCommissionClient
> {
  if (!_client) {
    const baseUrl =
      typeof process.env.SHOPEE_PRODUCT_DATA_API_BASE_URL === "string" &&
      process.env.SHOPEE_PRODUCT_DATA_API_BASE_URL.length > 0
        ? process.env.SHOPEE_PRODUCT_DATA_API_BASE_URL
        : UNIKORN_API_BASE_FALLBACK;

    _client = createUnikornCommissionClient({
      fetchImpl: (input, init) => fetch(input, init),
      baseUrl,
    });
  }
  return _client;
}

/**
 * Phase 20H.3f -- server-side factory that exposes the production
 * Unikorn commission provider to the cashback quote service
 * composition. The provider is a function (not a class) so the
 * service module can stay framework-agnostic.
 */
export function createShopeeUnikornCommissionProvider(): ShopeeUnikornCommissionProvider {
  const client = getUnikornCommissionClient();
  return async (request: UnikornCommissionRequest): Promise<ShopeeUnikornCommissionQuote> => {
    return await client(request);
  };
}
