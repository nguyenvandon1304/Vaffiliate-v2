/**
 * Standalone test suite for the shared cashback policy module.
 *
 * Run with:
 *
 *     node --import tsx --test src/lib/cashback/cashback-policy.test.ts
 *
 * The test relies only on Node's built-in `node:test` runner and the
 * locally-available `tsx` loader so it does not add a new framework.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  BASIS_POINTS,
  calculateCashbackAllocation,
  calculatePlatformProfit,
  calculateUserCashback,
} from "./cashback-policy";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

test("policy exposes the canonical basis points", () => {
  assert.equal(BASIS_POINTS, BigInt(10_000));
});

test("even split allocates the exact halves", () => {
  const result = calculateCashbackAllocation({
    networkCommission: 100_000,
    cashbackShareBps: 5_000,
  });
  assert.equal(result.userCashback, 50_000);
  assert.equal(result.platformProfit, 50_000);
  assert.equal(
    result.userCashback + result.platformProfit,
    100_000,
  );
});

test("typical Shopee commission splits to user and platform", () => {
  const result = calculateCashbackAllocation({
    networkCommission: 123_456,
    cashbackShareBps: 6_000,
  });
  assert.equal(result.userCashback, 74_073);
  assert.equal(result.platformProfit, 49_383);
  assert.equal(
    result.userCashback + result.platformProfit,
    123_456,
  );
});

test("default Shopee preview share of 60 percent floors correctly", () => {
  const result = calculateCashbackAllocation({
    networkCommission: 123_456,
    cashbackShareBps: 6_000,
  });
  assert.equal(result.userCashback, 74_073);
  assert.equal(result.platformProfit, 49_383);
  assert.equal(
    result.userCashback + result.platformProfit,
    123_456,
  );
});

test("floor rounding never breaks the allocation invariant", () => {
  const result = calculateCashbackAllocation({
    networkCommission: 10_001,
    cashbackShareBps: 6_000,
  });
  assert.ok(result.userCashback >= 0);
  assert.ok(result.platformProfit >= 0);
  assert.equal(
    result.userCashback + result.platformProfit,
    10_001,
    "userCashback + platformProfit must equal networkCommission",
  );
});

test("floor rounds down to the nearest VND for the user side", () => {
  // 10001 * 6000 / 10000 = 6000.6 -> floor = 6000
  const result = calculateCashbackAllocation({
    networkCommission: 10_001,
    cashbackShareBps: 6_000,
  });
  assert.equal(result.userCashback, 6_000);
  assert.equal(result.platformProfit, 4_001);
  assert.equal(
    result.userCashback + result.platformProfit,
    10_001,
  );
});

test("zero share leaves everything with the platform", () => {
  const result = calculateCashbackAllocation({
    networkCommission: 1_999_999,
    cashbackShareBps: 0,
  });
  assert.equal(result.userCashback, 0);
  assert.equal(result.platformProfit, 1_999_999);
});

test("full share sends everything to the user", () => {
  const result = calculateCashbackAllocation({
    networkCommission: 1_999_999,
    cashbackShareBps: 10_000,
  });
  assert.equal(result.userCashback, 1_999_999);
  assert.equal(result.platformProfit, 0);
});

test("networkCommission 0 short-circuits without math", () => {
  assert.deepEqual(
    calculateCashbackAllocation({
      networkCommission: 0,
      cashbackShareBps: 6_000,
    }),
    { userCashback: 0, platformProfit: 0 },
  );
  assert.deepEqual(
    calculateCashbackAllocation({
      networkCommission: 0,
      cashbackShareBps: 0,
    }),
    { userCashback: 0, platformProfit: 0 },
  );
  assert.deepEqual(
    calculateCashbackAllocation({
      networkCommission: 0,
      cashbackShareBps: 10_000,
    }),
    { userCashback: 0, platformProfit: 0 },
  );
});

test("invalid networkCommission throws", () => {
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: Number.NaN,
        cashbackShareBps: 6_000,
      }),
    /finite/,
  );
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: Number.POSITIVE_INFINITY,
        cashbackShareBps: 6_000,
      }),
    /finite/,
  );
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: Number.NEGATIVE_INFINITY,
        cashbackShareBps: 6_000,
      }),
    /finite/,
  );
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: 1.5,
        cashbackShareBps: 6_000,
      }),
    /integer/,
  );
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: -1,
        cashbackShareBps: 6_000,
      }),
    /non-negative/,
  );
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: MAX_SAFE_INTEGER + 2,
        cashbackShareBps: 6_000,
      }),
    /safe integer/,
  );
});

test("invalid share bps throws", () => {
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: 1_000,
        cashbackShareBps: Number.NaN,
      }),
    /finite/,
  );
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: 1_000,
        cashbackShareBps: 1.5,
      }),
    /integer/,
  );
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: 1_000,
        cashbackShareBps: -1,
      }),
    /range/,
  );
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: 1_000,
        cashbackShareBps: 10_001,
      }),
    /range/,
  );
  assert.throws(
    () =>
      calculateCashbackAllocation({
        networkCommission: 1_000,
        cashbackShareBps: MAX_SAFE_INTEGER + 2,
      }),
    /safe integer/,
  );
});

test("individual helpers agree with the full allocation", () => {
  const args = {
    networkCommission: 987_654,
    cashbackShareBps: 6_500,
  };
  const full = calculateCashbackAllocation(args);
  assert.equal(calculateUserCashback(args), full.userCashback);
  assert.equal(
    calculatePlatformProfit(args),
    full.platformProfit,
  );
});

test("large but valid networkCommission preserves the invariant", () => {
  // Use a value well above typical commissions but still inside
  // Number.MAX_SAFE_INTEGER so the public contract remains a JS number.
  const commission = 9_007_199_254_740_991; // MAX_SAFE_INTEGER
  const result = calculateCashbackAllocation({
    networkCommission: commission,
    cashbackShareBps: 6_000,
  });

  const expectedUserCashback = Number(
    (BigInt(commission) * BigInt(6_000)) / BigInt(10_000),
  );

  assert.equal(
    result.userCashback + result.platformProfit,
    commission,
    "userCashback + platformProfit must equal networkCommission even at MAX_SAFE_INTEGER",
  );
  assert.equal(result.userCashback, expectedUserCashback);
  assert.ok(result.userCashback >= 0);
  assert.ok(result.platformProfit >= 0);
});

test("total money invariant holds across a sweep of inputs", () => {
  const shares = [0, 1, 2_500, 5_000, 6_000, 7_500, 9_999, 10_000];
  const commissions = [0, 1, 2, 10_001, 99_999, 123_456, 1_999_999];
  for (const networkCommission of commissions) {
    for (const cashbackShareBps of shares) {
      const result = calculateCashbackAllocation({
        networkCommission,
        cashbackShareBps,
      });
      assert.equal(
        result.userCashback + result.platformProfit,
        networkCommission,
        `commission=${networkCommission} share=${cashbackShareBps}`,
      );
      assert.ok(result.userCashback >= 0);
      assert.ok(result.platformProfit >= 0);
      assert.ok(Number.isSafeInteger(result.userCashback));
      assert.ok(Number.isSafeInteger(result.platformProfit));
    }
  }
});
