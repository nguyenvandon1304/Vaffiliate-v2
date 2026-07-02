/**
 * Server-only re-export wrapper for the Shopee affiliate URL verifier.
 *
 * Production server-side code imports from this module. Tests import
 * from shopee-affiliate-url-verifier.ts directly (no server-only guard).
 */

import "server-only";

export {
  ShopeeAffiliateUrlError,
  verifyShopeeAffiliateUrl,
} from "./shopee-affiliate-url-verifier";

export type {
  ShopeeAffiliateUrlErrorCode,
  VerifiedShopeeAffiliateUrl,
  VerificationFailure,
  ShopeeAffiliateUrlVerificationResult,
} from "./shopee-affiliate-url-verifier";
