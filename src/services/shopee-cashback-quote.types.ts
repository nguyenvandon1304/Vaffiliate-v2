/**
 * Public Shopee cashback quote DTOs.
 *
 * Phase 20H.2 -- the quote contract sits between the metadata
 * provider, the affiliate catalog, and the canonical cashback policy.
 * Downstream layers (UI, Server Actions) only see discriminated
 * union results; never raw provider or catalog exceptions.
 *
 * Two view shapes are exposed:
 *
 *   - {@link ShopeeCashbackQuoteResult} — the strict quote contract
 *     that fails as soon as any dependency is missing.
 *   - {@link ShopeeProductPreviewResult} — a wider discriminated union
 *     that preserves product metadata when the quote cannot be
 *     computed. Metadata must not be discarded simply because the
 *     offer selection returned `eligibility_unknown`.
 */

import type { CampaignId, OfferId } from "@/types/ids";
import type { Money } from "@/types/affiliate";

import type { ShopeeProductMetadata } from "@/lib/shopee/product-metadata/types";

// ---------------------------------------------------------------------------
// Quote value object
// ---------------------------------------------------------------------------

/**
 * Successful cashback quote snapshot.
 *
 * All money fields are integer VND. The required invariant is
 * guaranteed by the service:
 *
 *     estimatedUserCashback.amount
 *     + estimatedPlatformProfit.amount
 *     === estimatedNetworkCommission.amount
 */
export interface ShopeeCashbackQuote {
  readonly product: ShopeeProductMetadata;

  readonly campaignId: CampaignId;
  readonly offerId: OfferId;

  readonly estimatedOrderAmount: Money;
  readonly estimatedNetworkCommission: Money;
  readonly estimatedUserCashback: Money;
  readonly estimatedPlatformProfit: Money;

  /**
   * Cashback share applied to the network commission, in basis
   * points. Pulled verbatim from the persisted cashback policy.
   */
  readonly cashbackShareBps: number;

  /**
   * Network commission rate applied to the order amount, in basis
   * points. `null` means the rate is not yet available from the
   * catalog; the service never fabricates a number.
   */
  readonly estimatedCommissionRateBps: number | null;

  /**
   * Always `true`. The discriminator field documents that the
   * numbers are estimates -- actual settlement happens later in the
   * conversion pipeline.
   */
  readonly isEstimate: true;

  /**
   * ISO-8601 UTC timestamp recorded at the moment the quote was
   * computed. Stale quotes must NEVER be presented as authoritative
   * commission figures.
   */
  readonly calculatedAt: string;
}

// ---------------------------------------------------------------------------
// Failure reasons (exhaustive)
// ---------------------------------------------------------------------------

export type ProductResolutionFailureCode =
  | "invalid_input"
  | "invalid_url"
  | "unsupported_host"
  | "not_product_url"
  | "redirect_failed"
  | "too_many_redirects"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_response_invalid"
  | "metadata_unavailable"
  | "metadata_incomplete"
  | "product_not_found"
  | "product_unavailable";

export type QuoteUnavailableReason =
  | "no_active_offer"
  | "product_not_eligible"
  | "eligibility_unknown"
  | "commission_rate_unavailable"
  | "cashback_policy_unavailable";

// ---------------------------------------------------------------------------
// Strict quote result (legacy shape, kept for callers that want a hard
// fail when any dependency is missing).
// ---------------------------------------------------------------------------

export type ShopeeCashbackQuoteFailureCode =
  | ProductResolutionFailureCode
  | QuoteUnavailableReason;

export interface ShopeeCashbackQuoteFailure {
  readonly ok: false;
  readonly reason: ShopeeCashbackQuoteFailureCode;
  /**
   * User-facing message. NEVER include stack traces, HTML, or raw
   * exception messages; the service composes a sanitized string for
   * each code.
   */
  readonly message: string;
}

export interface ShopeeCashbackQuoteSuccess {
  readonly ok: true;
  readonly quote: ShopeeCashbackQuote;
}

export type ShopeeCashbackQuoteResult =
  | ShopeeCashbackQuoteSuccess
  | ShopeeCashbackQuoteFailure;

// ---------------------------------------------------------------------------
// Product preview result (wider, metadata-preserving discriminated union).
// ---------------------------------------------------------------------------

/**
 * UI-facing metadata snapshot. Mirrors {@link ShopeeProductMetadata}
 * but flattens image/price/optional fields so the discriminated
 * union has no nested nullable confusions.
 */
export interface ShopeeProductMetadataView {
  readonly platform: "shopee";
  readonly productUrl: string;
  readonly productName: string;
  readonly shopName: string | null;
  readonly imageUrl: string;
  readonly priceVnd: number;
  readonly availability: "available" | "unavailable" | "unknown";
  readonly fetchedAt: string;
}

export interface ShopeeProductMetadataUnavailableQuote {
  readonly status: "unavailable";
  readonly reason: QuoteUnavailableReason;
  /**
   * Human-friendly message describing why the quote could not be
   * computed. Always rendered above any cashback figure and never
   * replaced with a fake zero.
   */
  readonly message: string;
}

export interface ShopeeProductMetadataAvailableQuote {
  readonly status: "available";
  readonly value: ShopeeCashbackQuote;
}

export type ShopeeProductMetadataQuote =
  | ShopeeProductMetadataUnavailableQuote
  | ShopeeProductMetadataAvailableQuote;

export interface ShopeeProductPreviewSuccess {
  readonly ok: true;
  readonly product: ShopeeProductMetadataView;
  readonly quote: ShopeeProductMetadataQuote;
}

export interface ShopeeProductPreviewFailure {
  readonly ok: false;
  readonly reason: ProductResolutionFailureCode;
  readonly message: string;
  readonly product: null;
}

export type ShopeeProductPreviewResult =
  | ShopeeProductPreviewSuccess
  | ShopeeProductPreviewFailure;
