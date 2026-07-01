import "server-only";

import {
  DEFAULT_SHOPEE_PRODUCT_URL_REDIRECT_LOOP_OPTIONS,
  parseShopeeProductUrl,
  runShopeeProductUrlRedirectLoop,
  ShopeeProductUrlFetchLike,
  ShopeeProductUrlParseError,
  ShopeeProductUrlRedirectError,
  type ShopeeProductUrlRedirectLoopOptions,
  type ShopeeProductUrlResolution,
} from "./product-url-parser";

const RESOLVE_TIMEOUT_MS = 8000;

const SHORT_LINK_HOSTS = new Set([
  "s.shopee.vn",
]);

export type ShopeeProductUrlErrorCode =
  | "invalid_url"
  | "unsupported_host"
  | "not_product_url"
  | "redirect_failed"
  | "too_many_redirects";

export class ShopeeProductUrlError extends Error {
  readonly code: ShopeeProductUrlErrorCode;

  constructor(
    code: ShopeeProductUrlErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ShopeeProductUrlError";
    this.code = code;
  }
}

export type { ShopeeProductIdentity } from "./product-identity";
import type { ShopeeProductIdentity } from "./product-identity";

function isShortLinkHost(hostname: string): boolean {
  return SHORT_LINK_HOSTS.has(hostname);
}

function mapRedirectError(error: ShopeeProductUrlRedirectError): never {
  switch (error.code) {
    case "not_product_url":
      throw new ShopeeProductUrlError(
        "not_product_url",
        "URL is not a supported Shopee product URL",
      );
    case "redirect_failed":
      throw new ShopeeProductUrlError(
        "redirect_failed",
        "Shopee URL redirect could not be resolved",
      );
    case "too_many_redirects":
      throw new ShopeeProductUrlError(
        "too_many_redirects",
        "Shopee URL exceeded the redirect limit",
      );
  }
}

function mapParseError(error: unknown): never {
  if (error instanceof ShopeeProductUrlRedirectError) {
    mapRedirectError(error);
  }
  if (error instanceof ShopeeProductUrlParseError) {
    switch (error.code) {
      case "invalid_input":
      case "invalid_url":
      case "oversized_url":
      case "unsupported_scheme":
      case "credentials_not_allowed":
      case "unexpected_port":
        throw new ShopeeProductUrlError(
          "invalid_url",
          "Shopee product URL is invalid",
        );
      case "unsupported_host":
        throw new ShopeeProductUrlError(
          "unsupported_host",
          "URL does not belong to an allowed Shopee host",
        );
      case "not_product_path":
      case "missing_identifier":
      case "invalid_identifier":
        throw new ShopeeProductUrlError(
          "not_product_url",
          "URL is not a supported Shopee product URL",
        );
      case "unsupported_short_link":
        throw new ShopeeProductUrlError(
          "redirect_failed",
          "Shopee short link could not be resolved",
        );
    }
  }
  throw new ShopeeProductUrlError(
    "invalid_url",
    "Shopee product URL is invalid",
  );
}

function buildIdentity(
  resolution: ShopeeProductUrlResolution,
): ShopeeProductIdentity {
  return {
    shopId: resolution.shopId,
    itemId: resolution.itemId,
    canonicalUrl: resolution.canonicalUrl,
  };
}

const productionFetch: ShopeeProductUrlFetchLike = async (input) => {
  return await fetch(input, {
    method: "GET",
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; Vaffiliate/1.0)",
    },
  });
};

async function resolveViaRedirectLoop(
  startingUrl: URL,
  fetchImpl: ShopeeProductUrlFetchLike,
  options: ShopeeProductUrlRedirectLoopOptions,
): Promise<ShopeeProductIdentity> {
  try {
    const resolution = await runShopeeProductUrlRedirectLoop(
      startingUrl,
      fetchImpl,
      options,
    );
    return buildIdentity(resolution);
  } catch (error) {
    mapParseError(error);
  }
}

/**
 * Resolve a Shopee product URL to a product identity.
 *
 * This is the production resolver. It delegates ALL URL parsing, validation,
 * extraction, and canonicalization to the pure {@link parseShopeeProductUrl}
 * function, and delegates the redirect-following loop to the pure
 * {@link runShopeeProductUrlRedirectLoop} helper. This module only adds:
 *
 * - Network resolution of short links via `s.shopee.vn` redirects
 * - Mapping of pure-parser and pure-helper typed errors to the production
 *   error envelope
 * - Production fetch wiring (timeout, headers, cache)
 *
 * Both direct (non-short) inputs and post-redirect URLs run through the same
 * pure parser, so there is exactly one source of truth for URL parsing
 * logic. The redirect loop additionally accepts any of the four
 * "continueable" parse error codes
 * (`unsupported_short_link`, `not_product_path`, `missing_identifier`,
 * `invalid_identifier`) as a signal to keep chasing the next hop, so a
 * chain such as `s.shopee.vn` -> `shopee.vn/intermediate` -> product URL
 * still resolves. Direct user input does NOT use the continueable rule:
 * only the first parse is allowed to feed the redirect loop.
 */
export async function resolveShopeeProductUrl(
  value: string,
): Promise<ShopeeProductIdentity> {
  try {
    const resolution = parseShopeeProductUrl(value);
    return buildIdentity(resolution);
  } catch (error) {
    if (
      !(error instanceof ShopeeProductUrlParseError)
    ) {
      throw new ShopeeProductUrlError(
        "invalid_url",
        "Shopee product URL is invalid",
      );
    }
    if (error.code !== "unsupported_short_link") {
      mapParseError(error);
    }
  }

  let startingUrl: URL;
  try {
    startingUrl = new URL(value);
  } catch {
    throw new ShopeeProductUrlError(
      "invalid_url",
      "Shopee product URL is invalid",
    );
  }

  if (!isShortLinkHost(startingUrl.hostname.toLowerCase())) {
    throw new ShopeeProductUrlError(
      "not_product_url",
      "URL is not a supported Shopee product URL",
    );
  }

  return await resolveViaRedirectLoop(
    startingUrl,
    productionFetch,
    DEFAULT_SHOPEE_PRODUCT_URL_REDIRECT_LOOP_OPTIONS,
  );
}
