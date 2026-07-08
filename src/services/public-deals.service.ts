/**
 * Phase 20I.1 -- selectors for the public deal/voucher catalog.
 *
 * Buyer-facing selectors that never leak internal identifiers.
 */

import {
  ALL_CATEGORY_SLUGS,
  PUBLIC_CATEGORIES,
  PUBLIC_DEALS,
  PUBLIC_PLATFORMS,
} from "@/lib/mock/public-deals";

import type {
  DealAction,
  DealCategoryDescriptor,
  DealCategorySlug,
  PlatformDescriptor,
  PublicDeal,
} from "./public-deals.types";

export function listPlatforms(): ReadonlyArray<PlatformDescriptor> {
  return PUBLIC_PLATFORMS;
}

export function listCategories(): ReadonlyArray<DealCategoryDescriptor> {
  return PUBLIC_CATEGORIES;
}

const ALLOWED_CATEGORY_SLUGS = new Set<DealCategorySlug>(
  ALL_CATEGORY_SLUGS,
);

/**
 * Validate a raw \`?category=\` query value against the real, allowed
 * slug list. Falls back to the "all" sentinel for missing, malformed,
 * or unknown values. The regex pre-check mirrors the original guard so
 * unexpected glyphs (e.g. embedded slashes) never reach the typed
 * slug comparison.
 */
export function parseCategorySlug(raw: unknown): DealCategorySlug {
  if (typeof raw !== "string") return "all";
  if (!/^[a-z-]+$/.test(raw)) return "all";
  if (!ALLOWED_CATEGORY_SLUGS.has(raw as DealCategorySlug)) return "all";
  return raw as DealCategorySlug;
}

export function listFeaturedDeals(): ReadonlyArray<PublicDeal> {
  return PUBLIC_DEALS.filter(
    (d) => d.status === "active" && d.isFeatured === true,
  );
}

export function listDealsByPlatform(
  platform: PublicDeal["platform"],
): ReadonlyArray<PublicDeal> {
  return PUBLIC_DEALS.filter((d) => d.platform === platform);
}

export function listDealsByCategory(
  platform: PublicDeal["platform"],
  category: DealCategorySlug,
): ReadonlyArray<PublicDeal> {
  if (category === "all") {
    return PUBLIC_DEALS.filter(
      (d) => d.platform === platform && d.status === "active",
    );
  }
  return PUBLIC_DEALS.filter(
    (d) =>
      d.platform === platform &&
      d.status === "active" &&
      d.categorySlug === category,
  );
}

export function getDealAction(deal: PublicDeal): DealAction {
  if (deal.status === "expired") {
    return {
      ctaLabel: "Đã hết hạn",
      ctaHref: null,
      ctaIntent: "disabled",
      supportsCopy: false,
      code: null,
    };
  }

  if (deal.kind === "cashback_program" && deal.platform === "shopee") {
    return {
      ctaLabel: "Xem điều kiện hoàn tiền",
      ctaHref: "/cashback",
      ctaIntent: "cashback",
      supportsCopy: false,
      code: null,
    };
  }

  if (deal.kind === "voucher_code" && deal.code && deal.status === "active") {
    return {
      ctaLabel: "Sao chép mã",
      ctaHref: null,
      ctaIntent: "copy",
      supportsCopy: true,
      code: deal.code,
    };
  }

  return {
    ctaLabel:
      deal.kind === "deal" ? "Xem deal" : "Mở trang ưu đãi",
    ctaHref: deal.destinationUrl,
    ctaIntent: "outbound",
    supportsCopy: false,
    code: null,
  };
}

export interface SerializedDealAction {
  readonly ctaLabel: string;
  readonly ctaHref: string | null;
  readonly ctaIntent: DealAction["ctaIntent"];
  readonly supportsCopy: boolean;
  readonly code: string | null;
}

export function serializeDealAction(
  action: DealAction,
): SerializedDealAction {
  return {
    ctaLabel: action.ctaLabel,
    ctaHref: action.ctaHref,
    ctaIntent: action.ctaIntent,
    supportsCopy: action.supportsCopy,
    code: action.code,
  };
}
