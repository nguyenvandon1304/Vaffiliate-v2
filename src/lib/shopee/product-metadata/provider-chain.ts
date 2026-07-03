/**
 * Shopee product metadata provider chain for Phase 20H.4.
 *
 * This module orchestrates the primary (Unikorn Product Data API) and
 * fallback (existing secured HTML provider) metadata providers.
 *
 * Chain behavior:
 *
 *   1. Call primary provider with resolved identity.
 *   2. If primary returns valid metadata, return it.
 *   3. If primary times out, rate-limits, returns invalid JSON/schema,
 *      non-2xx, fallback data, or network failure, call the HTML fallback.
 *   4. If HTML succeeds, return HTML metadata.
 *   5. If both providers fail, preserve existing typed failure behavior.
 *
 * Design rules:
 *
 *   1. This module does NOT import server-only, ./unikorn-client, or ./unikorn-client.server.
 *   2. The primary and fallback providers are dependency-injected.
 *   3. The chain itself is pure and testable.
 *   4. Providers are called sequentially, not concurrently.
 *   5. Third-party commission fields are never used for cashback.
 *   6. HTML provider SSRF, redirect, timeout, content-type, and body-size
 *      protections are preserved unchanged.
 *   7. canonicalUrl always comes from the resolved identity, never from
 *      the third-party response.
 */

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import { ShopeeProductMetadataError } from "./provider.errors";
import type { ShopeeProductMetadata } from "./types";

// %%% Provider type %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

/**
 * A single metadata provider that takes a resolved identity and returns
 * either valid metadata or throws a typed error.
 */
export type ShopeeMetadataProvider = (
  identity: ShopeeProductIdentity,
) => Promise<ShopeeProductMetadata>;

// %%% Provider chain factory %%%

/**
 * Error codes that indicate the primary provider failed and the chain
 * should attempt the fallback provider.
 */
const FALLBACK_ELIGIBLE_CODES: ReadonlySet<string> = new Set([
  "metadata_unavailable",
  "metadata_incomplete",
  "provider_timeout",
  "provider_response_invalid",
  "non_2xx_response",
  "unexpected_content_type",
  "body_too_large",
  "redirect_failed",
]);

function isFallbackEligible(error: unknown): boolean {
  if (error instanceof ShopeeProductMetadataError) {
    return FALLBACK_ELIGIBLE_CODES.has(error.code);
  }
  // Raw AbortError from fetch (not wrapped in ShopeeProductMetadataError)
  // should also trigger fallback.
  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  return false;
}

/**
 * Dependencies for the metadata provider chain.
 */
export interface ShopeeMetadataProviderChainDeps {
  readonly primaryProvider: ShopeeMetadataProvider;
  readonly fallbackProvider: ShopeeMetadataProvider;
}

/**
 * Creates a metadata provider that tries the primary provider first
 * and falls back to the HTML provider on failure.
 *
 * @param deps - The primary and fallback providers (dependency injection).
 * @returns A composed provider that implements the chain logic.
 */
export function createShopeeProductMetadataProviderChain(
  deps: ShopeeMetadataProviderChainDeps,
): ShopeeMetadataProvider {
  return async (identity) => {
    try {
      return await deps.primaryProvider(identity);
    } catch (primaryError) {
      if (!isFallbackEligible(primaryError)) {
        throw primaryError;
      }
    }

    try {
      return await deps.fallbackProvider(identity);
    } catch (fallbackError) {
      if (fallbackError instanceof ShopeeProductMetadataError) {
        throw fallbackError;
      }
      throw new ShopeeProductMetadataError(
        "metadata_unavailable",
        "Both primary and fallback providers failed",
      );
    }
  };
}
