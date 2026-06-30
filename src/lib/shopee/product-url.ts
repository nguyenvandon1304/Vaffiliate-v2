import "server-only";

const MAX_INPUT_LENGTH = 4096;
const MAX_REDIRECTS = 5;
const RESOLVE_TIMEOUT_MS = 8000;

const ALLOWED_SHOPEE_HOSTS = new Set([
  "shopee.vn",
  "www.shopee.vn",
  "s.shopee.vn",
]);

const SHORT_LINK_HOSTS = new Set([
  "s.shopee.vn",
]);

const REDIRECT_STATUSES = new Set([
  301,
  302,
  303,
  307,
  308,
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

export interface ShopeeProductIdentity {
  shopId: string;
  itemId: string;
  canonicalUrl: string;
}

function parseInputUrl(value: string): URL {
  const normalizedValue = value.trim();

  if (
    !normalizedValue ||
    normalizedValue.length > MAX_INPUT_LENGTH ||
    /\s/.test(normalizedValue)
  ) {
    throw new ShopeeProductUrlError(
      "invalid_url",
      "Shopee product URL is invalid",
    );
  }

  let url: URL;

  try {
    url = new URL(normalizedValue);
  } catch {
    throw new ShopeeProductUrlError(
      "invalid_url",
      "Shopee product URL is invalid",
    );
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new ShopeeProductUrlError(
      "invalid_url",
      "Shopee product URL must use HTTPS",
    );
  }

  const hostname = url.hostname.toLowerCase();

  if (!ALLOWED_SHOPEE_HOSTS.has(hostname)) {
    throw new ShopeeProductUrlError(
      "unsupported_host",
      "URL does not belong to an allowed Shopee host",
    );
  }

  return url;
}

function createProductIdentity(
  shopId: string,
  itemId: string,
): ShopeeProductIdentity {
  return {
    shopId,
    itemId,
    canonicalUrl:
      `https://shopee.vn/product/${shopId}/${itemId}`,
  };
}

function extractProductIdentity(
  url: URL,
): ShopeeProductIdentity | null {
  const pathname = url.pathname.replace(/\/+$/, "");

  const productPathMatch = pathname.match(
    /^\/product\/([0-9]+)\/([0-9]+)$/i,
  );

  if (
    productPathMatch?.[1] &&
    productPathMatch[2]
  ) {
    return createProductIdentity(
      productPathMatch[1],
      productPathMatch[2],
    );
  }

  const modernPathMatch = pathname.match(
    /^\/[^/]+\/([0-9]+)\/([0-9]+)$/i,
  );

  if (
    modernPathMatch?.[1] &&
    modernPathMatch[2]
  ) {
    return createProductIdentity(
      modernPathMatch[1],
      modernPathMatch[2],
    );
  }

  const legacyPathMatch = pathname.match(
    /-i\.([0-9]+)\.([0-9]+)$/i,
  );

  if (
    legacyPathMatch?.[1] &&
    legacyPathMatch[2]
  ) {
    return createProductIdentity(
      legacyPathMatch[1],
      legacyPathMatch[2],
    );
  }

  return null;
}

async function requestRedirectLocation(
  url: URL,
): Promise<URL | null> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(
        RESOLVE_TIMEOUT_MS,
      ),
      headers: {
        Accept:
          "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; Vaffiliate/1.0)",
      },
    });
  } catch {
    throw new ShopeeProductUrlError(
      "redirect_failed",
      "Unable to resolve Shopee short link",
    );
  }

  if (!REDIRECT_STATUSES.has(response.status)) {
    await response.body?.cancel();

    return null;
  }

  const location = response.headers.get("location");

  await response.body?.cancel();

  if (!location) {
    throw new ShopeeProductUrlError(
      "redirect_failed",
      "Shopee redirect did not provide a destination",
    );
  }

  let nextUrl: URL;

  try {
    nextUrl = new URL(location, url);
  } catch {
    throw new ShopeeProductUrlError(
      "redirect_failed",
      "Shopee redirect destination is invalid",
    );
  }

  return parseInputUrl(nextUrl.toString());
}

export async function resolveShopeeProductUrl(
  value: string,
): Promise<ShopeeProductIdentity> {
  let currentUrl = parseInputUrl(value);

  const directIdentity =
    extractProductIdentity(currentUrl);

  if (directIdentity) {
    return directIdentity;
  }

  if (
    !SHORT_LINK_HOSTS.has(
      currentUrl.hostname.toLowerCase(),
    )
  ) {
    throw new ShopeeProductUrlError(
      "not_product_url",
      "URL is not a supported Shopee product URL",
    );
  }

  for (
    let redirectCount = 0;
    redirectCount < MAX_REDIRECTS;
    redirectCount += 1
  ) {
    const nextUrl =
      await requestRedirectLocation(currentUrl);

    if (!nextUrl) {
      throw new ShopeeProductUrlError(
        "not_product_url",
        "Shopee short link did not resolve to a product",
      );
    }

    const identity =
      extractProductIdentity(nextUrl);

    if (identity) {
      return identity;
    }

    currentUrl = nextUrl;
  }

  throw new ShopeeProductUrlError(
    "too_many_redirects",
    "Shopee short link exceeded the redirect limit",
  );
}