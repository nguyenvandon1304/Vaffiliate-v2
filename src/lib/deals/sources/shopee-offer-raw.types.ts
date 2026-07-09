/**
 * Phase 20I.4 -- raw Shopee Open API / GraphQL offer feed payload
 * shapes.
 *
 * These types describe the JSON shape that the three documented
 * Shopee Open API v2 GraphQL endpoints return:
 *
 *   - shopeeOfferV2:   offer list (campaigns / category-level)
 *   - brandOfferV2:    brand offer list
 *   - productOfferV2:  product-level offer list
 *
 * Every field is intentionally optional because the real Shopee
 * response can omit any of them per call. The normalizer (and the
 * GraphQL query builder, see `shopee-offer-graphql.types.ts`) treat
 * missing fields as "drop / default" rather than "abort".
 *
 * No internal tracking identifier belongs here. The
 * `affiliateUrl`-style redirect that Addlivetag stores in
 * `RawOffer.tracking.affiliateUrl` does NOT appear in the Shopee
 * public GraphQL response -- Shopee returns the public offer link
 * and the buyer-facing product link directly. The sanitiser still
 * strips any internal hint from those URLs before they reach the
 * buyer-facing model.
 *
 * Numeric fields (commissionRate, price, priceMin, priceMax,
 * ratingStar) are typed as `string | number` because the GraphQL
 * service has been observed to return either form depending on the
 * path. The normalizer coerces safely with `Number()` + finite check.
 *
 * Unix epoch seconds (periodStartTime / periodEndTime) are typed as
 * `number`; the normalizer converts them to ISO strings. We do NOT
 * divide by 1000 -- Shopee returns seconds, not milliseconds.
 */

/** Allow any extra vendor field for forward-compat. */
type WithVendorExtras = { readonly [vendor: string]: unknown };

/** Sort types documented for shopeeOfferV2 / brandOfferV2. */
export type ShopeeOfferSortType = 1 | 2;
/** Sort types documented for productOfferV2. */
export type ShopeeProductOfferSortType = 1 | 2 | 3;

export interface ShopeeOfferV2Raw extends WithVendorExtras {
  readonly offerName?: string;
  readonly offerLink?: string;
  readonly originalLink?: string;
  readonly imageUrl?: string;
  readonly commissionRate?: string | number;
  readonly offerType?: number;
  readonly categoryId?: number;
  readonly collectionId?: number;
  readonly periodStartTime?: number;
  readonly periodEndTime?: number;
}

export interface BrandOfferV2Raw extends WithVendorExtras {
  readonly brandId?: number;
  readonly brandName?: string;
  readonly commissionRate?: string | number;
  readonly imageUrl?: string;
  readonly offerLink?: string;
  readonly originalLink?: string;
  readonly periodStartTime?: number;
  readonly periodEndTime?: number;
}

export interface ProductOfferV2Raw extends WithVendorExtras {
  readonly productName?: string;
  readonly productLink?: string;
  readonly productCatIds?: ReadonlyArray<number>;
  readonly commissionRate?: string | number;
  readonly price?: string | number;
  readonly priceMin?: string | number;
  readonly priceMax?: string | number;
  readonly imageUrl?: string;
  readonly offerLink?: string;
  readonly shopId?: number;
  readonly shopName?: string;
  readonly ratingStar?: string | number;
  readonly periodStartTime?: number;
  readonly periodEndTime?: number;
}

/** Standard GraphQL PageInfo the three endpoints share. */
export interface ShopeePageInfoRaw {
  readonly page?: number;
  readonly limit?: number;
  readonly hasNextPage?: boolean;
}

/** Wrapper returned by every Shopee offer feed GraphQL endpoint. */
export interface ShopeeOfferConnectionV2Raw {
  readonly nodes: ReadonlyArray<ShopeeOfferV2Raw>;
  readonly pageInfo?: ShopeePageInfoRaw | null;
}

export interface ShopeeBrandOfferConnectionV2Raw {
  readonly nodes: ReadonlyArray<BrandOfferV2Raw>;
  readonly pageInfo?: ShopeePageInfoRaw | null;
}

export interface ShopeeProductOfferConnectionV2Raw {
  readonly nodes: ReadonlyArray<ProductOfferV2Raw>;
  readonly pageInfo?: ShopeePageInfoRaw | null;
}
