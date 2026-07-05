/**
 * Phase 20H.3d — Pure Shopee commission rate fixture.
 *
 * IMPORTANT: This module is NOT a live Shopee Affiliate dashboard
 * ingestion path, NOT a scraped source, and NOT a production catalog
 * row. It exists only so the local dev/test/preview environment can
 * demonstrate the quote pipeline end-to-end until a real commission
 * rate source ships (schema migration to `offers.commission_rate_bps`
 * OR a dedicated ingestion service).
 *
 * Hard scope rules:
 *  - Shopee only.
 *  - No login automation, no scraping, no affiliate dashboard access.
 *  - The fixture MUST be clearly labelled as dev/test data; nothing
 *    here is presented to the buyer as live Shopee data.
 *  - The lookup function is pure and read-only.
 *
 * This module deliberately does NOT import `server-only`. The lookup
 * is a pure function with no side effects, so unit tests can run it
 * under the Node test runner without triggering the Next.js server
 * guard. The companion `*.server.ts` module imports this one and adds
 * the `server-only` guard so production callers can be sure only
 * server-side code reads the fixture.
 *
 * The fixture is exported as a `readonly` array so callers cannot
 * mutate it at runtime. The lookup function returns `null` for any
 * product that is not present in the fixture, so the production quote
 * pipeline falls back to `commission_rate_unavailable` exactly as it
 * did before Phase 20H.3d for unknown products.
 */

export interface ShopeeDevelopmentCommissionRateEntry {
  /** Shopee shopId (digits). Optional but recommended. */
  readonly shopId?: string;
  /** Shopee itemId (digits). Optional but recommended. */
  readonly itemId?: string;
  /**
   * Commission rate Shopee pays to Vaffiliate, in basis points where
   * `10_000 == 100%`. Must be a non-negative integer in `[0, 10000]`.
   */
  readonly commissionRateBps: number;
  /**
   * Short audit note about where this rate was observed. NEVER shown
   * to buyers; logged for developer reference only.
   */
  readonly note: string;
}

/**
 * Dev/test catalog. Update with care - entry additions require
 * parallel test coverage in `shopee-commission-rate-fixture.test.ts`.
 *
 * The Phase 20H.3d canonical fixture product is
 * `https://shopee.vn/product/1408027998/44812498433`. Manually
 * observed to carry a 20% (2000 bps) commission in the affiliate
 * dashboard. This is the local regression target.
 */
export const SHOPEE_DEVELOPMENT_COMMISSION_RATES: ReadonlyArray<ShopeeDevelopmentCommissionRateEntry> =
  Object.freeze([
    Object.freeze({
      shopId: "1408027998",
      itemId: "44812498433",
      commissionRateBps: 2000,
      note:
        "Phase 20H.3d dev fixture. shopee.vn/product/1408027998/44812498433. Manually observed 20% commission rate.",
    }),
  ]);

function isValidBps(value: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10_000
  );
}

/**
 * Resolves a commission rate for a (shopId, itemId) pair.
 *
 * Lookup precedence:
 *  1. Exact (shopId + itemId) match.
 *  2. itemId-only match across rows.
 *  3. shopId-only match across rows.
 *
 * Returns `null` when no fixture entry matches or when the matched
 * entry carries an out-of-range `commissionRateBps`. Defensive callers
 * already treat `null` as "quote unavailable - no commission rate".
 *
 * Pure: no I/O, no Date, no randomness.
 */
export function lookupDevelopmentShopeeCommissionRateBps(params: {
  shopId: string;
  itemId: string;
}): number | null {
  const normalizedShopId = (params.shopId ?? "").trim();
  const normalizedItemId = (params.itemId ?? "").trim();

  const itemAndShop = SHOPEE_DEVELOPMENT_COMMISSION_RATES.find(
    (entry) =>
      typeof entry.itemId === "string" &&
      entry.itemId === normalizedItemId &&
      (typeof entry.shopId !== "string" ||
        entry.shopId === "" ||
        entry.shopId === normalizedShopId),
  );
  if (itemAndShop && isValidBps(itemAndShop.commissionRateBps)) {
    return itemAndShop.commissionRateBps;
  }

  const itemOnly = SHOPEE_DEVELOPMENT_COMMISSION_RATES.find(
    (entry) =>
      typeof entry.itemId === "string" && entry.itemId === normalizedItemId,
  );
  if (itemOnly && isValidBps(itemOnly.commissionRateBps)) {
    return itemOnly.commissionRateBps;
  }

  const shopOnly = SHOPEE_DEVELOPMENT_COMMISSION_RATES.find(
    (entry) =>
      typeof entry.shopId === "string" && entry.shopId === normalizedShopId,
  );
  if (shopOnly && isValidBps(shopOnly.commissionRateBps)) {
    return shopOnly.commissionRateBps;
  }

  return null;
}
