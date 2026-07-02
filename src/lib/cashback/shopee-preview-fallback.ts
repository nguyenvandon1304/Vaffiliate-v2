import { parseShopeeProductUrl } from "@/lib/shopee/product-url-parser";

export const SHOPEE_PREVIEW_PURCHASE_ALLOWED_FAILURES = [
  "metadata_incomplete",
  "metadata_unavailable",
  "provider_timeout",
  "provider_response_invalid",
] as const;

export type ShopeePreviewPurchaseAllowedFailure =
  (typeof SHOPEE_PREVIEW_PURCHASE_ALLOWED_FAILURES)[number];

export const SHOPEE_PREVIEW_PURCHASE_BLOCKED_FAILURES = [
  "invalid_input",
  "invalid_url",
  "unsupported_host",
  "not_product_url",
  "redirect_failed",
  "too_many_redirects",
  "provider_unavailable",
  "product_not_found",
  "product_unavailable",
] as const;

export type ShopeePreviewPurchaseBlockedFailure =
  (typeof SHOPEE_PREVIEW_PURCHASE_BLOCKED_FAILURES)[number];

export function isShopeePreviewPurchaseAllowedFailure(
  reason: string,
): reason is ShopeePreviewPurchaseAllowedFailure {
  return SHOPEE_PREVIEW_PURCHASE_ALLOWED_FAILURES.includes(
    reason as ShopeePreviewPurchaseAllowedFailure,
  );
}

export function isShopeePreviewPurchaseBlockedFailure(
  reason: string,
): reason is ShopeePreviewPurchaseBlockedFailure {
  return SHOPEE_PREVIEW_PURCHASE_BLOCKED_FAILURES.includes(
    reason as ShopeePreviewPurchaseBlockedFailure,
  );
}

export type ShopeePreviewFallbackState =
  | "metadata_incomplete_purchase_allowed"
  | "metadata_unavailable_purchase_allowed";

export interface ShopeePreviewFallbackResult {
  allowed: true;
  state: ShopeePreviewFallbackState;
  canonicalProductUrl: string;
}

export type ShopeePreviewFallbackDecision =
  | ShopeePreviewFallbackResult
  | { allowed: false };

export function createShopeePreviewFallbackDecision(
  reason: string,
  productUrlOrCanonical: string,
): ShopeePreviewFallbackDecision {
  if (!isShopeePreviewPurchaseAllowedFailure(reason)) {
    return { allowed: false };
  }

  if (!productUrlOrCanonical) {
    return { allowed: false };
  }

  let canonicalUrl: string | null = null;
  try {
    const parsed = parseShopeeProductUrl(productUrlOrCanonical);
    canonicalUrl = parsed.canonicalUrl;
  } catch {
    return { allowed: false };
  }

  if (!canonicalUrl) {
    return { allowed: false };
  }

  const state: ShopeePreviewFallbackState =
    reason === "metadata_incomplete"
      ? "metadata_incomplete_purchase_allowed"
      : "metadata_unavailable_purchase_allowed";

  return {
    allowed: true,
    state,
    canonicalProductUrl: canonicalUrl,
  };
}