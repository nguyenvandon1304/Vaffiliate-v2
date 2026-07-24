/**
 * Phase 20K -- pure money split for reconciliation tests.
 *
 * Uses the project's standard `node:test` + `node:assert/strict`
 * runner (no vitest). The runner picks these files up via the
 * `npm test` script. All assertions are pure / synchronous and do
 * not require a database.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isCommissionSplitInvariant,
  MoneySplitError,
  splitCommissionFloor,
} from "./money";

const CASHBACK_BPS_60_PERCENT = 6_000;

test("Phase 20K splitCommissionFloor: zero commission yields zero split", () => {
  const split = splitCommissionFloor(0, CASHBACK_BPS_60_PERCENT);
  assert.equal(split.networkCommission, 0);
  assert.equal(split.userCashback, 0);
  assert.equal(split.platformProfit, 0);
  assert.equal(isCommissionSplitInvariant(split), true);
});

test("Phase 20K splitCommissionFloor: VND 1 rounds buyer share down to 0, platform absorbs 1 VND", () => {
  const split = splitCommissionFloor(1, CASHBACK_BPS_60_PERCENT);
  assert.equal(split.userCashback, 0);
  assert.equal(split.platformProfit, 1);
  assert.equal(isCommissionSplitInvariant(split), true);
});

test("Phase 20K splitCommissionFloor: VND 10 splits 6 / 4", () => {
  const split = splitCommissionFloor(10, CASHBACK_BPS_60_PERCENT);
  assert.equal(split.userCashback, 6);
  assert.equal(split.platformProfit, 4);
  assert.equal(isCommissionSplitInvariant(split), true);
});

test("Phase 20K splitCommissionFloor: VND 100 splits 60 / 40 (production-policy round number)", () => {
  const split = splitCommissionFloor(100, CASHBACK_BPS_60_PERCENT);
  assert.equal(split.networkCommission, 100);
  assert.equal(split.userCashback, 60);
  assert.equal(split.platformProfit, 40);
  assert.equal(isCommissionSplitInvariant(split), true);
});

test("Phase 20K splitCommissionFloor: VND 101 splits 60 / 41 (floor of 60.6)", () => {
  const split = splitCommissionFloor(101, CASHBACK_BPS_60_PERCENT);
  assert.equal(split.networkCommission, 101);
  assert.equal(split.userCashback, 60);
  assert.equal(split.platformProfit, 41);
  assert.equal(isCommissionSplitInvariant(split), true);
});

test("Phase 20K splitCommissionFloor: VND 999 splits 599 / 400 (floor of 599.4)", () => {
  const split = splitCommissionFloor(999, CASHBACK_BPS_60_PERCENT);
  assert.equal(split.userCashback, 599);
  assert.equal(split.platformProfit, 400);
  assert.equal(isCommissionSplitInvariant(split), true);
});

test("Phase 20K splitCommissionFloor: VND 1,000,000 splits 600,000 / 400,000", () => {
  const split = splitCommissionFloor(1_000_000, CASHBACK_BPS_60_PERCENT);
  assert.equal(split.userCashback, 600_000);
  assert.equal(split.platformProfit, 400_000);
  assert.equal(isCommissionSplitInvariant(split), true);
});

test("Phase 20K splitCommissionFloor: VND 123,456,789 splits 74,074,073 / 49,382,716 (floor of 74074073.4)", () => {
  const split = splitCommissionFloor(123_456_789, CASHBACK_BPS_60_PERCENT);
  assert.equal(split.userCashback, 74_074_073);
  assert.equal(split.platformProfit, 49_382_716);
  assert.equal(isCommissionSplitInvariant(split), true);
});

test("Phase 20K splitCommissionFloor: negative commission refused", () => {
  assert.throws(
    () => splitCommissionFloor(-1, CASHBACK_BPS_60_PERCENT),
    MoneySplitError,
  );
});

test("Phase 20K splitCommissionFloor: non-integer commission refused", () => {
  assert.throws(
    () => splitCommissionFloor(1.5, CASHBACK_BPS_60_PERCENT),
    MoneySplitError,
  );
});

test("Phase 20K splitCommissionFloor: non-finite commission refused (NaN, Infinity)", () => {
  assert.throws(
    () => splitCommissionFloor(Number.NaN, CASHBACK_BPS_60_PERCENT),
    MoneySplitError,
  );
  assert.throws(
    () =>
      splitCommissionFloor(
        Number.POSITIVE_INFINITY,
        CASHBACK_BPS_60_PERCENT,
      ),
    MoneySplitError,
  );
});

test("Phase 20K splitCommissionFloor: explicit policy 6000 yields 600 / 400", () => {
  const split = splitCommissionFloor(1_000, 6_000);
  assert.equal(split.userCashback, 600);
  assert.equal(split.platformProfit, 400);
  assert.equal(split.userCashbackBpsApplied, 6_000);
});

test("Phase 20K splitCommissionFloor: explicit policy 7000 yields 700 / 300", () => {
  const split = splitCommissionFloor(1_000, 7_000);
  assert.equal(split.userCashback, 700);
  assert.equal(split.platformProfit, 300);
  assert.equal(split.userCashbackBpsApplied, 7_000);
});

test("Phase 20K splitCommissionFloor: explicit bps = 10_000 yields 100% buyer share", () => {
  const split = splitCommissionFloor(777, 10_000);
  assert.equal(split.userCashback, 777);
  assert.equal(split.platformProfit, 0);
  assert.equal(isCommissionSplitInvariant(split), true);
});

test("Phase 20K splitCommissionFloor: explicit bps = 0 yields 100% platform profit", () => {
  const split = splitCommissionFloor(500, 0);
  assert.equal(split.userCashback, 0);
  assert.equal(split.platformProfit, 500);
  assert.equal(isCommissionSplitInvariant(split), true);
});

test("Phase 20K splitCommissionFloor: out-of-range bps refused", () => {
  assert.throws(() => splitCommissionFloor(500, -1), MoneySplitError);
  assert.throws(() => splitCommissionFloor(500, 10_001), MoneySplitError);
});

test("Phase 20K splitCommissionFloor: non-integer bps refused", () => {
  assert.throws(() => splitCommissionFloor(500, 6000.5), MoneySplitError);
});

test("Phase 20K splitCommissionFloor: missing policy snapshot is refused without a 6000 fallback", () => {
  assert.throws(
    () => splitCommissionFloor(500, undefined),
    (error: unknown) =>
      error instanceof MoneySplitError && error.reason === "missing_bps",
  );
  assert.throws(
    () => splitCommissionFloor(500, null),
    (error: unknown) =>
      error instanceof MoneySplitError && error.reason === "missing_bps",
  );
});

test("Phase 20K isCommissionSplitInvariant: rejects negative values", () => {
  assert.equal(
    isCommissionSplitInvariant({
      networkCommission: -1,
      userCashback: 0,
      platformProfit: 0,
      userCashbackBpsApplied: 6000,
    }),
    false,
  );
});

test("Phase 20K isCommissionSplitInvariant: rejects invariant breaks", () => {
  assert.equal(
    isCommissionSplitInvariant({
      networkCommission: 100,
      userCashback: 60,
      platformProfit: 30,
      userCashbackBpsApplied: 6000,
    }),
    false,
  );
});

test("Phase 20K isCommissionSplitInvariant: accepts a 60/40 split", () => {
  assert.equal(
    isCommissionSplitInvariant({
      networkCommission: 100,
      userCashback: 60,
      platformProfit: 40,
      userCashbackBpsApplied: 6000,
    }),
    true,
  );
});
