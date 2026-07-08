/**
 * Phase 20I.1 -- shared types for the public deal/voucher catalog.
 *
 * Buyer-facing only. Internal tracking identifiers (networkSubId,
 * sourceSubId1, purchaseIntentId, trackingLinkId, publisherId,
 * shortCode, clickId, trackingPath, internal UUIDs) are excluded
 * from these types to prevent accidental leaks in public UI.
 */

export type DealPlatform = "shopee" | "lazada" | "tiktok" | "tiki";

export type DealKind = "voucher_code" | "deal" | "cashback_program";

export type DealStatus = "active" | "expired" | "draft";

export type DealCategorySlug =
  | "all"
  | "popular"
  | "zero-dong"
  | "live"
  | "shopeepay"
  | "electronics"
  | "fashion"
  | "beauty"
  | "home";

export interface PublicDealBase {
  readonly id: string;
  readonly platform: DealPlatform;
  readonly kind: DealKind;
  readonly status: DealStatus;
  readonly title: string;
  readonly description: string;
  readonly categorySlug: DealCategorySlug;
  readonly isExclusive: boolean;
  readonly isFeatured: boolean;
  readonly expiresAt: string | null;
  readonly destinationUrl: string;
  readonly discountText: string | null;
  readonly minSpendText: string | null;
  readonly code?: string | null;
}

export interface PublicVoucherDeal extends PublicDealBase {
  readonly kind: "voucher_code";
  readonly code: string | null;
}

export interface PublicPromoDeal extends PublicDealBase {
  readonly kind: "deal";
}

export interface PublicCashbackDeal extends PublicDealBase {
  readonly kind: "cashback_program";
  readonly estimatedCashbackBps: number | null;
  readonly cashbackWindowText: string;
  readonly termsNote: string;
}

export type PublicDeal =
  | PublicVoucherDeal
  | PublicPromoDeal
  | PublicCashbackDeal;

export type DealCtaIntent =
  | "copy"
  | "outbound"
  | "cashback"
  | "disabled";

export interface DealAction {
  readonly ctaIntent: DealCtaIntent;
  readonly ctaLabel: string;
  readonly ctaHref: string | null;
  readonly supportsCopy: boolean;
  readonly code: string | null;
}

/**
 * Internal tonal hint for distinguishing platform descriptors on the
 * public page without copying any official platform brand colour or
 * external trademark. Maps to a neutral palette token defined in CSS.
 */
export type PlatformToneToken = "warm" | "cool" | "neutral";

export interface PlatformDescriptor {
  readonly platform: DealPlatform;
  readonly displayName: string;
  readonly tagline: string;
  readonly isLive: boolean;
  readonly toneToken: PlatformToneToken;
}

export interface DealCategoryDescriptor {
  readonly slug: DealCategorySlug;
  readonly displayName: string;
  readonly description: string;
}
