/**
 * Phase 20I.1 -- shared types for the public deal/voucher catalog.
 *
 * Buyer-facing only. Internal tracking identifiers (networkSubId,
 * sourceSubId1, purchaseIntentId, trackingLinkId, publisherId,
 * shortCode, clickId, trackingPath, internal UUIDs) are excluded
 * from these types to prevent accidental leaks in public UI.
 *
 * Phase 20I.4 -- the model keeps a strict separation between the
 * three buyer-facing surfaces:
 *
 *   1. `code` (voucher code) -- only when the vendor feed actually
 *      carries a copy-able code. NEVER synthesised from a Shopee
 *      link, a shortCode, a product id, a campaign id, or an offer
 *      name. When absent the UI hides the copy-code action.
 *   2. `offerLink` / `productLink` -- canonical outbound
 *      destinations. `offerLink` is the affiliate redirect URL;
 *      the sanitiser still strips any internal tracking hint
 *      before it ever reaches the markup.
 *   3. `cashbackLabel` -- a textual estimate ("Hoa hồng chiến dịch
 *      7%"). The platform NEVER labels it as confirmed user cashback
 *      because the cashback source of truth is the Shopee /
 *      Addlivetag conversion report + reconciliation, NOT the
 *      offer feed.
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
  /**
   * Optional raw voucher code. Only ever populated when the source
   * feed actually carries one. NEVER synthesised from a Shopee URL,
   * product id, or short code. When absent the UI hides the
   * copy-code action.
   */
  readonly code?: string | null;
  /**
   * Optional raw Shopee product page (e.g.
   * `https://shopee.vn/product/...`). The sanitiser still scrubs
   * any internal tracking hint before it can reach the markup.
   */
  readonly productLink?: string | null;
  /**
   * Optional affiliate redirect URL. The sanitiser replaces this
   * with the merchant landing page whenever any internal tracking
   * hint is present. Buyer-facing copy still describes it as
   * "Mở ưu đãi", never as "Sao chép mã".
   */
  readonly offerLink?: string | null;
  /** Optional raw image URL. */
  readonly imageUrl?: string | null;
  /**
   * Optional platform commission rate (e.g. 0.07). This is NOT a
   * confirmed user cashback figure. The UI builds a "Hoa hồng
   * chiến dịch" label, never a "Hoàn tiền 7% chắc chắn" claim.
   */
  readonly commissionRate?: number | null;
  /**
   * Optional rendered cashback / commission label. Always
   * conditional wording. If absent the UI shows a safe fallback
   * such as "Cashback dự kiến theo điều kiện chương trình".
   */
  readonly cashbackLabel?: string | null;
  /** Optional shop name (vendor display only). */
  readonly shopName?: string | null;
  /** Optional rating (string or numeric decimal). */
  readonly rating?: string | null;
  /** Optional Shopee category ids (vendor metadata only). */
  readonly productCatIds?: ReadonlyArray<number> | null;
  /** Optional ISO-8601 start timestamp. */
  readonly startsAt?: string | null;
  /** Optional ISO-8601 end timestamp. */
  readonly endsAt?: string | null;
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
