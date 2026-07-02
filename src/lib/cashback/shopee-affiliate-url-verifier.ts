/**
 * Pure Shopee affiliate URL verifier.
 *
 * This module is deliberately side-effect free and has no server-only
 * boundary.
 */

import { parseShopeeProductUrl } from "@/lib/shopee/product-url-parser";

const networkSubIdPattern = /^vaflnk[a-f0-9]{24}$/;

const ALLOWED_SHOPEE_DOMAINS = ["shopee.vn", "shopee.com", "shope.ee"] as const;
const ALLOWED_SHORT_LINK_HOSTS = ["s.shopee.vn", "s.shopee.com"] as const;

export type ShopeeAffiliateUrlErrorCode =
  | "invalid_network_sub_id"
  | "missing_account_attribution"
  | "account_mismatch"
  | "missing_sub_id"
  | "sub_id_mismatch"
  | "invalid_origin_link"
  | "invalid_url"
  | "product_mismatch"
  | "unsupported_affiliate_format";

export class ShopeeAffiliateUrlError extends Error {
  readonly code: ShopeeAffiliateUrlErrorCode;
  constructor(code: ShopeeAffiliateUrlErrorCode, message: string) {
    super(message);
    this.name = "ShopeeAffiliateUrlError";
    this.code = code;
  }
}

export interface VerifiedShopeeAffiliateUrl {
  valid: true;
  affiliateUrl: string;
  resolvedUrl: string;
  accountId: string;
  networkSubId: string;
  originLink: string | null;
  utmSource: string | null;
  mmpPid: string | null;
  utmContent: string | null;
  format: "new" | "legacy";
}

export interface VerificationFailure {
  valid: false;
  errorCode: ShopeeAffiliateUrlErrorCode;
  errorMessage?: string;
}

export type ShopeeAffiliateUrlVerificationResult =
  | VerifiedShopeeAffiliateUrl
  | VerificationFailure;

function isAllowedShopeeHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return ALLOWED_SHOPEE_DOMAINS.some(
    (d) => normalized === d || normalized.endsWith("." + d),
  );
}

function isAllowedShortLinkHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return (ALLOWED_SHORT_LINK_HOSTS as readonly string[]).includes(normalized);
}

function validateInputUrl(parsedInput: URL): VerificationFailure | null {
  if (parsedInput.protocol !== "https:")
    return { valid: false, errorCode: "invalid_url", errorMessage: "Affiliate URL must use HTTPS" };
  if (parsedInput.username || parsedInput.password)
    return { valid: false, errorCode: "invalid_url", errorMessage: "Affiliate URL must not contain credentials" };
  if (parsedInput.port)
    return { valid: false, errorCode: "invalid_url", errorMessage: "Affiliate URL must not contain a port" };
  if (!isAllowedShortLinkHost(parsedInput.hostname))
    return { valid: false, errorCode: "invalid_url", errorMessage: "Affiliate URL must use s.shopee.vn or s.shopee.com" };
  return null;
}

function validateOriginLinkForAnRedir(originLink: string): VerificationFailure | null {
  try {
    const originUrl = new URL(originLink);
    if (originUrl.protocol !== "https:")
      return { valid: false, errorCode: "invalid_origin_link", errorMessage: "origin_link must use HTTPS" };
    if (!isAllowedShopeeHostname(originUrl.hostname))
      return { valid: false, errorCode: "invalid_origin_link", errorMessage: "origin_link must be a Shopee URL" };
    parseShopeeProductUrl(originLink);
  } catch {
    return { valid: false, errorCode: "invalid_origin_link", errorMessage: "origin_link is not a valid Shopee product URL" };
  }
  return null;
}

export type RedirectResolver = (url: string) => Promise<URL>;

export async function verifyShopeeAffiliateUrl(
  affiliateUrl: string,
  expectedNetworkSubId: string,
  expectedAccountId: string,
  expectedCanonicalUrl: string,
  resolveRedirect?: RedirectResolver,
): Promise<ShopeeAffiliateUrlVerificationResult> {
  const networkSubId = expectedNetworkSubId.trim();

  if (!networkSubIdPattern.test(networkSubId))
    return { valid: false, errorCode: "invalid_network_sub_id", errorMessage: "Shopee affiliate Sub_id1 is invalid" };

  let parsedInput: URL;
  try {
    parsedInput = new URL(affiliateUrl.trim());
  } catch {
    return { valid: false, errorCode: "invalid_url", errorMessage: "Affiliate URL is not a valid URL" };
  }

  const inputValidation = validateInputUrl(parsedInput);
  if (inputValidation) return inputValidation;

  const pathname = parsedInput.pathname.replace(/\/+$/, "");

  // Deterministic /an_redir path
  if (pathname === "/an_redir") {
    const affiliateIdParam = parsedInput.searchParams.get("affiliate_id");
    const subIdParam = parsedInput.searchParams.get("sub_id");
    const originLink = parsedInput.searchParams.get("origin_link");
    const numericAccountId = expectedAccountId.slice(3);

    if (!affiliateIdParam)
      return { valid: false, errorCode: "missing_account_attribution", errorMessage: "Affiliate URL does not contain affiliate_id" };
    if (affiliateIdParam !== numericAccountId)
      return { valid: false, errorCode: "account_mismatch", errorMessage: "Affiliate URL belongs to a different account" };
    if (!subIdParam)
      return { valid: false, errorCode: "missing_sub_id", errorMessage: "Affiliate URL does not contain Sub_id1" };
    const expectedSubId = networkSubId + "-web-direct-na-na";
    if (subIdParam !== expectedSubId)
      return { valid: false, errorCode: "sub_id_mismatch", errorMessage: "Sub_id1 in affiliate URL does not match the tracking link" };
    if (!originLink)
      return { valid: false, errorCode: "invalid_origin_link", errorMessage: "Affiliate URL does not contain origin_link" };
    const originValidation = validateOriginLinkForAnRedir(originLink);
    if (originValidation) return originValidation;
    const originParsed = parseShopeeProductUrl(originLink);
    const expectedParsed = parseShopeeProductUrl(expectedCanonicalUrl);
    if (originParsed.shopId !== expectedParsed.shopId || originParsed.itemId !== expectedParsed.itemId)
      return { valid: false, errorCode: "product_mismatch", errorMessage: "Affiliate URL points to a different product than requested" };
    return { valid: true, affiliateUrl: affiliateUrl.trim(), resolvedUrl: affiliateUrl.trim(), accountId: expectedAccountId, networkSubId, originLink, utmSource: null, mmpPid: null, utmContent: null, format: "new" };
  }

  // Legacy redirect path
  let resolvedUrl: URL;
  try {
    if (resolveRedirect) resolvedUrl = await resolveRedirect(affiliateUrl);
    else {
      const { resolveShopeeRedirectUrl } = await import("@/lib/shopee/redirect-url");
      resolvedUrl = await resolveShopeeRedirectUrl(affiliateUrl);
    }
  } catch {
    return { valid: false, errorCode: "invalid_url", errorMessage: "Unable to resolve affiliate URL" };
  }

  if (resolvedUrl.protocol !== "https:")
    return { valid: false, errorCode: "invalid_url", errorMessage: "Resolved URL must use HTTPS" };
  if (resolvedUrl.username || resolvedUrl.password)
    return { valid: false, errorCode: "invalid_url", errorMessage: "Resolved URL must not contain credentials" };
  if (resolvedUrl.port)
    return { valid: false, errorCode: "invalid_url", errorMessage: "Resolved URL must not contain a port" };

  // The final resolved URL must be a valid product URL — short links are not accepted.
  let productParsed: ReturnType<typeof parseShopeeProductUrl>;
  try {
    productParsed = parseShopeeProductUrl(resolvedUrl.toString());
  } catch {
    return { valid: false, errorCode: "invalid_url", errorMessage: "Resolved URL must be a valid Shopee product URL" };
  }

  const utmSource = resolvedUrl.searchParams.get("utm_source");
  const mmpPid = resolvedUrl.searchParams.get("mmp_pid");
  const affiliateIdParam = resolvedUrl.searchParams.get("affiliate_id");
  const originLink = resolvedUrl.searchParams.get("origin_link");

  if (!utmSource && !mmpPid && !affiliateIdParam)
    return { valid: false, errorCode: "missing_account_attribution", errorMessage: "Affiliate URL does not contain account attribution" };
  const numericAccountId = expectedAccountId.slice(3);
  if (utmSource && utmSource !== expectedAccountId)
    return { valid: false, errorCode: "account_mismatch", errorMessage: "Affiliate URL belongs to a different account" };
  if (mmpPid && mmpPid !== expectedAccountId)
    return { valid: false, errorCode: "account_mismatch", errorMessage: "Affiliate URL belongs to a different account" };
  if (affiliateIdParam && affiliateIdParam !== numericAccountId)
    return { valid: false, errorCode: "account_mismatch", errorMessage: "Affiliate URL belongs to a different account" };

  const utmContent = resolvedUrl.searchParams.get("utm_content");
  const subIdParam = resolvedUrl.searchParams.get("sub_id");
  if (!utmContent && !subIdParam)
    return { valid: false, errorCode: "missing_sub_id", errorMessage: "Affiliate URL does not contain Sub_id1" };
  if (utmContent) {
    const sepIdx = utmContent.indexOf("-");
    const subId1 = sepIdx === -1 ? utmContent : utmContent.slice(0, sepIdx);
    if (subId1 !== networkSubId)
      return { valid: false, errorCode: "sub_id_mismatch", errorMessage: "Sub_id1 in affiliate URL does not match the tracking link" };
  }
  if (subIdParam) {
    const expectedSubId = networkSubId + "-web-direct-na-na";
    if (subIdParam !== expectedSubId)
      return { valid: false, errorCode: "sub_id_mismatch", errorMessage: "Sub_id1 in affiliate URL does not match the tracking link" };
  }

  if (originLink) {
    try {
      const originUrl = new URL(originLink);
      if (originUrl.protocol !== "https:")
        return { valid: false, errorCode: "invalid_origin_link", errorMessage: "origin_link must use HTTPS" };
      if (!isAllowedShopeeHostname(originUrl.hostname))
        return { valid: false, errorCode: "invalid_origin_link", errorMessage: "origin_link must be a Shopee URL" };
      const originProductParsed = parseShopeeProductUrl(originLink);
      if (originProductParsed.shopId !== productParsed.shopId || originProductParsed.itemId !== productParsed.itemId)
        return { valid: false, errorCode: "product_mismatch", errorMessage: "Affiliate URL points to a different product than requested" };
    } catch {
      return { valid: false, errorCode: "invalid_origin_link", errorMessage: "origin_link is not a valid Shopee product URL" };
    }
  }

  // Compare against expected product identity
  const expectedParsed = parseShopeeProductUrl(expectedCanonicalUrl);
  if (productParsed.shopId !== expectedParsed.shopId || productParsed.itemId !== expectedParsed.itemId)
    return { valid: false, errorCode: "product_mismatch", errorMessage: "Affiliate URL points to a different product than requested" };

  return { valid: true, affiliateUrl: affiliateUrl.trim(), resolvedUrl: resolvedUrl.toString(), accountId: expectedAccountId, networkSubId, originLink, utmSource, mmpPid, utmContent, format: "legacy" };
}
