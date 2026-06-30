/**
 * Single source of truth for splitting a network commission between the
 * publisher (user cashback) and the platform (platform profit).
 *
 * All amounts are integer VND. Basis points (bps) use a denominator of
 * {@link BASIS_POINTS} so 6000 bps means 60%. Integer arithmetic guarantees:
 *
 *   userCashback + platformProfit = networkCommission
 *
 * Conversion creation, the Shopee CSV ready-for-conversion promotion, and the
 * Shopee product preview must all derive their numbers from this module
 * rather than re-implementing the formula locally.
 *
 * Implementation note: the multiply-then-divide step uses BigInt internally
 * to guarantee zero precision loss regardless of how large the inputs are.
 * The function rejects any input that would produce a result outside the
 * JavaScript safe-integer range so callers can rely on `number` arithmetic
 * downstream without silently rounding.
 */

export const BASIS_POINTS = BigInt(10_000);

export interface CashbackAllocationInput {
  /**
   * Integer VND paid by the affiliate network for the order.
   *
   * Must be a non-negative safe integer in `[0, Number.MAX_SAFE_INTEGER]`.
   * Validation is performed eagerly so that every caller of this module
   * fails the same way on bad input.
   */
  networkCommission: number;

  /**
   * Share of the network commission that is paid out as user cashback,
   * expressed in basis points.
   *
   * Must satisfy `0 <= cashbackShareBps <= 10000`. The matching database
   * check constraint on `cashback_policies.cashback_share_bps` already
   * enforces this at the storage layer.
   */
  cashbackShareBps: number;
}

export interface CashbackAllocation {
  userCashback: number;
  platformProfit: number;
}

const MAX_BPS = 10_000;

function assertSafeNonNegativeInteger(
  value: number,
  field: "networkCommission",
): void {
  if (typeof value !== "number") {
    throw new TypeError(
      `Cashback allocation field "${field}" must be a finite number.`,
    );
  }

  if (!Number.isFinite(value)) {
    throw new TypeError(
      `Cashback allocation field "${field}" must be a finite number.`,
    );
  }

  if (!Number.isInteger(value)) {
    throw new TypeError(
      `Cashback allocation field "${field}" must be an integer VND amount.`,
    );
  }

  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `Cashback allocation field "${field}" must fit in a JavaScript safe integer.`,
    );
  }

  if (value < 0) {
    throw new RangeError(
      `Cashback allocation field "${field}" must be non-negative.`,
    );
  }
}

function assertValidShareBps(value: number): void {
  if (typeof value !== "number") {
    throw new TypeError(
      "Cashback allocation field \"cashbackShareBps\" must be a finite number.",
    );
  }

  if (!Number.isFinite(value)) {
    throw new TypeError(
      "Cashback allocation field \"cashbackShareBps\" must be a finite number.",
    );
  }

  if (!Number.isInteger(value)) {
    throw new TypeError(
      "Cashback allocation field \"cashbackShareBps\" must be an integer basis-points value.",
    );
  }

  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      "Cashback allocation field \"cashbackShareBps\" must fit in a JavaScript safe integer.",
    );
  }

  if (value < 0 || value > MAX_BPS) {
    throw new RangeError(
      "Cashback allocation field \"cashbackShareBps\" must be within " +
        `the inclusive range [0, ${MAX_BPS}].`,
    );
  }
}

/**
 * Round the integer division result down so the remaining split lands on the
 * platform side.
 *
 * BigInt division in JavaScript already truncates toward zero, which is the
 * floor for non-negative dividends. The function keeps the truncation logic
 * explicit so future refactors cannot silently switch to rounding.
 */
function bigIntFloor(
  numerator: bigint,
  denominator: bigint,
): bigint {
  return numerator / denominator;
}

export function calculateCashbackAllocation(
  input: CashbackAllocationInput,
): CashbackAllocation {
  assertSafeNonNegativeInteger(
    input.networkCommission,
    "networkCommission",
  );

  assertValidShareBps(input.cashbackShareBps);

  if (input.networkCommission === 0) {
    return { userCashback: 0, platformProfit: 0 };
  }

  const commissionBig = BigInt(input.networkCommission);
  const shareBig = BigInt(input.cashbackShareBps);
  const userCashbackBig = bigIntFloor(
    commissionBig * shareBig,
    BASIS_POINTS,
  );

  const platformProfitBig =
    commissionBig - userCashbackBig;

  if (
    userCashbackBig > BigInt(Number.MAX_SAFE_INTEGER) ||
    platformProfitBig > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new RangeError(
      "Cashback allocation result exceeds the JavaScript safe integer range.",
    );
  }

  return {
    userCashback: Number(userCashbackBig),
    platformProfit: Number(platformProfitBig),
  };
}

export function calculateUserCashback(
  input: CashbackAllocationInput,
): number {
  return calculateCashbackAllocation(input).userCashback;
}

export function calculatePlatformProfit(
  input: CashbackAllocationInput,
): number {
  return calculateCashbackAllocation(input).platformProfit;
}

/**
 * Preview-only default share for the Shopee product preview.
 *
 * Production cashback allocation MUST come from a row in
 * `cashback_policies.cashback_share_bps`. This constant exists only so the
 * preview can keep working before real catalog rows exist and is named to
 * make that boundary explicit.
 */
export const SHOPEE_PREVIEW_DEFAULT_CASHBACK_SHARE_BPS = 6_000;
