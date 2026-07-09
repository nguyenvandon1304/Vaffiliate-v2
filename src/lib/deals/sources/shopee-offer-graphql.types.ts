/**
 * Phase 20I.4 -- server-only GraphQL query builders for the Shopee
 * Open API offer feed endpoints.
 *
 * The builders produce the GraphQL `query` string and the
 * `variables` payload. They NEVER call the network themselves; the
 * caller (the live fetch foundation) passes the payload to a
 * dependency-injected fetch implementation, which makes the layer
 * trivially testable.
 *
 * Endpoints documented:
 *
 *   - POST https://open-api.affiliate.shopee.vn/graphql
 *
 * The three offer queries we care about:
 *
 *   - shopeeOfferV2
 *   - brandOfferV2
 *   - productOfferV2
 *
 * Sort types are constrained to the documented values so a caller
 * cannot pass an out-of-range enum. We never guess the SHA256
 * signing algorithm here -- the AuthProvider in
 * `shopee-offer-auth.types.ts` is the only place that knows how
 * to construct the Authorization header.
 */

import type {
  ShopeeOfferSortType,
  ShopeeProductOfferSortType,
} from "./shopee-offer-raw.types";

/** Sort-type vocabulary for shopeeOfferV2 / brandOfferV2. */
export const SHOPEE_OFFER_SORT_TYPES: ReadonlyArray<ShopeeOfferSortType> = [
  1, 2,
];

/** Sort-type vocabulary for productOfferV2. */
export const SHOPEE_PRODUCT_OFFER_SORT_TYPES: ReadonlyArray<ShopeeProductOfferSortType> = [
  1, 2, 3,
];

export interface ShopeeOfferV2QueryInput {
  readonly keyword: string;
  readonly sortType: ShopeeOfferSortType;
  readonly page: number;
  readonly limit: number;
}

export interface BrandOfferV2QueryInput {
  readonly keyword: string;
  readonly sortType: ShopeeOfferSortType;
  readonly page: number;
  readonly limit: number;
}

export interface ProductOfferV2QueryInput {
  readonly keyword: string;
  readonly sortType: ShopeeProductOfferSortType;
  readonly categoryId?: number;
  readonly page: number;
  readonly limit: number;
}

export interface ShopeeGraphqlRequest {
  readonly query: string;
  readonly variables: Record<string, unknown>;
}

const MIN_PAGE = 1;
const MAX_LIMIT = 1000;

function assertSafePage(page: number): void {
  if (!Number.isInteger(page) || page < MIN_PAGE) {
    throw new RangeError(
      `shopee-graphql: page must be an integer >= ${MIN_PAGE}; got ${page}`,
    );
  }
}

function assertSafeLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RangeError(
      `shopee-graphql: limit must be an integer in [1, ${MAX_LIMIT}]; got ${limit}`,
    );
  }
}

function assertSafeKeyword(keyword: string): string {
  if (typeof keyword !== "string") {
    throw new TypeError(
      `shopee-graphql: keyword must be a string; got ${typeof keyword}`,
    );
  }
  // Refuse anything that smells like GraphQL injection (string / newline
  // / brace / comment) so a malicious caller cannot break out of the
  // query envelope.
  if (/[\n\r"\\{}]/.test(keyword)) {
    throw new RangeError(
      `shopee-graphql: keyword contains forbidden characters`,
    );
  }
  const trimmed = keyword.trim();
  if (trimmed.length === 0) {
    throw new RangeError(
      `shopee-graphql: keyword must not be empty`,
    );
  }
  if (trimmed.length > 200) {
    throw new RangeError(
      `shopee-graphql: keyword must be at most 200 characters`,
    );
  }
  return trimmed;
}

function assertSafeCategoryId(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      `shopee-graphql: categoryId must be a non-negative safe integer; got ${value}`,
    );
  }
  return value;
}

function assertSafeSortType(
  value: number,
  allowed: ReadonlyArray<number>,
): void {
  if (!allowed.includes(value)) {
    throw new RangeError(
      `shopee-graphql: sortType must be one of ${allowed.join(", ")}; got ${value}`,
    );
  }
}

/**
 * Build the shopeeOfferV2 GraphQL request. Keyword, sort type, page
 * and limit are validated at the boundary so we never emit a query
 * the Shopee API would reject.
 */
export function buildShopeeOfferV2Query(
  input: ShopeeOfferV2QueryInput,
): ShopeeGraphqlRequest {
  assertSafeKeyword(input.keyword);
  assertSafeSortType(input.sortType, SHOPEE_OFFER_SORT_TYPES);
  assertSafePage(input.page);
  assertSafeLimit(input.limit);
  return {
    query: SHOPEE_OFFER_V2_QUERY,
    variables: {
      keyword: input.keyword,
      sortType: input.sortType,
      page: input.page,
      limit: input.limit,
    },
  };
}

/**
 * Build the brandOfferV2 GraphQL request.
 */
export function buildBrandOfferV2Query(
  input: BrandOfferV2QueryInput,
): ShopeeGraphqlRequest {
  assertSafeKeyword(input.keyword);
  assertSafeSortType(input.sortType, SHOPEE_OFFER_SORT_TYPES);
  assertSafePage(input.page);
  assertSafeLimit(input.limit);
  return {
    query: BRAND_OFFER_V2_QUERY,
    variables: {
      keyword: input.keyword,
      sortType: input.sortType,
      page: input.page,
      limit: input.limit,
    },
  };
}

/**
 * Build the productOfferV2 GraphQL request.
 */
export function buildProductOfferV2Query(
  input: ProductOfferV2QueryInput,
): ShopeeGraphqlRequest {
  assertSafeKeyword(input.keyword);
  assertSafeSortType(input.sortType, SHOPEE_PRODUCT_OFFER_SORT_TYPES);
  assertSafePage(input.page);
  assertSafeLimit(input.limit);
  const categoryId = assertSafeCategoryId(input.categoryId);
  return {
    query: PRODUCT_OFFER_V2_QUERY,
    variables: {
      keyword: input.keyword,
      sortType: input.sortType,
      categoryId,
      page: input.page,
      limit: input.limit,
    },
  };
}

/**
 * Documented GraphQL queries. Field selection is intentionally
 * narrow -- only the fields the normalizer consumes. Adding more
 * fields here would expand the buyer-facing attack surface (and the
 * number of fields the sanitiser has to scrub).
 */
const SHOPEE_OFFER_V2_QUERY = `query ShopeeOfferV2($keyword: String!, $sortType: Int!, $page: Int!, $limit: Int!) {
  shopeeOfferV2(keyword: $keyword, sortType: $sortType, page: $page, limit: $limit) {
    nodes {
      commissionRate
      imageUrl
      offerLink
      originalLink
      offerName
      offerType
      categoryId
      collectionId
      periodStartTime
      periodEndTime
    }
    pageInfo {
      page
      limit
      hasNextPage
    }
  }
}`;

const BRAND_OFFER_V2_QUERY = `query BrandOfferV2($keyword: String!, $sortType: Int!, $page: Int!, $limit: Int!) {
  brandOfferV2(keyword: $keyword, sortType: $sortType, page: $page, limit: $limit) {
    nodes {
      brandId
      brandName
      commissionRate
      imageUrl
      offerLink
      originalLink
      periodStartTime
      periodEndTime
    }
    pageInfo {
      page
      limit
      hasNextPage
    }
  }
}`;

const PRODUCT_OFFER_V2_QUERY = `query ProductOfferV2($keyword: String!, $sortType: Int!, $categoryId: Int64, $page: Int!, $limit: Int!) {
  productOfferV2(keyword: $keyword, sortType: $sortType, categoryId: $categoryId, page: $page, limit: $limit) {
    nodes {
      productName
      productLink
      productCatIds
      commissionRate
      price
      priceMin
      priceMax
      imageUrl
      offerLink
      shopId
      shopName
      ratingStar
      periodStartTime
      periodEndTime
    }
    pageInfo {
      page
      limit
      hasNextPage
    }
  }
}`;
