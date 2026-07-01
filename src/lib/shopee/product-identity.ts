/**
 * Shared Shopee product identity contract.
 *
 * Pure type module -- no runtime imports, no `server-only` guard --
 * so the identity contract can be referenced from any layer
 * (parsers, application services, server actions, tests).
 */

export interface ShopeeProductIdentity {
  shopId: string;
  itemId: string;
  canonicalUrl: string;
}