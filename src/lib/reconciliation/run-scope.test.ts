/**
 * Phase 20K follow-up 2 -- pure unit tests for the run-scope
 * planner.
 *
 * Covers:
 *
 *   - candidate fingerprint is deterministic + stable across runs
 *     with the same candidate set
 *   - rejected candidates stay as `skip` and do NOT carry a
 *     planned idempotency key
 *   - apply candidates carry the closed reason code from the
 *     source-evidence mapper
 *   - Phase 20K checkpoint 4E1 -- reject candidates carry the
 *     same preserved commission split as apply candidates
 *     (the audit-row `commission_allocation_check` constraint
 *     requires `network = user + platform`; the existing
 *     60/40 split already satisfies it, so the planner must
 *     NOT overwrite it with zero values when the next status
 *     is `rejected`).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { ConversionStatus } from "@/types/affiliate";

import { planRunScope, buildRunCandidateFingerprint, buildProvenanceFingerprint } from "./run-scope";
import type { ReconciliationNetwork, SourceEvidenceSnapshot } from "./source-evidence";

function sourceKey(i: number): string {
  return (
    "00000000000000000000000000000000000000000000000000000000000000" +
    i.toString(16).padStart(2, "0")
  ).slice(-64);
}

function baseInput(
  i: number,
  overrides?: Partial<{
    currentStatus: ConversionStatus;
    validationStatus:
      | "approved"
      | "rejected"
      | "recorded"
      | "reconciling"
      | "reversed"
      | null;
    settlementStatus: "payable" | "paid" | "not_payable" | null;
    sourceConversionKey: string | null | undefined;
    ingestionEventId: string;
    persistedLinkKind:
      | "unique"
      | "missing"
      | "owner_mismatch"
      | "source_key_collision"
      | "order_id_collision"
      | null;
    sourceStatus:
      | "confirmed_eligible"
      | "confirmed_invalid"
      | "cancelled"
      | "refunded"
      | "pending_source"
      | "unknown"
      | null;
    network: ReconciliationNetwork;
    cashbackShareBpsSnapshot: number | null;
    userCashback: number;
    platformProfit: number;
  }>,
): Parameters<typeof planRunScope>[0]["candidates"][number] {
  const snap: SourceEvidenceSnapshot = {
    network: overrides?.network ?? "shopee",
    currentStatus: overrides?.currentStatus ?? "pending",
    validationStatus: overrides?.validationStatus ?? "approved",
    settlementStatus: overrides?.settlementStatus ?? null,
    sourceConversionKey:
      "sourceConversionKey" in (overrides ?? {})
        ? (overrides?.sourceConversionKey as string | null)
        : sourceKey(i),
    ingestionEventId:
      overrides?.ingestionEventId ??
      "00000000-0000-4000-8000-000000000001",
    persistedLinkKind:
      overrides?.persistedLinkKind === null
        ? null
        : overrides?.persistedLinkKind ?? "unique",
    sourceStatus: overrides?.sourceStatus ?? "confirmed_eligible",
  };
  return {
    conversionId: "c-" + i,
    snapshot: snap,
    commission: {
      networkCommission: 10000,
      cashbackShareBpsSnapshot:
        "cashbackShareBpsSnapshot" in (overrides ?? {})
          ? overrides?.cashbackShareBpsSnapshot
          : 6000,
      userCashback: overrides?.userCashback ?? 6000,
      platformProfit: overrides?.platformProfit ?? 4000,
    },
  };
}

test("planRunScope: apply with confirmed_eligible evidence", () => {
  const plan = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000010",
    candidates: [baseInput(1)],
  });
  assert.equal(plan.candidates.length, 1);
  const c = plan.candidates[0]!;
  assert.equal(c.kind, "apply");
  if (c.kind === "apply") {
    assert.equal(c.previousStatus, "pending");
    assert.equal(c.nextStatus, "approved");
    assert.equal(c.plannedMoneyNetworkCommission, 10000);
    assert.equal(c.plannedCashbackShareBps, 6000);
    assert.equal(c.plannedIdempotencyKey.length, 64);
    assert.ok(c.provenanceFingerprint.length > 0);
  }
});

test("planRunScope: cancelled source -> reject candidate preserves existing commission split", () => {
  const c = baseInput(2, { sourceStatus: "cancelled" });
  const plan = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000011",
    candidates: [c],
  });
  const only = plan.candidates[0]!;
  assert.equal(only.kind, "reject");
  if (only.kind === "reject") {
    assert.equal(only.nextStatus, "rejected");
    // Phase 20K checkpoint 4E1 -- preserve the existing
    // reconciled commission fields on a rejected transition.
    // The conversion UPDATE keeps `network_commission`,
    // `user_cashback`, `platform_profit` unchanged and only
    // stamps `status = 'rejected'` + `rejected_at` +
    // `rejected_reason`. The existing 60/40 split must
    // continue to satisfy `network = user + platform`.
    assert.equal(only.plannedMoneyNetworkCommission, 10000);
    assert.equal(only.plannedMoneyUserCashback, 6000);
    assert.equal(only.plannedMoneyPlatformProfit, 4000);
  }
});

test("planRunScope: missing source key -> skip", () => {
  const c = baseInput(3, { sourceConversionKey: null });
  const plan = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000012",
    candidates: [c],
  });
  const only = plan.candidates[0]!;
  assert.equal(only.kind, "skip");
  if (only.kind === "skip") {
    assert.equal(only.reasonCode, "rejected_missing_source_key");
  }
});

test("planRunScope: candidate fingerprint is independent of runId (same candidate set)", () => {
  const a = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000013",
    candidates: [baseInput(4), baseInput(5)],
  });
  const b = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000014",
    candidates: [baseInput(4), baseInput(5)],
  });
  // The run fingerprint deliberately excludes runId (the run id
  // is the durable identity -- including it would make every
  // run unique even when the underlying candidate set is
  // identical).
  assert.equal(a.candidateFingerprint, b.candidateFingerprint);
});

test("planRunScope: candidate fingerprint is stable regardless of input order", () => {
  const a = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000014",
    candidates: [baseInput(4), baseInput(5)],
  });
  const b = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000014",
    candidates: [baseInput(5), baseInput(4)],
  });
  // Order of candidates does not change the fingerprint
  // because the planner sorts the source key list before
  // hashing.
  assert.equal(a.candidateFingerprint, b.candidateFingerprint);
});

test("planRunScope: candidate fingerprint changes when set changes", () => {
  const a = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000015",
    candidates: [baseInput(6)],
  });
  const b = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000016",
    candidates: [baseInput(7)],
  });
  assert.notEqual(a.candidateFingerprint, b.candidateFingerprint);
});

test("planRunScope: unknown network throws", () => {
  assert.throws(() =>
    planRunScope({
      network: "tiktok" as never,
      runId: "00000000-0000-4000-8000-000000000017",
      candidates: [],
    }),
  );
});

test("buildRunCandidateFingerprint: unknown network throws", () => {
  assert.throws(() =>
    buildRunCandidateFingerprint({
      runId: "00000000-0000-4000-8000-000000000018",
      network: "tiktok" as never,
      orderedSourceConversionKeys: [],
      policyVersion: 1,
    }),
  );
});

test("buildProvenanceFingerprint: deterministic for identical inputs", () => {
  const snap = baseInput(8).snapshot;
  const a = buildProvenanceFingerprint(snap, "x".repeat(64), 6000);
  const b = buildProvenanceFingerprint(snap, "x".repeat(64), 6000);
  assert.equal(a, b);
});

test("planRunScope: policy 7000 preserves bps and the 7000 / 3000 split", () => {
  const plan = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000019",
    candidates: [
      baseInput(9, {
        cashbackShareBpsSnapshot: 7000,
        userCashback: 7000,
        platformProfit: 3000,
      }),
    ],
  });
  const candidate = plan.candidates[0]!;
  assert.equal(candidate.kind, "apply");
  if (candidate.kind === "apply") {
    assert.equal(candidate.plannedCashbackShareBps, 7000);
    assert.equal(candidate.plannedMoneyUserCashback, 7000);
    assert.equal(candidate.plannedMoneyPlatformProfit, 3000);
  }
});

test("planRunScope: missing policy snapshot fails closed", () => {
  const plan = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000020",
    candidates: [baseInput(10, { cashbackShareBpsSnapshot: null })],
  });
  assert.deepEqual(plan.candidates[0], {
    kind: "skip",
    conversionId: "c-10",
    reasonCode: "rejected_missing_cashback_policy",
  });
});

test("planRunScope: invalid policy snapshot fails closed", () => {
  for (const cashbackShareBpsSnapshot of [-1, 10_001, 6000.5]) {
    const plan = planRunScope({
      network: "shopee",
      runId: "00000000-0000-4000-8000-000000000021",
      candidates: [baseInput(11, { cashbackShareBpsSnapshot })],
    });
    assert.equal(plan.candidates[0]?.kind, "skip");
    assert.equal(
      plan.candidates[0]?.reasonCode,
      "rejected_invalid_cashback_policy",
    );
  }
});

test("planRunScope: policy 7000 rejects persisted money that still uses 6000", () => {
  const plan = planRunScope({
    network: "shopee",
    runId: "00000000-0000-4000-8000-000000000022",
    candidates: [baseInput(12, { cashbackShareBpsSnapshot: 7000 })],
  });
  assert.equal(plan.candidates[0]?.kind, "skip");
  assert.equal(
    plan.candidates[0]?.reasonCode,
    "rejected_cashback_policy_money_mismatch",
  );
});

test("buildProvenanceFingerprint: cashback policy evidence changes the fingerprint", () => {
  const snap = baseInput(13).snapshot;
  assert.notEqual(
    buildProvenanceFingerprint(snap, "x".repeat(64), 6000),
    buildProvenanceFingerprint(snap, "x".repeat(64), 7000),
  );
});
