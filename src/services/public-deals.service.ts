/**
 * Phase 20I.1 -- selectors for the public deal/voucher catalog.
 *
 * Buyer-facing selectors that never leak internal identifiers.
 *
 * Phase 20I.2 -- the selectors now consume a normalized/sanitized
 * catalog snapshot produced by `composePublicCatalog` (see
 * `@/lib/deals/public-deal-catalog.source`). The snapshot is built
 * from the manual / mock seed plus zero or more
 * `PublicOfferFeedAdapter` payloads.
 *
 * This module exposes ONLY synchronous selectors because the
 * existing buyer-facing RSC routes call them synchronously. A future
 * async refresh path can hydrate this snapshot without changing the
 * selector signatures. Until then the snapshot is built from the
 * manual PUBLIC_DEALS seed through `composePublicCatalog()`, which
 * keeps the buyer-facing reads sync and the manual fallback stable.
 */

import {
  ALL_CATEGORY_SLUGS,
  PUBLIC_CATEGORIES,
  PUBLIC_PLATFORMS,
} from "@/lib/mock/public-deals";
import {
  composePublicCatalog,
  type PublicDealCatalogSource,
} from "@/lib/deals/public-deal-catalog.source";

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
 * Validate a raw `?category=` query value against the real, allowed
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

let cachedSnapshot: PublicDealCatalogSource | null = null;

/**
 * Build (or reuse) the public deal catalog snapshot used by every
 * sync selector.
 *
 * Why synchronous: the existing buyer-facing RSC routes call the
 * selectors synchronously. The snapshot is built from the manual
 * seed plus an empty adapter list, which equals the sanitized
 * manual list returned by `composePublicCatalog()`. A future
 * async refresh path could hydrate this snapshot without changing
 * the selector signatures; until it is wired, this sync helper
 * remains the single source the buyer-facing layer consumes.
 */
export function getPublicDealCatalogSnapshotSync(): PublicDealCatalogSource {
  if (cachedSnapshot) return cachedSnapshot;
  cachedSnapshot = composePublicCatalog({ adapterResults: [] });
  return cachedSnapshot;
}

/**
 * Force the next call to re-seed the snapshot. Test-only hook.
 */
export function resetPublicDealCatalogSnapshot(): void {
  cachedSnapshot = null;
}

export function listFeaturedDeals(): ReadonlyArray<PublicDeal> {
  const snap = getPublicDealCatalogSnapshotSync();
  return snap.all.filter(
    (d) => d.status === "active" && d.isFeatured === true,
  );
}

export function listDealsByPlatform(
  platform: PublicDeal["platform"],
): ReadonlyArray<PublicDeal> {
  const snap = getPublicDealCatalogSnapshotSync();
  return snap.all.filter((d) => d.platform === platform);
}

export function listDealsByCategory(
  platform: PublicDeal["platform"],
  category: DealCategorySlug,
): ReadonlyArray<PublicDeal> {
  const snap = getPublicDealCatalogSnapshotSync();
  if (category === "all") {
    return snap.all.filter(
      (d) => d.platform === platform && d.status === "active",
    );
  }
  return snap.all.filter(
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

  // Phase 20I.4 -- "Sao chép mã" is shown ONLY when the deal is a
  // voucher kind AND it carries a real, non-empty voucher code.
  // If `code` is null (e.g. an adapter-sourced record without a
  // vendor-supplied code) the CTA falls through to "Mở ưu đãi" so
  // the buyer never sees a copy button that would copy nothing.
  if (deal.kind === "voucher_code" && deal.code && deal.status === "active") {
    return {
      ctaLabel: "Sao chép mã",
      ctaHref: null,
      ctaIntent: "copy",
      supportsCopy: true,
      code: deal.code,
    };
  }

  // Phase 20I.4 -- outbound CTA wording: "Mở ưu đãi" is the safe
  // default. We use "Xem sản phẩm" only when the deal has no
  // offerLink / destinationUrl but carries a productLink (the rare
  // Shopee product-feed case).
  const outboundLabel =
    deal.offerLink || deal.destinationUrl ? "Mở ưu đãi" : "Xem sản phẩm";
  return {
    ctaLabel: outboundLabel,
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
