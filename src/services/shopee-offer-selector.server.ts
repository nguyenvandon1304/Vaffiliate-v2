/**
 * Server-only entry point for the Shopee offer selector.
 *
 * This module imports the `server-only` guard so that production
 * code MUST wire the offer selector through this surface. The
 * pure factory itself lives in {@link "./shopee-offer-selector.factory"}
 * so unit tests can construct selectors against in-memory
 * repositories without triggering the guard.
 *
 * Production callers must:
 *
 *   1. construct a {@link ShopeeCatalogRepository} wired to the
 *      Drizzle-backed affiliate catalog lookup;
 *   2. call {@link createShopeeOfferSelector} from this module to
 *      build the selector;
 *   3. inject the selector through
 *      {@link import("@/services/shopee-cashback-quote.service").ResolveShopeeDependencies}.
 *
 * Until the affiliate catalog exposes a product/shop/category
 * → offer mapping, the selector will return `eligibility_unknown`
 * for every product (which is the honest answer). The factory
 * NEVER picks an offer just because it is the only active Shopee
 * offer, and NEVER treats an offer as platform-wide unless the
 * catalog row explicitly records that flag.
 */

import "server-only";

export {
  createShopeeOfferSelector,
} from "./shopee-offer-selector.factory";
