/**
 * Pure Shopee affiliate redirect URL builder.
 *
 * This module has no `server-only` boundary -- it contains only pure
 * synchronous logic that is safe to import from tests and non-server
 * code.
 */

import { parseShopeeProductUrl } from "@/lib/shopee/product-url-parser";

const accountIdPattern = /^an_[0-9]+$/;
const networkSubIdPattern = /^vaflnk[a-f0-9]{24}$/;

export function buildShopeeAffiliateRedirectUrl({
  canonicalDestinationUrl,
  accountId,
  networkSubId,
}: {
  canonicalDestinationUrl: string;
  accountId: string;
  networkSubId: string;
}): string {
  if (!canonicalDestinationUrl || !canonicalDestinationUrl.trim()) {
    throw new Error("canonicalDestinationUrl must be a non-empty string");
  }

  if (!accountId || !accountId.trim()) {
    throw new Error("accountId must be a non-empty string");
  }

  if (!networkSubId || !networkSubId.trim()) {
    throw new Error("networkSubId must be a non-empty string");
  }

  if (!accountIdPattern.test(accountId)) {
    throw new Error(
      "accountId must match the pattern an_<digits>",
    );
  }

  if (!networkSubIdPattern.test(networkSubId)) {
    throw new Error(
      "networkSubId must match the pattern vaflnk[a-f0-9]{24}",
    );
  }

  // Use parseShopeeProductUrl to validate - rejects shope.ee, short links,
  // non-Shopee hosts, and non-product paths. This ensures the builder
  // only generates affiliate URLs for canonical product destinations.
  let canonicalUrl: string;
  try {
    const parsed = parseShopeeProductUrl(canonicalDestinationUrl);
    canonicalUrl = parsed.canonicalUrl;
  } catch {
    throw new Error(
      "canonicalDestinationUrl must be a valid Shopee product URL",
    );
  }

  const affiliateId = accountId.slice(3);

  const params = new URLSearchParams({
    origin_link: canonicalUrl,
    affiliate_id: affiliateId,
    sub_id: `${networkSubId}-web-direct-na-na`,
  });

  return `https://s.shopee.vn/an_redir?${params.toString()}`;
}
