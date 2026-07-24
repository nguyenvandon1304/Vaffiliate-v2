import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE20K_EMPTY_BASELINE_RELATIONS,
  validatePhase20kEmptyBaseline,
  type Phase20kBaselineSnapshot,
} from "./phase20k-empty-baseline";

const EMPTY_HASH = "0".repeat(64);

function zeroSnapshot(): Record<
  string,
  { count: number; stableHash: string }
> {
  return Object.fromEntries(
    PHASE20K_EMPTY_BASELINE_RELATIONS.map((relation) => [
      relation,
      { count: 0, stableHash: EMPTY_HASH },
    ]),
  );
}

test("Phase 20K empty baseline: exact all-zero baseline passes", () => {
  const result = validatePhase20kEmptyBaseline(zeroSnapshot());
  assert.equal(result.approved, true);
  assert.equal(result.relationCount, 17);
  assert.deepEqual(result.failures, []);
});

test("Phase 20K empty baseline: one non-zero table fails", () => {
  const snapshot = zeroSnapshot();
  snapshot["public.offers"] = { count: 1, stableHash: EMPTY_HASH };
  const result = validatePhase20kEmptyBaseline(snapshot);
  assert.deepEqual(result.failures, [
    { relation: "public.offers", code: "non_zero_count" },
  ]);
});

for (const relation of [
  "auth.users",
  "public.payout_accounts",
  "public.clicks",
] as const) {
  test(`Phase 20K empty baseline: missing ${relation} fails`, () => {
    const snapshot = zeroSnapshot() as Phase20kBaselineSnapshot &
      Record<string, unknown>;
    delete snapshot[relation];
    const result = validatePhase20kEmptyBaseline(
      snapshot as Phase20kBaselineSnapshot,
    );
    assert.deepEqual(result.failures, [
      { relation, code: "missing_relation" },
    ]);
  });
}

test("Phase 20K empty baseline: unknown extra relation fails in strict mode", () => {
  const snapshot = zeroSnapshot();
  snapshot["public.unapproved_table"] = {
    count: 0,
    stableHash: EMPTY_HASH,
  };
  const result = validatePhase20kEmptyBaseline(snapshot);
  assert.deepEqual(result.failures, [
    { relation: "public.unapproved_table", code: "unknown_relation" },
  ]);
});

test("Phase 20K empty baseline: failure ordering is deterministic", () => {
  const snapshot = zeroSnapshot();
  delete snapshot["auth.users"];
  snapshot["public.conversions"] = { count: 2, stableHash: EMPTY_HASH };
  snapshot["public.z_extra"] = { count: 0, stableHash: EMPTY_HASH };
  snapshot["public.a_extra"] = { count: 0, stableHash: EMPTY_HASH };

  const first = validatePhase20kEmptyBaseline(snapshot);
  const second = validatePhase20kEmptyBaseline(snapshot);
  assert.deepEqual(first.failures, second.failures);
  assert.deepEqual(first.failures, [
    { relation: "auth.users", code: "missing_relation" },
    { relation: "public.conversions", code: "non_zero_count" },
    { relation: "public.a_extra", code: "unknown_relation" },
    { relation: "public.z_extra", code: "unknown_relation" },
  ]);
});
