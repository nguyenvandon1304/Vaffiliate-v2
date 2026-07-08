/**
 * Phase 20I.2 -- raw Addlivetag offer payloads.
 *
 * These types describe the JSON shape that the three Addlivetag v2
 * offer endpoints return. They are deliberately OUTSIDE the
 * buyer-facing model so any leakage stays inside this file -- the
 * public catalog only ever consumes these via the adapter + normalizer
 * pipeline, which strips every internal identifier (productId,
 * shopId, brandId, categoryId, collectionId, original commission rate,
 * etc.) before anything reaches the UI.
 *
 * The names below mirror the Addlivetag REST contract:
 *
 *   - shopeeOfferV2:    /offer/shopee-offer-v2
 *   - brandOfferV2:     /offer/brand-offer-v2
 *   - productOfferV2:   /offer/product-offer-v2
 *
 * Until the real contract is pinned, the adapter fetches these as a
 * "best effort" mapping. None of the fields are typed as required
 * because every real payload we have observed has at least one
 * optional / missing field. The normalizer treats missing fields as
 * "drop / default" rather than "abort".
 */

export interface AddlivetagShopeeOfferV2Raw {
  readonly offerName?: string;
  readonly offerLink?: string;
  readonly originalLink?: string;
  readonly imageUrl?: string;
  readonly commissionRate?: number;
  readonly offerType?: number;
  readonly categoryId?: number;
  readonly collectionId?: number;
  readonly periodStartTime?: number;
  readonly periodEndTime?: number;
  readonly [vendor: string]: unknown;
}

export interface AddlivetagBrandOfferV2Raw {
  readonly brandId?: number;
  readonly brandName?: string;
  readonly commissionRate?: number;
  readonly imageUrl?: string;
  readonly offerLink?: string;
  readonly originalLink?: string;
  readonly periodStartTime?: number;
  readonly periodEndTime?: number;
  readonly [vendor: string]: unknown;
}

export interface AddlivetagProductOfferV2Raw {
  readonly productId?: number;
  readonly productName?: string;
  readonly commissionRate?: number;
  readonly price?: number;
  readonly priceMin?: number;
  readonly priceMax?: number;
  readonly imageUrl?: string;
  readonly offerLink?: string;
  readonly shopId?: number;
  readonly shopName?: string;
  readonly soldCount?: number;
  readonly ratingStar?: number;
  readonly periodStartTime?: number;
  readonly periodEndTime?: number;
  readonly [vendor: string]: unknown;
}

/**
 * Map a `shopeeOfferV2` payload to the canonical `RawOffer` envelope
 * that the public-deal normalizer consumes.
 *
 * Vendor-specific fields (offerType, categoryId, collectionId) are
 * NOT forwarded to `RawOffer.extra` because the buyer-facing model
 * drops `extra` before reaching the UI.
 */
export function mapShopeeOfferV2ToRawOffer(
  raw: AddlivetagShopeeOfferV2Raw,
): import("./public-offer-feed.types").RawOffer {
  return {
    vendorId: deriveVendorId("shopeeOfferV2", raw.offerLink ?? raw.originalLink),
    platform: "shopee",
    kind: "deal",
    title: typeof raw.offerName === "string" ? raw.offerName : undefined,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
    destinationUrl:
      typeof raw.originalLink === "string" ? raw.originalLink : undefined,
    validUntil:
      typeof raw.periodEndTime === "number"
        ? new Date(raw.periodEndTime).toISOString()
        : undefined,
    validFrom:
      typeof raw.periodStartTime === "number"
        ? new Date(raw.periodStartTime).toISOString()
        : undefined,
    status: "active",
    tracking: {
      affiliateUrl: raw.offerLink,
    },
  };
}

/**
 * Map a `brandOfferV2` payload to the canonical `RawOffer` envelope.
 * brandId is dropped, not parked into `extra`.
 */
export function mapBrandOfferV2ToRawOffer(
  raw: AddlivetagBrandOfferV2Raw,
): import("./public-offer-feed.types").RawOffer {
  return {
    vendorId: deriveVendorId("brandOfferV2", raw.brandName),
    platform: "shopee",
    kind: "voucher_code",
    title: typeof raw.brandName === "string" ? raw.brandName : undefined,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
    destinationUrl:
      typeof raw.originalLink === "string" ? raw.originalLink : undefined,
    validUntil:
      typeof raw.periodEndTime === "number"
        ? new Date(raw.periodEndTime).toISOString()
        : undefined,
    validFrom:
      typeof raw.periodStartTime === "number"
        ? new Date(raw.periodStartTime).toISOString()
        : undefined,
    status: "active",
    voucherLabel: undefined,
    tracking: {
      affiliateUrl: raw.offerLink,
    },
  };
}

/**
 * Map a `productOfferV2` payload to the canonical `RawOffer` envelope.
 * productId, shopId, raw commission rate, raw price and rating are
 * dropped, not parked into `extra`.
 */
export function mapProductOfferV2ToRawOffer(
  raw: AddlivetagProductOfferV2Raw,
): import("./public-offer-feed.types").RawOffer {
  return {
    vendorId: deriveVendorId("productOfferV2", raw.productName),
    platform: "shopee",
    kind: "deal",
    title: typeof raw.productName === "string" ? raw.productName : undefined,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
    destinationUrl:
      typeof raw.originalLink === "string" ? raw.originalLink : undefined,
    validUntil:
      typeof raw.periodEndTime === "number"
        ? new Date(raw.periodEndTime).toISOString()
        : undefined,
    validFrom:
      typeof raw.periodStartTime === "number"
        ? new Date(raw.periodStartTime).toISOString()
        : undefined,
    status: "active",
    tracking: {
      affiliateUrl: raw.offerLink,
    },
  };
}

/**
 * Derive a deterministic vendor id from the kind + a stable suffix.
 * The vendor id is the catalog dedupe key; we never want it to leak
 * into buyer-facing markup so it has to be opaque and short.
 */
function deriveVendorId(
  kind: "shopeeOfferV2" | "brandOfferV2" | "productOfferV2",
  suffix: unknown,
): string {
  const seed = typeof suffix === "string" ? suffix : "";
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) >>> 0;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `${kind}-${h.toString(16).padStart(8, "0")}`;
}
