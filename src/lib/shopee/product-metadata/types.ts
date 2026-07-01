/**
 * Shopee product metadata domain.
 *
 * Phase 20H.2 introduces a typed metadata contract that splits three
 * responsibilities into separate layers:
 *
 *   1. URL resolution        -> {@link @/lib/shopee/product-url}
 *   2. Product metadata      -> this module
 *   3. Cashback quote        -> {@link @/services/shopee-cashback-quote.service}
 *
 * The metadata contract is intentionally narrow: it represents
 * public-domain product data that can be derived from the canonical
 * Shopee product page. Cashback, commission, and attribution are
 * downstream concerns and MUST NOT leak into this module.
 */

import type { Money } from "@/types/affiliate";
import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";

export type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";

/**
 * Coarse availability signal reported by the metadata provider.
 *
 *   - "available"   product is present and price was extracted
 *   - "unavailable" the page explicitly marks the product as sold
 *                   out / no longer available
 *   - "unknown"     the provider cannot tell; callers must not assume
 *                   the product is sellable
 */
export type ShopeeProductAvailability =
  | "available"
  | "unavailable"
  | "unknown";

/**
 * Strict metadata snapshot for a single Shopee product.
 *
 * Money is integer VND. The metadata provider is the only place that
 * is allowed to coerce a raw string price into a typed {@link Money};
 * downstream layers must treat the value as authoritative.
 */
export interface ShopeeProductMetadata {
  readonly shopId: string;
  readonly itemId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly imageUrl: string;
  readonly price: Money;
  readonly shopName?: string;
  readonly availability: ShopeeProductAvailability;
}

/**
 * Provider contract.
 *
 * Implementations must be server-only and must surface typed errors
 * defined in {@link ./provider.errors}. The contract returns a plain
 * Promise so it can be consumed by Server Components, Server Actions,
 * or service orchestration code without any React/Next.js dependency.
 */
export interface ShopeeProductMetadataProvider {
  getProduct(
    identity: ShopeeProductIdentity,
  ): Promise<ShopeeProductMetadata>;
}