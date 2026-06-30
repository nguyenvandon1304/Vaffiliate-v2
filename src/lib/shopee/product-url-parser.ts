/**
 * Pure Shopee product URL parser for Phase 20H.1.
 *
 * This module is deliberately side-effect free: it does no I/O, no fetch,
 * no redirect-following, and does not touch `server-only`. Its sole job is
 * to turn an arbitrary `unknown` value into a typed
 * ShopeeProductUrlResolution that callers can persist or render,
 * or to throw a typed ShopeeProductUrlParseError that explains
 * exactly why the input was rejected.
 *
 * Network resolution of short links (`s.shopee.vn`) is delegated to
 * {@link runShopeeProductUrlRedirectLoop}, a pure orchestration helper that
 * also lives in this module so it can be unit-tested without importing the
 * server-only production resolver. The helper follows up to MAX_REDIRECTS
 * 3xx responses and treats any of the four "continueable" parse errors
 * (`unsupported_short_link`, `not_product_path`, `missing_identifier`,
 * `invalid_identifier`) as a signal to keep chasing the next hop instead
 * of giving up. Direct user input is unaffected: only the redirect loop
 * consults {@link isContinueableRedirectTargetError}.
 */

const MAX_INPUT_LENGTH = 4096;

const SHOPEE_ROOT_DOMAIN = "shopee.vn";

const ALLOWED_HOSTS = new Set([
  SHOPEE_ROOT_DOMAIN,
  `www.${SHOPEE_ROOT_DOMAIN}`,
  `s.${SHOPEE_ROOT_DOMAIN}`,
]);

const SHORT_LINK_HOSTS = new Set([
  `s.${SHOPEE_ROOT_DOMAIN}`,
]);

const PRODUCT_PATH_PATTERN =
  /^\/product\/([^/]+)\/([^/]+)\/?$/i;

const PRODUCT_PREFIX_PATTERN = /^\/product(\/|$)/i;

const SLUG_PRODUCT_PATH_PATTERN =
  /^\/[^/]+-i\.([^/]+)\.([^/]+)\/?$/i;

const SLUG_INCOMPLETE_PATTERN = /-i\./i;

/**
 * `/<shopName>/<shopId>/<itemId>` shape (e.g. `/some-shop/123/456`).
 *
 * Captures any non-empty path segments so the caller can validate that
 * the trailing two are non-empty ASCII digit strings. The product-shape
 * check runs before this one, so a path such as `/product/123/456` is
 * still classified as the canonical product shape.
 */
const SHOP_NAME_PRODUCT_PATH_PATTERN =
  /^\/[^/]+\/([^/]+)\/([^/]+)\/?$/i;

/**
 * Incomplete `/<shopName>/<shopId>` shape (no trailing itemId segment,
 * and the second segment looks numeric).
 *
 * Used to classify a clearly Shopee-allowlisted, shop-name-style path
 * with a digit-shaped shopId and missing itemId as `missing_identifier`,
 * matching the behaviour of `/product/123`. A path such as
 * `/category/phone` is NOT matched because its second segment is not a
 * digit string - that stays a plain `not_product_path`.
 */
const SHOP_NAME_INCOMPLETE_PATTERN =
  /^\/[^/]+\/[0-9]+\/?$/i;

export type ShopeeProductUrlParseErrorCode =
  | "invalid_input"
  | "invalid_url"
  | "unsupported_scheme"
  | "unsupported_host"
  | "credentials_not_allowed"
  | "unexpected_port"
  | "oversized_url"
  | "not_product_path"
  | "missing_identifier"
  | "invalid_identifier"
  | "unsupported_short_link";

const ERROR_MESSAGES: Readonly<
  Record<ShopeeProductUrlParseErrorCode, string>
> = {
  invalid_input: "Shopee product URL input must be a string",
  invalid_url: "Shopee product URL could not be parsed",
  unsupported_scheme:
    "Shopee product URL must use the HTTPS scheme",
  unsupported_host:
    "Shopee product URL must belong to an allowed Shopee host",
  credentials_not_allowed:
    "Shopee product URL must not contain credentials",
  unexpected_port:
    "Shopee product URL must not declare an unexpected port",
  oversized_url: "Shopee product URL exceeds the maximum length",
  not_product_path:
    "Shopee product URL must point at a product path",
  missing_identifier:
    "Shopee product URL must include both a shopId and an itemId",
  invalid_identifier:
    "Shopee product URL identifiers must be non-empty ASCII digit strings",
  unsupported_short_link:
    "Shopee short links require network resolution which is not supported in this phase",
};

export class ShopeeProductUrlParseError extends Error {
  readonly code: ShopeeProductUrlParseErrorCode;

  constructor(
    code: ShopeeProductUrlParseErrorCode,
    message: string = ERROR_MESSAGES[code],
  ) {
    super(message);
    this.name = "ShopeeProductUrlParseError";
    this.code = code;
  }
}

export interface ShopeeProductUrlResolution {
  originalUrl: string;
  canonicalUrl: string;
  hostname: string;
  shopId: string;
  itemId: string;
}

function reject(code: ShopeeProductUrlParseErrorCode): never {
  throw new ShopeeProductUrlParseError(code);
}

function isNonEmptyDigitString(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}

function normalizeHostname(rawHostname: string): string {
  return rawHostname.trim().toLowerCase().replace(/\.$/, "");
}

function isAllowedHostname(hostname: string): boolean {
  if (ALLOWED_HOSTS.has(hostname)) {
    return true;
  }
  return false;
}

function buildCanonicalUrl(
  shopId: string,
  itemId: string,
): string {
  return `https://${SHOPEE_ROOT_DOMAIN}/product/${shopId}/${itemId}`;
}

function buildResolution(
  hostname: string,
  originalUrl: string,
  shopId: string,
  itemId: string,
): ShopeeProductUrlResolution {
  return {
    originalUrl,
    canonicalUrl: buildCanonicalUrl(shopId, itemId),
    hostname,
    shopId,
    itemId,
  };
}

function resolveProductShape(
  pathname: string,
  hostname: string,
  originalUrl: string,
): ShopeeProductUrlResolution | null {
  const productMatch = pathname.match(PRODUCT_PATH_PATTERN);
  if (productMatch) {
    const shopIdRaw = productMatch[1] ?? "";
    const itemIdRaw = productMatch[2] ?? "";
    if (shopIdRaw.length === 0 || itemIdRaw.length === 0) {
      reject("missing_identifier");
    }
    if (
      !isNonEmptyDigitString(shopIdRaw) ||
      !isNonEmptyDigitString(itemIdRaw)
    ) {
      reject("invalid_identifier");
    }
    return buildResolution(
      hostname,
      originalUrl,
      shopIdRaw,
      itemIdRaw,
    );
  }

  const slugMatch = pathname.match(SLUG_PRODUCT_PATH_PATTERN);
  if (slugMatch) {
    const shopIdRaw = slugMatch[1] ?? "";
    const itemIdRaw = slugMatch[2] ?? "";
    if (shopIdRaw.length === 0 || itemIdRaw.length === 0) {
      reject("missing_identifier");
    }
    if (
      !isNonEmptyDigitString(shopIdRaw) ||
      !isNonEmptyDigitString(itemIdRaw)
    ) {
      reject("invalid_identifier");
    }
    return buildResolution(
      hostname,
      originalUrl,
      shopIdRaw,
      itemIdRaw,
    );
  }

  const shopNameMatch = pathname.match(SHOP_NAME_PRODUCT_PATH_PATTERN);
  if (shopNameMatch) {
    const shopIdRaw = shopNameMatch[1] ?? "";
    const itemIdRaw = shopNameMatch[2] ?? "";
    if (shopIdRaw.length === 0 || itemIdRaw.length === 0) {
      reject("missing_identifier");
    }
    if (
      !isNonEmptyDigitString(shopIdRaw) ||
      !isNonEmptyDigitString(itemIdRaw)
    ) {
      reject("invalid_identifier");
    }
    return buildResolution(
      hostname,
      originalUrl,
      shopIdRaw,
      itemIdRaw,
    );
  }

  return null;
}

function hasIncompleteProductShape(pathname: string): boolean {
  if (PRODUCT_PREFIX_PATTERN.test(pathname)) {
    return true;
  }
  if (SLUG_INCOMPLETE_PATTERN.test(pathname)) {
    return true;
  }
  if (SHOP_NAME_INCOMPLETE_PATTERN.test(pathname)) {
    return true;
  }
  return false;
}

/**
 * Parse a Shopee product URL purely from the supplied input.
 *
 * The function accepts `unknown` so it can be wired directly to user input
 * boundaries (form submissions, query strings, Server Action payloads) without
 * the caller having to pre-type its data. Any input that is not a string is
 * rejected with `invalid_input`.
 *
 * Supported inputs:
 *
 * - `https://shopee.vn/product/<shopId>/<itemId>`
 * - `https://shopee.vn/<slug>-i.<shopId>.<itemId>`
 * - `https://shopee.vn/<shopName>/<shopId>/<itemId>`
 *
 * Short links (`https://s.shopee.vn/...`) raise `unsupported_short_link`.
 *
 * The returned ShopeeProductUrlResolution always carries the
 * canonical URL `https://shopee.vn/product/<shopId>/<itemId>` with any
 * query string, fragment, slug, shop-name segment, or trailing slash
 * stripped.
 */
export function parseShopeeProductUrl(
  value: unknown,
): ShopeeProductUrlResolution {
  if (typeof value !== "string") {
    reject("invalid_input");
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    reject("invalid_url");
  }

  if (normalized.length > MAX_INPUT_LENGTH) {
    reject("oversized_url");
  }

  if (/\s/.test(normalized)) {
    reject("invalid_url");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    reject("invalid_url");
  }

  if (parsed.protocol !== "https:") {
    reject("unsupported_scheme");
  }

  if (parsed.username || parsed.password) {
    reject("credentials_not_allowed");
  }

  if (parsed.port && parsed.port !== "") {
    reject("unexpected_port");
  }

  const hostname = normalizeHostname(parsed.hostname);

  if (!isAllowedHostname(hostname)) {
    reject("unsupported_host");
  }

  if (SHORT_LINK_HOSTS.has(hostname)) {
    reject("unsupported_short_link");
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");

  const resolution = resolveProductShape(
    normalizedPath,
    hostname,
    normalized,
  );

  if (resolution) {
    return resolution;
  }

  if (hasIncompleteProductShape(normalizedPath)) {
    reject("missing_identifier");
  }

  reject("not_product_path");
}

// ---------------------------------------------------------------------------
// Redirect-loop orchestration (pure / testable)
// ---------------------------------------------------------------------------

const SHOPEE_REDIRECT_STATUS_CODES: ReadonlySet<number> = new Set([
  301,
  302,
  303,
  307,
  308,
]);

/**
 * Error codes the redirect loop treats as "URL envelope is fine but the
 * target is not yet a Shopee product identity; keep chasing the chain".
 *
 * Direct user input does not consult this predicate: the production
 * resolver surfaces these codes as a typed `not_product_url` or
 * `redirect_failed` error when they appear on the first parse.
 */
export function isContinueableRedirectTargetError(
  code: ShopeeProductUrlParseErrorCode,
): boolean {
  return (
    code === "unsupported_short_link" ||
    code === "not_product_path" ||
    code === "missing_identifier" ||
    code === "invalid_identifier"
  );
}

export type ShopeeProductUrlRedirectErrorCode =
  | "redirect_failed"
  | "not_product_url"
  | "too_many_redirects";

const SHOPEE_REDIRECT_ERROR_MESSAGES: Readonly<
  Record<ShopeeProductUrlRedirectErrorCode, string>
> = {
  redirect_failed:
    "Shopee URL redirect request failed",
  not_product_url:
    "Shopee URL did not resolve to a product page",
  too_many_redirects:
    "Shopee URL exceeded the redirect limit",
};

export class ShopeeProductUrlRedirectError extends Error {
  readonly code: ShopeeProductUrlRedirectErrorCode;

  constructor(
    code: ShopeeProductUrlRedirectErrorCode,
    message?: string,
  ) {
    super(message ?? SHOPEE_REDIRECT_ERROR_MESSAGES[code]);
    this.name = "ShopeeProductUrlRedirectError";
    this.code = code;
  }
}

/**
 * Minimal fetch contract required by {@link runShopeeProductUrlRedirectLoop}.
 *
 * The signature mirrors the global `fetch` so production code can pass it
 * through with custom headers / timeout, while unit tests can supply a
 * mock that resolves to a hand-built `Response` for each requested URL.
 */
export type ShopeeProductUrlFetchLike = (
  input: URL,
) => Promise<Response>;

export interface ShopeeProductUrlRedirectLoopOptions {
  readonly maxRedirects: number;
  readonly acceptedStatusCodes?: ReadonlySet<number>;
}

export const DEFAULT_SHOPEE_PRODUCT_URL_REDIRECT_LOOP_OPTIONS: ShopeeProductUrlRedirectLoopOptions =
  {
    maxRedirects: 5,
    acceptedStatusCodes: SHOPEE_REDIRECT_STATUS_CODES,
  };

/**
 * Follow up to `options.maxRedirects` 3xx redirects starting from
 * `startUrl` and return the first Shopee product identity the chain
 * produces.
 *
 * Each redirect target is fed back through {@link parseShopeeProductUrl}.
 * The loop continues when the target is a valid Shopee envelope but not
 * yet a product URL (see {@link isContinueableRedirectTargetError}); any
 * other parse error - wrong scheme, unsupported host, credentials, port,
 * malformed URL, or invalid input - is rethrown verbatim so the caller can
 * map it to the production error envelope. Non-redirect responses,
 * missing `Location` headers, invalid `Location` values, and fetch
 * failures are surfaced as {@link ShopeeProductUrlRedirectError}.
 *
 * The helper performs no URL parsing of its own: scheme, host,
 * credentials, and port validation all live in {@link parseShopeeProductUrl}
 * so there is exactly one source of truth for the URL envelope rules.
 */
export async function runShopeeProductUrlRedirectLoop(
  startUrl: URL,
  fetchImpl: ShopeeProductUrlFetchLike,
  options: ShopeeProductUrlRedirectLoopOptions = DEFAULT_SHOPEE_PRODUCT_URL_REDIRECT_LOOP_OPTIONS,
): Promise<ShopeeProductUrlResolution> {
  const acceptedStatusCodes =
    options.acceptedStatusCodes ?? SHOPEE_REDIRECT_STATUS_CODES;

  let currentUrl = startUrl;

  for (
    let redirectCount = 0;
    redirectCount < options.maxRedirects;
    redirectCount += 1
  ) {
    let response: Response;

    try {
      response = await fetchImpl(currentUrl);
    } catch {
      throw new ShopeeProductUrlRedirectError(
        "redirect_failed",
        "Shopee URL redirect request failed",
      );
    }

    if (!acceptedStatusCodes.has(response.status)) {
      await response.body?.cancel();
      throw new ShopeeProductUrlRedirectError(
        "not_product_url",
        `Shopee URL did not return a redirect status (got ${response.status})`,
      );
    }

    const location = response.headers.get("location");

    await response.body?.cancel();

    if (!location) {
      throw new ShopeeProductUrlRedirectError(
        "redirect_failed",
        "Shopee URL redirect did not include a location header",
      );
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new ShopeeProductUrlRedirectError(
        "redirect_failed",
        "Shopee URL redirect location is not a valid URL",
      );
    }

    currentUrl = nextUrl;

    try {
      return parseShopeeProductUrl(currentUrl.toString());
    } catch (error) {
      if (
        error instanceof ShopeeProductUrlParseError &&
        isContinueableRedirectTargetError(error.code)
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new ShopeeProductUrlRedirectError(
    "too_many_redirects",
    "Shopee URL exceeded the redirect limit",
  );
}