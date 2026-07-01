/**
 * Canonical allowlist for Shopee product image hosts.
 *
 * Phase 20H.2 keeps a single source of truth so that:
 *
 *   - the metadata extractor (provider-impl) accepts ONLY these
 *     hosts when validating <meta property="og:image"> URLs;
 *   - Next.js remotePatterns accepts ONLY these hosts when the
 *     image is rendered through <Image src={...}>;
 *   - tests exercise both layers against the same list.
 */
export const SHOPEE_PRODUCT_IMAGE_HOST_ALLOWLIST = [
  'cf.shopee.vn',
  'down-vn.img.susercontent.com',
] as const;

export type ShopeeProductImageHost =
  (typeof SHOPEE_PRODUCT_IMAGE_HOST_ALLOWLIST)[number];

const SHOPEE_PRODUCT_IMAGE_HOST_SET: ReadonlySet<string> = new Set(
  SHOPEE_PRODUCT_IMAGE_HOST_ALLOWLIST,
);

export function isShopeeProductImageHost(hostname: string): boolean {
  if (!hostname) {
    return false;
  }
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  return SHOPEE_PRODUCT_IMAGE_HOST_SET.has(normalized);
}