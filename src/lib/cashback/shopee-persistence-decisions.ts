/**
 * Production persistence decision helpers for Shopee affiliate URL storage.
 *
 * These pure functions implement the decision logic for the affiliate URL
 * persistence step in initiateShopeePurchaseAction. They can be tested
 * directly without touching the database or Supabase auth.
 */

/**
 * Represents the result of a DB UPDATE that either updated a row
 * or found no matching row.
 */
export interface DbUpdateResult {
  updated: boolean;
}

/**
 * Represents a row reloaded from the DB.
 */
export interface DbReloadResult {
  found: boolean;
  affiliateUrl: string | null;
}

/**
 * Decision outcome for the affiliate URL persistence step.
 */
export type PersistenceOutcome =
  | { action: "success"; trackingPath: string; shortCode: string }
  | { action: "failure"; message: string };

/**
 * Pure logic for the NULL → UPDATE path.
 *
 * Simulates the race condition handling:
 * - If UPDATE returns a row → success.
 * - If UPDATE returns nothing → reload; if reload.affiliateUrl === expected
 *   AND exists → success; else failure.
 */
export function decideNullPersistenceOutcome(
  updateResult: DbUpdateResult,
  reloadResult: DbReloadResult,
  expectedAffiliateUrl: string,
  trackingPath: string,
  shortCode: string,
): PersistenceOutcome {
  if (updateResult.updated) {
    return { action: "success", trackingPath, shortCode };
  }

  // Update returned no row — possible concurrent race
  if (
    reloadResult.found &&
    reloadResult.affiliateUrl === expectedAffiliateUrl
  ) {
    return { action: "success", trackingPath, shortCode };
  }

  return {
    action: "failure",
    message: "Không thể lưu link hoàn tiền lúc này. Vui lòng thử lại.",
  };
}

/**
 * Pure logic for the existing URL path (affiliateUrl !== null).
 *
 * Returns success only when the stored URL:
 * - Exactly equals the expected URL, OR
 * - Verifies as valid with matching account, networkSubId, and product.
 */
export type VerifyFn = (
  affiliateUrl: string,
  networkSubId: string,
  accountId: string,
  canonicalUrl: string,
) => Promise<{
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
}>;

export async function decideExistingUrlOutcome(
  existingAffiliateUrl: string,
  expectedAffiliateUrl: string,
  verify: VerifyFn,
  networkSubId: string,
  accountId: string,
  canonicalUrl: string,
  trackingPath: string,
  shortCode: string,
): Promise<PersistenceOutcome> {
  // Exact match — reuse safely
  if (existingAffiliateUrl === expectedAffiliateUrl) {
    return { action: "success", trackingPath, shortCode };
  }

  // Different URL — must verify
  let verified: Awaited<ReturnType<typeof verify>>;
  try {
    verified = await verify(
      existingAffiliateUrl,
      networkSubId,
      accountId,
      canonicalUrl,
    );
  } catch {
    return {
      action: "failure",
      message: "Link hoàn tiền đã tồn tại nhưng không hợp lệ. Vui lòng thử tạo link mới.",
    };
  }

  if (!verified.valid) {
    return {
      action: "failure",
      message:
        verified.errorMessage ??
        "Link hoàn tiền đã tồn tại nhưng không hợp lệ. Vui lòng thử tạo link mới.",
    };
  }

  return { action: "success", trackingPath, shortCode };
}
