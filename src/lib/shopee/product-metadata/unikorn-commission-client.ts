/**
 * Phase 20H.3f (correction pass: API-first precedence) -- Pure
 * Unikorn Shopee commission client.
 *
 * This module is the foundation of the API-first commission path:
 * the production quote service consults this client FIRST whenever
 * the dependency bundle wires the Unikorn provider. A successful,
 * validated response short-circuits the offer-selector + catalog/
 * fixture path and produces a quote built directly on the
 * `productInfo.commission` value. A failure here causes a silent
 * fallback to the offer-selector + catalog/fixture path -- the
 * buyer UI never sees raw API errors.
 *
 * Mirrors the structural design of `unikorn-client.ts` (the product
 * metadata client) so existing fetch / parsing / timeout / size
 * protections are reused.
 *
 * Responsibilities:
 *
 *   1. Issue an HTTP GET against the documented Unikorn Shopee
 *      Product Data API endpoint, sending either `item_id` (preferred
 *      when the caller has already resolved the product identity) OR
 *      a full canonical `url` (used when short-link resolution is
 *      still ahead or the URL is needed for cross-checking).
 *   2. Enforce timeouts, content type, body-size cap, and JSON parse
 *      failures -- using `ShopeeProductMetadataError` so this client
 *      and the metadata client produce identical failure categories
 *      when callers need to switch on the failure code.
 *   3. Normalize the response payload into a typed
 *      {@link ShopeeUnikornCommissionQuote} value, applying the
 *      validation guards called out in the spec:
 *
 *        - `status` MUST be exactly `"success"`;
 *        - `productInfo` MUST be present and an object;
 *        - `productInfo.commission` MUST be a non-negative safe
 *          integer; zero, negative, fractional, and non-safe
 *          integer values are rejected so the quote pipeline cannot
 *          fabricate a cashback figure from an invalid API value;
 *        - `price`, `sellerComFinal`, `shopeeComFinal` are OPTIONAL
 *          and never used to derive the displayed cashback figure;
 *        - the original `dataSource` string is surfaced unmodified
 *          so audit logs can identify the API field that was read.
 *
 * The module intentionally contains NO React, NO Next.js, NO
 * `server-only`, and no process-wide state. The server-only wrapper
 * (`unikorn-commission-client.server.ts`) is what production callers
 * import. Unit tests exercise this module directly with a mocked
 * fetch implementation.
 *
 * Hard scope:
 *   - Shopee only. No Lazada / TikTok Shop / Tiki / etc.
 *   - Server-only consumption in production. Never bundled to a
 *     Client Component (the server wrapper enforces that).
 *   - Never call this from `lib` code that ends up in the client
 *     bundle.
 */

import { ShopeeProductMetadataError } from "./provider.errors";

/**
 * Documented public endpoint. Configurable via the
 * `SHOPEE_PRODUCT_DATA_API_BASE_URL` env var when the server-only
 * wrapper composes the factory; the constant below is the fallback so
 * the client is self-contained for tests and offline review.
 */
export const UNIKORN_API_BASE_FALLBACK =
  "https://data.addlivetag.com/product-data/product-data.php";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 256 * 1024; // 256 KiB

const ACCEPTED_CONTENT_TYPES: ReadonlyArray<string> = [
  "application/json",
  "text/json",
  "application/vnd.api+json",
];

/**
 * Minimal fetch contract for the Unikorn commission client. Mirrors
 * the global `fetch` signature so production code can pass the
 * built-in fetch through, while unit tests supply a mock that
 * returns a hand-crafted Response.
 */
export type UnikornApiFetchLike = (
  input: URL,
  init: RequestInit,
) => Promise<Response>;

/**
 * Reasons the Unikorn commission quote was rejected. The shape is
 * the same family as `ShopeeProductMetadataError.code`, so callers
 * can collapse both failure streams when they need a single switch.
 */
export type ShopeeUnikornCommissionFailureCode =
  | "invalid_input"
  | "metadata_unavailable"
  | "provider_timeout"
  | "provider_response_invalid"
  | "non_2xx_response"
  | "unexpected_content_type"
  | "body_too_large"
  | "redirect_failed"
  | "commission_missing"
  | "commission_invalid"
  | "data_source_untrusted";

export class ShopeeUnikornCommissionError extends Error {
  readonly code: ShopeeUnikornCommissionFailureCode;
  constructor(code: ShopeeUnikornCommissionFailureCode, message: string) {
    super(message);
    this.name = "ShopeeUnikornCommissionError";
    this.code = code;
  }
}

/**
 * Normalized Unikorn commission quote, ready for the cashback quote
 * service to consume. Only `commissionVnd` is REQUIRED because that
 * is the field Vaffiliate uses to compute the buyer cashback. The
 * other fields are surfaced so audit logs / future UI can show
 * upstream context, but NEVER influence the displayed cashback math.
 *
 * Phase 20H.3f (correction pass): when the API returns a valid
 * value (`commissionVnd > 0`), the service builds the quote
 * directly on this field -- the cashback figure is NOT derived from
 * product price.
 */
export interface ShopeeUnikornCommissionQuote {
  /**
   * Integer VND commission amount Vaffiliate receives from Shopee
   * for the resolved product. Already validated:
   *
   *   - is a finite integer
   *   - is `Number.isSafeInteger`
   *   - is `>= 0`
   *
   * The caller must additionally enforce the canonical floor of
   * `userCashback + platformProfit === commissionVnd` using the
   * shared cashback policy.
   */
  readonly commissionVnd: number;

  /** Optional seller-facing commission component (VND integer). */
  readonly sellerCommissionVnd?: number;
  /** Optional Shopee-facing commission component (VND integer). */
  readonly shopeeCommissionVnd?: number;

  /** Optional resolved product price (VND integer), surfaced for audit only. */
  readonly priceVnd?: number;

  /**
   * `dataSource` reported by the API, surfaced for audit logs and
   * future debugging. NEVER rendered to the buyer verbatim.
   */
  readonly dataSource?: string;

  /**
   * Optional resolved itemId, useful when the request was issued with
   * a URL and the API echoed the resolved identifier back.
   */
  readonly itemId?: string;
}

export interface UnikornCommissionClientOptions {
  readonly fetchImpl: UnikornApiFetchLike;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

export interface UnikornCommissionRequest {
  /**
   * Resolved Shopee item id (digits). When supplied, the client sends
   * `item_id` to the API. At least one of `itemId` and `canonicalUrl`
   * MUST be a non-empty string.
   */
  readonly itemId?: string;
  /**
   * Canonical full Shopee product URL. When supplied and `itemId` is
   * not, the client sends `url` to the API. At least one of `itemId`
   * and `canonicalUrl` MUST be a non-empty string.
   */
  readonly canonicalUrl?: string;
}

/**
 * Phase 20H.3f -- The contract the cashback quote service consumes.
 *
 * Production wires this to the server-only Unikorn commission
 * client. Tests can supply a deterministic fake. Implementations
 * MUST treat the resolved identity as the only authority on which
 * product is being quoted -- the caller (server-side quote service)
 * will never accept a commission amount computed anywhere else.
 */
export type ShopeeUnikornCommissionProvider = (
  request: UnikornCommissionRequest,
) => Promise<ShopeeUnikornCommissionQuote>;

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
        throw new ShopeeUnikornCommissionError(
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

function buildUrl(
  base: string,
  params: UnikornCommissionRequest,
): URL {
  const url = new URL(base);
  if (params.itemId && params.itemId.trim().length > 0) {
    url.searchParams.set("item_id", params.itemId.trim());
    if (
      params.canonicalUrl &&
      params.canonicalUrl.trim().length > 0 &&
      params.canonicalUrl.trim() !== params.itemId.trim()
    ) {
      url.searchParams.set("url", params.canonicalUrl.trim());
    }
  } else if (
    params.canonicalUrl &&
    params.canonicalUrl.trim().length > 0
  ) {
    url.searchParams.set("url", params.canonicalUrl.trim());
  } else {
    throw new ShopeeUnikornCommissionError(
      "invalid_input",
      "Unikorn commission request requires either itemId or canonicalUrl",
    );
  }
  return url;
}

function classifyFailure(
  signal: AbortSignal,
  cause: unknown,
): ShopeeUnikornCommissionError {
  if (cause instanceof ShopeeUnikornCommissionError) {
    return cause;
  }
  if (cause instanceof ShopeeProductMetadataError) {
    // Should not happen, but coerce for safety.
    return new ShopeeUnikornCommissionError(
      "provider_response_invalid",
      cause.message,
    );
  }
  if (signal.aborted || isTimeoutError(cause)) {
    return new ShopeeUnikornCommissionError(
      "provider_timeout",
      "Unikorn API commission request timed out",
    );
  }
  return new ShopeeUnikornCommissionError(
    "metadata_unavailable",
    "Unikorn API commission request failed",
  );
}

async function fetchUnikornCommissionRaw(
  url: URL,
  options: UnikornCommissionClientOptions,
): Promise<unknown> {
  const { fetchImpl } = options;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;

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
      throw new ShopeeUnikornCommissionError(
        "redirect_failed",
        "Unikorn API commission returned a redirect",
      );
    }

    if (response.status === 429) {
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      throw new ShopeeUnikornCommissionError(
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
      throw new ShopeeUnikornCommissionError(
        "non_2xx_response",
        `Unikorn API commission returned HTTP ${response.status}`,
      );
    }

    const contentType = response.headers.get("content-type");
    if (!isAcceptedContentType(contentType)) {
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      throw new ShopeeUnikornCommissionError(
        "unexpected_content_type",
        "Unikorn API commission response had an unexpected content type",
      );
    }

    let bodyText: string;
    try {
      bodyText = await readBoundedBody(response, maxResponseBytes);
    } catch (error) {
      if (
        error instanceof ShopeeUnikornCommissionError &&
        error.code === "body_too_large"
      ) {
        throw error;
      }
      throw classifyFailure(controller.signal, error);
    }

    try {
      return JSON.parse(bodyText);
    } catch {
      throw new ShopeeUnikornCommissionError(
        "provider_response_invalid",
        "Unikorn API commission response is not valid JSON",
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validate an integer VND amount lifted directly from the API payload.
 * Returns true ONLY when the value is a finite safe integer >= 0.
 *
 * NOTE: this helper accepts zero because the Unikorn API surface
 * also includes optional monetary fields like `price` where zero is
 * a legitimate value. The commission field has its own zero-rejection
 * step inside {@link normalizeUnikornCommissionResponse} because the
 * spec requires a zero commission to surface as an unavailable
 * quote rather than a 0đ figure.
 */
export function isValidIntegerVnd(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

/**
 * Normalize an Unikorn Shopee Product Data API response payload into
 * a typed {@link ShopeeUnikornCommissionQuote}, applying all spec
 * validation guards. Exported for unit tests so the validators can be
 * exercised without touching the network.
 */
export function normalizeUnikornCommissionResponse(
  raw: unknown,
): ShopeeUnikornCommissionQuote {
  if (raw === null || typeof raw !== "object") {
    throw new ShopeeUnikornCommissionError(
      "commission_missing",
      "Unikorn API response is not an object",
    );
  }
  const obj = raw as Record<string, unknown>;
  if (obj.status !== "success") {
    throw new ShopeeUnikornCommissionError(
      "commission_missing",
      "Unikorn API did not return status=success",
    );
  }
  const productInfo = obj.productInfo;
  if (productInfo === null || typeof productInfo !== "object") {
    throw new ShopeeUnikornCommissionError(
      "commission_missing",
      "Unikorn API response did not include productInfo",
    );
  }
  const pi = productInfo as Record<string, unknown>;

  // Primary field: commission.
  if (!("commission" in pi)) {
    throw new ShopeeUnikornCommissionError(
      "commission_missing",
      "Unikorn API productInfo.commission was missing",
    );
  }
  const commission = pi.commission;
  if (!isValidIntegerVnd(commission)) {
    throw new ShopeeUnikornCommissionError(
      "commission_invalid",
      "Unikorn API productInfo.commission was not a non-negative safe integer",
    );
  }
  // Spec rule: zero commission is treated as "unavailable" so the
  // UI keeps the safe copy rather than fabricating a 0đ figure.
  if (commission === 0) {
    throw new ShopeeUnikornCommissionError(
      "commission_invalid",
      "Unikorn API productInfo.commission was zero",
    );
  }

  const out: ShopeeUnikornCommissionQuote = {
    commissionVnd: commission,
  };

  const augmentations: Array<
    | { key: "sellerCommissionVnd"; value: number }
    | { key: "shopeeCommissionVnd"; value: number }
    | { key: "priceVnd"; value: number }
    | { key: "dataSource"; value: string }
    | { key: "itemId"; value: string }
  > = [];

  if (isValidIntegerVnd(pi.sellerComFinal)) {
    augmentations.push({ key: "sellerCommissionVnd", value: pi.sellerComFinal });
  }
  if (isValidIntegerVnd(pi.shopeeComFinal)) {
    augmentations.push({ key: "shopeeCommissionVnd", value: pi.shopeeComFinal });
  }
  if (isValidIntegerVnd(pi.price)) {
    augmentations.push({ key: "priceVnd", value: pi.price });
  }
  if (typeof pi.dataSource === "string" && pi.dataSource.length > 0) {
    augmentations.push({ key: "dataSource", value: pi.dataSource });
  }
  // The API sometimes echoes the resolved itemId back as either a
  // string or a number; we only surface it when the type is sensible.
  if (typeof pi.itemId === "string" && pi.itemId.length > 0) {
    augmentations.push({ key: "itemId", value: pi.itemId });
  } else if (
    typeof pi.itemId === "number" &&
    Number.isInteger(pi.itemId) &&
    Number.isSafeInteger(pi.itemId)
  ) {
    augmentations.push({ key: "itemId", value: String(pi.itemId) });
  }

  return Object.freeze({
    ...out,
    ...Object.fromEntries(augmentations.map((a) => [a.key, a.value])),
  }) as ShopeeUnikornCommissionQuote;
}

/**
 * Creates a Unikorn Shopee commission client. Returns an async
 * function `(request) => Promise<ShopeeUnikornCommissionQuote>` that
 * throws `ShopeeUnikornCommissionError` on any validation / network /
 * API-shape failure.
 *
 * The factory accepts an injectable `fetchImpl` so unit tests can
 * supply a mocked `fetch`. Production callers compose the factory
 * with the real `fetch` inside `unikorn-commission-client.server.ts`.
 *
 * The base URL is also injectable; production reads the
 * `SHOPEE_PRODUCT_DATA_API_BASE_URL` env var with the documented
 * public endpoint as the fallback.
 */
export function createUnikornCommissionClient(
  options: UnikornCommissionClientOptions,
): (request: UnikornCommissionRequest) => Promise<ShopeeUnikornCommissionQuote> {
  const baseUrl =
    typeof options.baseUrl === "string" && options.baseUrl.length > 0
      ? options.baseUrl
      : UNIKORN_API_BASE_FALLBACK;

  return async function fetchUnikornCommissionQuote(
    request: UnikornCommissionRequest,
  ): Promise<ShopeeUnikornCommissionQuote> {
    const url = buildUrl(baseUrl, request);
    const raw = await fetchUnikornCommissionRaw(url, options);
    return normalizeUnikornCommissionResponse(raw);
  };
}
