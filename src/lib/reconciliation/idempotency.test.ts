/**
 * Phase 20K -- reconciliation idempotency tests.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReconciliationIdempotencyKey,
  buildReconciliationShortId,
  IdempotencyKeyError,
  RECONCILIATION_POLICY_VERSION,
  type ReconciliationDecisionKind,
  type ReconciliationNetwork,
} from "./idempotency";

const CASES: ReadonlyArray<{
  readonly label: string;
  readonly network: ReconciliationNetwork;
  readonly decision: ReconciliationDecisionKind;
}> = [
  {
    label: "shopee approve",
    network: "shopee",
    decision: "approve",
  },
  {
    label: "shopee mark_payable",
    network: "shopee",
    decision: "mark_payable",
  },
  {
    label: "shopee mark_paid",
    network: "shopee",
    decision: "mark_paid",
  },
  {
    label: "shopee reject",
    network: "shopee",
    decision: "reject",
  },
];

for (const c of CASES) {
  test("Phase 20K buildReconciliationIdempotencyKey: " + c.label + " produces a deterministic 64-hex sha256", () => {
    const nextStatus =
      c.decision === "approve"
        ? "approved"
        : c.decision === "mark_payable"
          ? "payable"
          : c.decision === "mark_paid"
            ? "paid"
            : "rejected";
    const previousStatus = nextStatus === "approved" ? "pending" : "approved";
    const digest = buildReconciliationIdempotencyKey({
      network: c.network,
      sourceConversionKey: "source-conversion-key",
      previousStatus,
      nextStatus,
      decision: c.decision,
    });
    assert.match(digest, /^[a-f0-9]{64}$/);
    const digestAgain = buildReconciliationIdempotencyKey({
      network: c.network,
      sourceConversionKey: "source-conversion-key",
      previousStatus,
      nextStatus,
      decision: c.decision,
    });
    assert.equal(digestAgain, digest);
  });
}

test("Phase 20K buildReconciliationIdempotencyKey: different decisions on the same source key produce different keys", () => {
  const approve = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
  });
  const reject = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "rejected",
    decision: "reject",
  });
  assert.notEqual(approve, reject);
});

test("Phase 20K buildReconciliationIdempotencyKey: same network+key+decision but different previousStatus produce different keys", () => {
  const fromPending = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
  });
  const fromApproved = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "approved",
    nextStatus: "rejected",
    decision: "reject",
  });
  assert.notEqual(fromPending, fromApproved);
});

test("Phase 20K buildReconciliationIdempotencyKey: same network+key but different nextStatus produce different keys", () => {
  const toApproved = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
  });
  const toRejected = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "rejected",
    decision: "reject",
  });
  assert.notEqual(toApproved, toRejected);
});

test("Phase 20K buildReconciliationIdempotencyKey: policyVersion mixes into the key", () => {
  const v1 = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
    policyVersion: 1,
  });
  const v2 = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
    policyVersion: 2,
  });
  assert.notEqual(v1, v2);
});

test("Phase 20K buildReconciliationIdempotencyKey: default policyVersion matches the exported constant", () => {
  const explicit = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
    policyVersion: RECONCILIATION_POLICY_VERSION,
  });
  const implicit = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
  });
  assert.equal(explicit, implicit);
});

test("Phase 20K buildReconciliationIdempotencyKey: same-status transitions are refused", () => {
  assert.throws(
    () =>
      buildReconciliationIdempotencyKey({
        network: "shopee",
        sourceConversionKey: "k1",
        previousStatus: "approved",
        nextStatus: "approved",
        decision: "approve",
      }),
    (err: unknown) =>
      err instanceof IdempotencyKeyError &&
      err.reason === "same_status_transition",
  );
});

test("Phase 20K buildReconciliationIdempotencyKey: non-positive policyVersion is refused", () => {
  assert.throws(
    () =>
      buildReconciliationIdempotencyKey({
        network: "shopee",
        sourceConversionKey: "k1",
        previousStatus: "pending",
        nextStatus: "approved",
        decision: "approve",
        policyVersion: 0,
      }),
    (err: unknown) =>
      err instanceof IdempotencyKeyError &&
      err.reason === "non_integer_policy_version",
  );
});

test("Phase 20K buildReconciliationIdempotencyKey: trimming whitespace does not affect the key", () => {
  const a = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "  k1  ",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
  });
  const b = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
  });
  assert.equal(a, b);
});

test("Phase 20K buildReconciliationIdempotencyKey: blank sourceConversionKey is rejected", () => {
  assert.throws(
    () =>
      buildReconciliationIdempotencyKey({
        network: "shopee",
        sourceConversionKey: "   ",
        previousStatus: "pending",
        nextStatus: "approved",
        decision: "approve",
      }),
    IdempotencyKeyError,
  );
  assert.throws(
    () =>
      buildReconciliationIdempotencyKey({
        network: "shopee",
        sourceConversionKey: "",
        previousStatus: "pending",
        nextStatus: "approved",
        decision: "approve",
      }),
    IdempotencyKeyError,
  );
});

test("Phase 20K buildReconciliationIdempotencyKey: tiktok network is explicitly refused", () => {
  assert.throws(
    () =>
      buildReconciliationIdempotencyKey({
        network: "tiktok",
        sourceConversionKey: "k1",
        previousStatus: "pending",
        nextStatus: "approved",
        decision: "approve",
      }),
    IdempotencyKeyError,
  );
});

test("Phase 20K buildReconciliationShortId: returns the first 16 hex chars of the full digest", () => {
  const full = buildReconciliationIdempotencyKey({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
  });
  const short = buildReconciliationShortId({
    network: "shopee",
    sourceConversionKey: "k1",
    previousStatus: "pending",
    nextStatus: "approved",
    decision: "approve",
  });
  assert.equal(short, full.slice(0, 16));
  assert.match(short, /^[a-f0-9]{16}$/);
});