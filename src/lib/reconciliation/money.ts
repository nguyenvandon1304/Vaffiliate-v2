/**
 * Phase 20K -- pure money split for reconciliation.
 *
 * Network commission from Shopee is reported in VND integer amounts
 * (stored as `bigint` in the `conversions` table). The buyer cashback
 * share is supplied explicitly from the immutable policy snapshot
 * stored on the conversion. Platform profit is the residual:
 * `networkCommission - userCashback`.
 *
 * The split MUST be:
 *
 *   - Integer-safe. No float / double math.
 *   - Deterministic. Same inputs produce the same outputs.
 *   - Lossless modulo the explicit rounding rule below.
 *   - Refusal-on-invalid for negative / non-integer / NaN input.
 *
 * Rounding rule: `userCashback = floor(networkCommission *
 * userCashbackBps / 10000)`. We always round the BUYER'S share DOWN;
 * the platform absorbs every remainder VND. This matches the spec's
 * invariant:
 *
 *   networkCommission === userCashback + platformProfit
 *   userCashback >= 0
 *   platformProfit >= 0
 *
 * The inputs are normal integers in VND. The function returns an
 * object that captures the split and the invariant so callers can
 * assert equality in tests.
 */

export interface CommissionSplit {
  readonly networkCommission: number;
  readonly userCashback: number;
  readonly platformProfit: number;
  readonly userCashbackBpsApplied: number;
}

export class MoneySplitError extends Error {
  constructor(
    public readonly reason:
      | "non_integer_network_commission"
      | "negative_network_commission"
      | "non_finite_network_commission"
      | "missing_bps"
      | "non_finite_bps"
      | "non_integer_bps"
      | "bps_out_of_range",
    message: string,
  ) {
    super(message);
    this.name = "MoneySplitError";
  }
}

function assertIntegerFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new MoneySplitError(
      "non_finite_network_commission",
      label + " must be a finite number",
    );
  }
  if (!Number.isInteger(value)) {
    throw new MoneySplitError(
      "non_integer_network_commission",
      label + " must be an integer VND amount (got " + String(value) + ")",
    );
  }
}

export function splitCommissionFloor(
  networkCommission: number,
  userCashbackBps: number | null | undefined,
): CommissionSplit {
  if (userCashbackBps === null || userCashbackBps === undefined) {
    throw new MoneySplitError(
      "missing_bps",
      "userCashbackBps policy snapshot is required",
    );
  }
  if (!Number.isFinite(userCashbackBps)) {
    throw new MoneySplitError(
      "non_finite_bps",
      "userCashbackBps must be a finite basis-points value",
    );
  }
  if (!Number.isInteger(userCashbackBps)) {
    throw new MoneySplitError(
      "non_integer_bps",
      "userCashbackBps must be an integer basis-points value",
    );
  }
  if (userCashbackBps < 0 || userCashbackBps > 10_000) {
    throw new MoneySplitError(
      "bps_out_of_range",
      "userCashbackBps must be in the closed interval [0, 10000]",
    );
  }
  assertIntegerFinite(networkCommission, "networkCommission");
  if (networkCommission < 0) {
    throw new MoneySplitError(
      "negative_network_commission",
      "networkCommission must be >= 0",
    );
  }

  // Floor of (networkCommission * bps / 10000). We use the divisor /
  // dividend pattern that matches the spec literally so behaviour
  // does not drift if/when the multiplier changes.
  const userCashback = Math.floor(
    (networkCommission * userCashbackBps) / 10_000,
  );
  const platformProfit = networkCommission - userCashback;
  return {
    networkCommission,
    userCashback,
    platformProfit,
    userCashbackBpsApplied: userCashbackBps,
  };
}

/**
 * Pure boolean assertion that an existing split is internally
 * consistent. Used by the engine to refuse decisions that would
 * mutate a conversion into a lossy / negative state.
 */
export function isCommissionSplitInvariant(
  split: Readonly<CommissionSplit>,
): boolean {
  if (!Number.isInteger(split.networkCommission)) return false;
  if (!Number.isInteger(split.userCashback)) return false;
  if (!Number.isInteger(split.platformProfit)) return false;
  if (split.networkCommission < 0) return false;
  if (split.userCashback < 0) return false;
  if (split.platformProfit < 0) return false;
  return split.networkCommission === split.userCashback + split.platformProfit;
}
