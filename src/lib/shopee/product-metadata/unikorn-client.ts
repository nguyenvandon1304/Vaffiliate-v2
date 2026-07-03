/**
 * Testable HTTP client core for the Unikorn Product Data API.
 *
 * Phase 20H.4 -- this module contains the core HTTP implementation without
 * server-only guard, allowing unit tests to import and exercise it directly.
 *
 * Design rules:
 *
 *   1. No server-only import.
 *   2. No React or Next.js imports.
 *   3. Pure infrastructure code.
 *   4. Only accepts a resolved ShopeeProductIdentity.
 *   5. Only sends item_id upstream.
 *   6. Never accepts raw user URLs or arbitrary URLs.
 *   7. The fixed endpoint is internal; only the client factory is exported.
 */

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import { ShopeeProductMetadataError } from "./provider.errors";

const UNIKORN_API_BASE =
  "https://data.addlivetag.com/product-data/product-data.php";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 256 * 1024; // 256 KiB

const ACCEPTED_CONTENT_TYPES: ReadonlyArray<string> = [
  "application/json",
  "text/json",
  "application/vnd.api+json",
];

/**
 * Minimal fetch contract for the Unikorn API client.
 *
 * Mirrors the global `fetch` signature so production code can pass
 * the built-in fetch through, while unit tests can supply a mock
 * that returns a hand-crafted Response.
 */
export type UnikornApiFetchLike = (
  input: URL,
  init: RequestInit,
) => Promise<Response>;

export interface UnikornClientOptions {
  readonly fetchImpl: UnikornApiFetchLike;
  /**
   * Total time budget covering fetch, status/content-type validation,
   * and the bounded body read. Production default: 5000 ms.
   */
  readonly timeoutMs?: number;
  /**
   * Hard cap on the number of response body bytes the client will
   * accumulate. Production default: 256 KiB.
   */
  readonly maxResponseBytes?: number;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
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
  try {
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
          "Unikorn API response exceeded the size limit",
        );
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
  text += decoder.decode();
  return text;
}

function buildUrl(itemId: string): URL {
  const params = new URLSearchParams();
  params.set("item_id", itemId);
  const url = new URL(UNIKORN_API_BASE);
  url.search = params.toString();
  return url;
}

/**
 * Build a typed error appropriate for the given failure. The signal and
 * the optional cause error together determine whether this is a timeout
 * (provider_timeout) or a generic metadata failure (metadata_unavailable).
 *
 * Existing typed `ShopeeProductMetadataError` values are passed through
 * unchanged so callers can distinguish `body_too_large`,
 * `redirect_failed`, `provider_response_invalid`, etc.
 */
function classifyFailure(
  signal: AbortSignal,
  cause: unknown,
): ShopeeProductMetadataError {
  if (cause instanceof ShopeeProductMetadataError) {
    return cause;
  }
  if (signal.aborted || isTimeoutError(cause)) {
    return new ShopeeProductMetadataError(
      "provider_timeout",
      "Unikorn API request timed out",
    );
  }
  return new ShopeeProductMetadataError(
    "metadata_unavailable",
    "Unikorn API request failed",
  );
}

async function fetchUnikornApiRaw(
  url: URL,
  options: UnikornClientOptions,
): Promise<unknown> {
  const { fetchImpl } = options;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;

  // One outer controller covers fetchImpl, status/content-type validation,
  // and the bounded body read. The timer is cleared in exactly one
  // finally block after the body read has finished or failed.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });
    } catch (error) {
      throw classifyFailure(controller.signal, error);
    }

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.status !== 304
    ) {
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      throw new ShopeeProductMetadataError(
        "redirect_failed",
        "Unikorn API returned a redirect",
      );
    }

    if (response.status === 429) {
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      throw new ShopeeProductMetadataError(
        "provider_timeout",
        "Unikorn API rate limit hit",
      );
    }

    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      throw new ShopeeProductMetadataError(
        "non_2xx_response",
        `Unikorn API returned HTTP ${response.status}`,
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
        "Unikorn API response had an unexpected content type",
      );
    }

    let bodyText: string;
    try {
      bodyText = await readBoundedBody(response, maxResponseBytes);
    } catch (error) {
      if (
        error instanceof ShopeeProductMetadataError &&
        error.code === "body_too_large"
      ) {
        throw error;
      }
      throw classifyFailure(controller.signal, error);
    }

    try {
      return JSON.parse(bodyText);
    } catch {
      throw new ShopeeProductMetadataError(
        "provider_response_invalid",
        "Unikorn API response is not valid JSON",
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Creates a Unikorn API client function with the given options.
 *
 * The client only accepts a resolved ShopeeProductIdentity and sends only
 * the item_id to the fixed third-party endpoint. It does not accept arbitrary
 * URLs, endpoints, or raw user URLs.
 *
 * @param options - Client configuration including injectable fetch.
 * @returns A client function that fetches raw API responses.
 */
export function createUnikornProductDataClient(options: UnikornClientOptions) {
  return async function fetchUnikornProductMetadata(
    identity: ShopeeProductIdentity,
  ): Promise<unknown> {
    const url = buildUrl(identity.itemId);
    return await fetchUnikornApiRaw(url, options);
  };
}
