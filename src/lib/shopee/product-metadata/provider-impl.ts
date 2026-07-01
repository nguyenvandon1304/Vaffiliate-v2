/**
 * Server-only Shopee product metadata provider.
 *
 * Phase 20H.2 -- the provider fetches the canonical Shopee product
 * page server-side and feeds the raw HTML through the pure
 * extractShopeeProductMetadataFromHtml function.
 *
 * This file deliberately omits the `import "server-only"` guard so
 * it can be unit-tested under `node --test`. Production consumers
 * MUST import through `./provider.server` which adds the guard.
 */

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";

import { extractShopeeProductMetadataFromHtml } from "./extractor";
import { ShopeeProductMetadataError } from "./provider.errors";
import type {
  ShopeeProductMetadata,
  ShopeeProductMetadataProvider,
} from "./types";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1_000_000;

const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "shopee.vn",
  "www.shopee.vn",
]);

const ACCEPTED_CONTENT_TYPES: ReadonlyArray<string> = [
  "text/html",
  "application/xhtml+xml",
];

export type ShopeeProductMetadataFetchLike = (
  input: URL,
  init: RequestInit,
) => Promise<Response>;

const productionFetch: ShopeeProductMetadataFetchLike =
  async (input, init) => {
    return await fetch(input, init);
  };

function isAllowedHostname(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase().replace(/\.$/, "");
  return ALLOWED_HOSTS.has(lower);
}

function assertHttps(url: URL): void {
  if (url.protocol !== "https:") {
    throw new ShopeeProductMetadataError(
      "metadata_unavailable",
      "Shopee metadata fetch must use HTTPS",
    );
  }
  if (url.username || url.password) {
    throw new ShopeeProductMetadataError(
      "metadata_unavailable",
      "Shopee metadata fetch must not include credentials",
    );
  }
  if (url.port && url.port !== "443" && url.port !== "") {
    throw new ShopeeProductMetadataError(
      "metadata_unavailable",
      "Shopee metadata fetch must not declare an unexpected port",
    );
  }
  if (!isAllowedHostname(url.hostname)) {
    throw new ShopeeProductMetadataError(
      "metadata_unavailable",
      "Shopee metadata fetch host is not on the allowlist",
    );
  }
}

function isAcceptedContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const base = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return ACCEPTED_CONTENT_TYPES.some(
    (allowed) => base === allowed || base.startsWith(`${allowed}/`),
  );
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    received += value.byteLength;
    if (received > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      throw new ShopeeProductMetadataError(
        "body_too_large",
        "Shopee metadata response exceeded the size limit",
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

async function fetchHtmlFromUrl(
  url: URL,
  fetchImpl: ShopeeProductMetadataFetchLike,
): Promise<string> {
  let currentUrl = url;
  assertHttps(currentUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
          "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (compatible; Vaffiliate/1.0; +https://vaffiliate.local)",
        },
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new ShopeeProductMetadataError(
          "provider_timeout",
          "Shopee metadata request timed out",
        );
      }
      throw new ShopeeProductMetadataError(
        "metadata_unavailable",
        "Shopee metadata request failed",
      );
    }

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.status !== 304
    ) {
      if (hop === MAX_REDIRECTS) {
        try {
          await response.body?.cancel();
        } catch {
          // ignore
        }
        throw new ShopeeProductMetadataError(
          "too_many_redirects",
          "Shopee metadata fetch exceeded the redirect limit",
        );
      }
      const location = response.headers.get("location");
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      if (!location) {
        throw new ShopeeProductMetadataError(
          "redirect_failed",
          "Shopee metadata redirect did not include a location header",
        );
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new ShopeeProductMetadataError(
          "redirect_failed",
          "Shopee metadata redirect target is not a valid URL",
        );
      }
      try {
        assertHttps(nextUrl);
      } catch {
        throw new ShopeeProductMetadataError(
          "redirect_to_hostile_target",
          "Shopee metadata redirected to a host outside the allowlist",
        );
      }
      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      if (response.status === 404 || response.status === 410) {
        throw new ShopeeProductMetadataError(
          "product_not_found",
          `Shopee product not found: HTTP ${response.status}`,
        );
      }
      throw new ShopeeProductMetadataError(
        "non_2xx_response",
        `Shopee metadata fetch returned HTTP ${response.status}`,
      );
    }

    const contentType = response.headers.get("content-type");
    if (!isAcceptedContentType(contentType)) {
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      throw new ShopeeProductMetadataError(
        "unexpected_content_type",
        "Shopee metadata response had an unexpected content type",
      );
    }

    return await readBoundedBody(response, MAX_RESPONSE_BYTES);
  }

  throw new ShopeeProductMetadataError(
    "too_many_redirects",
    "Shopee metadata fetch exceeded the redirect limit",
  );
}

async function fetchMetadataForIdentity(
  identity: ShopeeProductIdentity,
  fetchImpl: ShopeeProductMetadataFetchLike,
): Promise<ShopeeProductMetadata> {
  const url = new URL(identity.canonicalUrl);
  const html = await fetchHtmlFromUrl(url, fetchImpl);
  return extractShopeeProductMetadataFromHtml(html, identity);
}

export const shopeeProductMetadataProvider: ShopeeProductMetadataProvider =
  {
    async getProduct(identity) {
      return await fetchMetadataForIdentity(
        identity,
        productionFetch,
      );
    },
  };

// The full URL resolver lives behind the `server-only` guard, so
// providers always go through fetchMetadataForIdentity which already
// accepts a ShopeeProductIdentity. This stub remains to keep the
// legacy entry point discoverable but it deliberately throws to
// surface any drift early.
export async function fetchShopeeProductMetadataFromUrl(): Promise<ShopeeProductMetadata> {
  throw new ShopeeProductMetadataError(
    "metadata_unavailable",
    "fetchShopeeProductMetadataFromUrl requires a resolved identity",
  );
}

// Export under the clean name for use by the server-only
// composition surface and the application service layer.
export { fetchMetadataForIdentity };
export { productionFetch };