import type { TrackingLinkStatus } from "./affiliate";
import type { PlatformLabel } from "./common";
import type {
  CampaignId,
  OfferId,
  TrackingLinkId,
} from "./ids";

export interface CashbackPlatform {
  name: Extract<PlatformLabel, "Shopee" | "TikTok Shop">;
  description: string;
  cta: string;
}

export type CashbackPlatformName = Extract<PlatformLabel, "Shopee" | "TikTok Shop">;

export type CashbackPlatformCode =
  | "shopee"
  | "tiktok";


export type CashbackStatus = "pending" | "approved" | "paid";

export interface CashbackHistoryItem {
  id: string;
  platform: CashbackPlatformName;
  title: string;
  amount: string;
  status: CashbackStatus;
  date: string;
}

export interface CashbackData {
  platforms: CashbackPlatform[];
  history: CashbackHistoryItem[];
}

export interface CashbackStat {
  label: string;
  value: string;
}

export interface CashbackTrackingLinkResult {
  id: TrackingLinkId;
  shortCode: string;
  destinationUrl: string;
  platform: CashbackPlatformCode;
  campaignId: CampaignId | null;
  offerId: OfferId | null;
  status: TrackingLinkStatus;
  createdAt: string;
  networkSubId: string;
  affiliateUrl: string | null;
  trackingPath: string;
}

export interface CreateCashbackTrackingLinkActionState {
  success: boolean;
  message: string;
  trackingLink: CashbackTrackingLinkResult | null;
}
export interface ProvisionShopeeAffiliateUrlActionState {
  success: boolean;
  message: string;
  trackingLinkId: TrackingLinkId | null;
  affiliateUrl: string | null;
}
export type ShopeeProductPreviewLegacyErrorCode =
  | "invalid_url"
  | "unsupported_host"
  | "not_product_url"
  | "redirect_failed"
  | "too_many_redirects"
  | "request_timeout"
  | "service_unavailable"
  | "product_not_found"
  | "invalid_response"
  | "commission_unavailable";

/**
 * Phase 20H.2 -- discriminated union UI state for the Shopee cashback
 * preview flow.
 *
 * The action state is intentionally wide: a successful lookup may
 * still produce an "unavailable" quote when the affiliate catalog
 * has no concrete product→offer mapping, but the metadata is
 * always surfaced so the user can see which Shopee product was
 * recognized.
 *
 *   - `resolution_failed` — the URL was bad or metadata could not be
 *     fetched; the action state carries no product.
 *   - `quote_unavailable`  — metadata was fetched successfully, but
 *     the offer selector could not determine a cashback quote. The
 *     product metadata is still rendered and the typed reason is
 *     stored in `errorCode` for tests.
 *   - `quote_available`    — metadata + quote are both fetched.
 */
export type ShopeeProductPreviewState =
  | "resolution_failed"
  | "quote_unavailable"
  | "quote_available";

export type ShopeeProductPreviewFailureCode =
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

export type ShopeeProductPreviewQuoteUnavailableReason =
  | "no_active_offer"
  | "product_not_eligible"
  | "eligibility_unknown"
  | "commission_rate_unavailable"
  | "cashback_policy_unavailable";

export type ShopeeProductPreviewErrorCode2 =
  | ShopeeProductPreviewFailureCode
  | ShopeeProductPreviewQuoteUnavailableReason;
export type ShopeeProductPreviewErrorCode =
  ShopeeProductPreviewErrorCode2;

/**
 * UI-facing metadata snapshot. Mirrors the canonical server
 * metadata shape but flattens image/price/availability for the UI.
 */
export interface ShopeeProductPreviewMetadataView {
  readonly platform: "shopee";
  readonly productUrl: string;
  readonly productName: string;
  readonly shopName: string | null;
  readonly imageUrl: string;
  readonly priceVnd: number;
  readonly availability: "available" | "unavailable" | "unknown";
  readonly fetchedAt: string;
}

export interface ShopeeProductPreviewAvailableQuote {
  readonly status: "available";
  readonly product: ShopeeProductPreviewMetadataView;
  readonly cashbackShareBps: number;
  readonly estimatedCashbackVnd: number;
  readonly calculatedAt: string;
  readonly isEstimate: true;
}

export interface ShopeeProductPreviewUnavailableQuote {
  readonly status: "unavailable";
  readonly product: ShopeeProductPreviewMetadataView;
  readonly reason: ShopeeProductPreviewQuoteUnavailableReason;
  readonly message: string;
}

export type ShopeeProductPreviewQuote =
  | ShopeeProductPreviewAvailableQuote
  | ShopeeProductPreviewUnavailableQuote;

export interface PreviewShopeeProductPreviewActionState {
  ok: boolean;
  message: string;
  state: ShopeeProductPreviewState;
  errorCode: ShopeeProductPreviewErrorCode2 | null;
  product: ShopeeProductPreviewMetadataView | null;
  quote: ShopeeProductPreviewQuote | null;
}

/**
 * Phase 20H.2 -- read-only server-boundary view of a successful
 * Shopee cashback quote. Kept for any consumer that imports the
 * legacy `ShopeeCashbackQuoteView` symbol; new code should switch
 * to the discriminated `ShopeeProductPreviewQuote` union.
 *
 * Mirrors the discriminated
 * {@link import("@/services/shopee-cashback-quote.types").ShopeeCashbackQuoteResult}
 * union in a UI-friendly shape. The shape is intentionally narrow:
 * it never carries raw HTML, stack traces, or provider internals.
 */
export interface ShopeeCashbackQuoteView {
  platform: "shopee";
  productUrl: string;
  productName: string;
  shopName: string | null;
  imageUrl: string;
  priceVnd: number;
  estimatedCashbackVnd: number;
  cashbackShareBps: number;
  calculatedAt: string;
  isEstimate: true;
}

export type ShopeeCashbackQuoteErrorCode =
  | "invalid_input"
  | "invalid_url"
  | "unsupported_host"
  | "not_product_url"
  | "redirect_failed"
  | "too_many_redirects"
  | "product_not_found"
  | "product_unavailable"
  | "metadata_unavailable"
  | "metadata_incomplete"
  | "provider_timeout"
  | "provider_response_invalid"
  | "no_active_offer"
  | "product_not_eligible"
  | "eligibility_unknown"
  | "commission_rate_unavailable"
  | "cashback_policy_unavailable";

export interface PreviewShopeeCashbackQuoteActionState {
  success: boolean;
  message: string;
  errorCode: ShopeeCashbackQuoteErrorCode | null;
  quote: ShopeeCashbackQuoteView | null;
}
