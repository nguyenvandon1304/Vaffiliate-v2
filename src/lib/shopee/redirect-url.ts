import "server-only";

const MAX_INPUT_LENGTH = 4096;
const MAX_REDIRECTS = 5;
const RESOLVE_TIMEOUT_MS = 8000;

const allowedShopeeDomains = [
  "shopee.vn",
  "shopee.com",
  "shope.ee",
] as const;

const redirectStatuses = new Set([
  301,
  302,
  303,
  307,
  308,
]);

export type ShopeeRedirectUrlErrorCode =
  | "invalid_url"
  | "unsupported_host"
  | "redirect_failed"
  | "too_many_redirects";

export class ShopeeRedirectUrlError extends Error {
  readonly code: ShopeeRedirectUrlErrorCode;

  constructor(
    code: ShopeeRedirectUrlErrorCode,
    message: string,
  ) {
    super(message);

    this.name = "ShopeeRedirectUrlError";
    this.code = code;
  }
}

export function isAllowedShopeeHostname(
  value: string,
): boolean {
  const hostname = value
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");

  return allowedShopeeDomains.some(
    (domain) =>
      hostname === domain ||
      hostname.endsWith(`.${domain}`),
  );
}

export function parseShopeeHttpsUrl(
  value: string,
): URL {
  const normalizedValue = value.trim();

  if (
    !normalizedValue ||
    normalizedValue.length > MAX_INPUT_LENGTH ||
    /\s/.test(normalizedValue)
  ) {
    throw new ShopeeRedirectUrlError(
      "invalid_url",
      "Shopee URL is invalid",
    );
  }

  let url: URL;

  try {
    url = new URL(normalizedValue);
  } catch {
    throw new ShopeeRedirectUrlError(
      "invalid_url",
      "Shopee URL is invalid",
    );
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new ShopeeRedirectUrlError(
      "invalid_url",
      "Shopee URL must use HTTPS",
    );
  }

  if (
    !isAllowedShopeeHostname(
      url.hostname,
    )
  ) {
    throw new ShopeeRedirectUrlError(
      "unsupported_host",
      "URL does not belong to an allowed Shopee host",
    );
  }

  return url;
}

async function requestUrl(
  url: URL,
): Promise<Response> {
  try {
    return await fetch(url, {
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
    throw new ShopeeRedirectUrlError(
      "redirect_failed",
      "Unable to resolve Shopee URL",
    );
  }
}

export async function resolveShopeeRedirectUrl(
  value: string,
): Promise<URL> {
  let currentUrl =
    parseShopeeHttpsUrl(value);

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    const response =
      await requestUrl(currentUrl);

    if (
      !redirectStatuses.has(
        response.status,
      )
    ) {
      await response.body?.cancel();

      if (!response.ok) {
        throw new ShopeeRedirectUrlError(
          "redirect_failed",
          `Shopee URL returned HTTP ${response.status}`,
        );
      }

      return currentUrl;
    }

    if (
      redirectCount === MAX_REDIRECTS
    ) {
      await response.body?.cancel();

      throw new ShopeeRedirectUrlError(
        "too_many_redirects",
        "Shopee URL exceeded the redirect limit",
      );
    }

    const location =
      response.headers.get("location");

    await response.body?.cancel();

    if (!location) {
      throw new ShopeeRedirectUrlError(
        "redirect_failed",
        "Shopee redirect did not provide a destination",
      );
    }

    let nextUrl: URL;

    try {
      nextUrl = new URL(
        location,
        currentUrl,
      );
    } catch {
      throw new ShopeeRedirectUrlError(
        "redirect_failed",
        "Shopee redirect destination is invalid",
      );
    }

    currentUrl = parseShopeeHttpsUrl(
      nextUrl.toString(),
    );
  }

  throw new ShopeeRedirectUrlError(
    "too_many_redirects",
    "Shopee URL exceeded the redirect limit",
  );
}
