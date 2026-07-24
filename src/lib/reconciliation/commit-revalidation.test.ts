/**
 * Phase 20K checkpoint 4B -- pure unit tests for the
 * commit-time source-evidence revalidation helper.
 *
 * Covers the eight scenarios from the checkpoint task:
 *
 *   1. unchanged evidence:
 *      commit applies the planned transition;
 *   2. validation status changes after dry-run:
 *      commit skips;
 *   3. settlement status changes after dry-run:
 *      commit skips;
 *   4. source order becomes cancelled / refunded after dry-run:
 *      commit skips;
 *   5. network commission changes after dry-run:
 *      commit skips;
 *   6. attribution ownership / provenance changes after dry-run:
 *      commit skips;
 *   7. conversion status changes after dry-run:
 *      commit skips;
 *   8. unchanged evidence with the policy-derived split:
 *      transition and one durable audit event are applied.
 *
 * The helper is pure: a `match` result means the helper would
 * let commit proceed. A `stale` result means the helper would
 * push `rejected_stale_source_evidence` onto the skip queue and
 * never touch the audit event or UPDATE the conversion row.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  compareLiveEvidenceAgainstPlan,
  isCommitRevalidationStale,
  type CommitLiveEvidence,
  type CommitPlanSnapshot,
} from "./commit-revalidation";
import { buildProvenanceFingerprint } from "./run-scope";
import type { ConversionStatus } from "@/types/affiliate";

const CONVERSION_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const NETWORK = "shopee" as const;

const SOURCE_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const INGESTION_EVENT_ID =
  "33333333-3333-3333-3333-333333333333";
const PUBLISHER_ID = "44444444-4444-4444-4444-444444444444";
const TRACKING_LINK_ID = "55555555-5555-5555-5555-555555555555";
const POLICY_VERSION = 1;

function baseLive(overrides?: Partial<CommitLiveEvidence>): CommitLiveEvidence {
  return {
    conversionId: CONVERSION_ID,
    currentStatus: "pending",
    network: NETWORK,
    sourceConversionKey: SOURCE_KEY,
    ingestionEventId: INGESTION_EVENT_ID,
    validationStatus: "approved",
    settlementStatus: null,
    sourceStatus: "confirmed_eligible",
    persistedLinkKind: "unique",
    publisherId: PUBLISHER_ID,
    trackingLinkId: TRACKING_LINK_ID,
    csvRowIdentity: SOURCE_KEY,
    networkCommission: 1000,
    cashbackShareBpsSnapshot: 6000,
    userCashback: 600,
    platformProfit: 400,
    ...overrides,
  };
}

function basePlan(
  overrides?: Partial<CommitPlanSnapshot>,
): CommitPlanSnapshot {
  // The persisted plan must carry the SAME fingerprint that the
  // helper will rebuild from the LIVE evidence on a "match"
  // scenario. We compute it lazily from a snapshot built with the
  // SAME fields baseLive starts with.
  const live = baseLive();
  const planPlannedCommission = live.networkCommission;
  return {
    conversionId: CONVERSION_ID,
    network: NETWORK,
    expectedPreviousStatus: live.currentStatus as ConversionStatus,
    intendedNextStatus: "approved" as ConversionStatus,
    sourceConversionKey: live.sourceConversionKey ?? "",
    plannedMoneyNetworkCommission: planPlannedCommission,
    plannedCashbackShareBps: 6000,
    plannedMoneyUserCashback: 600,
    plannedMoneyPlatformProfit: 400,
    plannedIdempotencyKey:
      "a".repeat(64),
    provenanceFingerprint: "", // filled in by caller per scenario
    policyVersion: POLICY_VERSION,
    ...overrides,
  };
}

const PLAN: CommitPlanSnapshot = basePlan();

test("compareLiveEvidenceAgainstPlan: (1, 8) unchanged evidence + correct policy split -> match", () => {
  // Same live evidence the planner recorded at dry-run. Fingerprint
  // rebuild must equal the persisted fingerprint.
  const live = baseLive();
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(live),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "match");
  assert.equal(isCommitRevalidationStale(result), false);
});

test("compareLiveEvidenceAgainstPlan: (2) validation status changed -> stale_provenance_fingerprint", () => {
  // The planner does NOT persist validation_status explicitly --
  // it only persists the rebuilt `provenance_fingerprint`. The
  // helper detects validation drift via the fingerprint
  // comparison.
  const live = baseLive({ validationStatus: "rejected" });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(
      result.reason,
      "stale_provenance_fingerprint",
      "validation drift must report stale_provenance_fingerprint (fingerprint is the only field the planner persisted)",
    );
  }
});

test("compareLiveEvidenceAgainstPlan: (3) settlement status changed -> stale_provenance_fingerprint", () => {
  // Same as (2): settlement_status lives only on the conversion
  // row + source-evidence snapshot, not on the persisted candidate
  // row. Drift is reported via fingerprint mismatch.
  const live = baseLive({ settlementStatus: "not_payable" });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_provenance_fingerprint");
  }
});

test("compareLiveEvidenceAgainstPlan: (4a) source order becomes cancelled -> stale_source_status", () => {
  const live = baseLive({ sourceStatus: "cancelled" });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_source_status");
  }
});

test("compareLiveEvidenceAgainstPlan: (4b) source order becomes refunded -> stale_source_status", () => {
  const live = baseLive({ sourceStatus: "refunded" });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_source_status");
  }
});

test("compareLiveEvidenceAgainstPlan: (5) network commission changed -> stale_network_commission", () => {
  const live = baseLive({ networkCommission: 2000 });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    plannedMoneyNetworkCommission: 1000,
    plannedMoneyUserCashback: 600,
    plannedMoneyPlatformProfit: 400,
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    // The 60/40 split of 2000 -> 1200 + 800 != plan 600 + 400;
    // the helper reports the more specific stale_network_commission
    // reason before the 60/40 split reason.
    assert.equal(result.reason, "stale_network_commission");
  }
});

test("compareLiveEvidenceAgainstPlan: planned money disagrees with the persisted policy -> stale policy split", () => {
  const live = baseLive({ networkCommission: 1000 });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    plannedMoneyNetworkCommission: 1000,
    plannedMoneyUserCashback: 500,
    plannedMoneyPlatformProfit: 500,
    provenanceFingerprint: computeFingerprintForLive(live),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_cashback_policy_money_split");
  }
});

test("compareLiveEvidenceAgainstPlan: unchanged policy 7000 with 700 / 300 -> match", () => {
  const live = baseLive({
    cashbackShareBpsSnapshot: 7000,
    userCashback: 700,
    platformProfit: 300,
  });
  const plan = basePlan({
    plannedCashbackShareBps: 7000,
    plannedMoneyUserCashback: 700,
    plannedMoneyPlatformProfit: 300,
    provenanceFingerprint: computeFingerprintForLive(live, 7000),
  });
  assert.equal(compareLiveEvidenceAgainstPlan(live, plan).kind, "match");
});

test("compareLiveEvidenceAgainstPlan: planned bps differs from live persisted bps -> stale", () => {
  const live = baseLive({
    cashbackShareBpsSnapshot: 7000,
    userCashback: 700,
    platformProfit: 300,
  });
  const plan = basePlan({
    plannedCashbackShareBps: 6000,
    provenanceFingerprint: computeFingerprintForLive(live, 6000),
  });
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.deepEqual(result, { kind: "stale", reason: "stale_cashback_share_bps" });
});

test("compareLiveEvidenceAgainstPlan: missing live policy snapshot -> stale without a default", () => {
  const live = baseLive({ cashbackShareBpsSnapshot: null });
  const plan = basePlan({ provenanceFingerprint: computeFingerprintForLive(live) });
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.deepEqual(result, {
    kind: "stale",
    reason: "stale_cashback_policy_missing",
  });
});

test("compareLiveEvidenceAgainstPlan: policy 7000 with live 600 / 400 money -> stale", () => {
  const live = baseLive({ cashbackShareBpsSnapshot: 7000 });
  const plan = basePlan({
    plannedCashbackShareBps: 7000,
    plannedMoneyUserCashback: 700,
    plannedMoneyPlatformProfit: 300,
    provenanceFingerprint: computeFingerprintForLive(live, 7000),
  });
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.deepEqual(result, {
    kind: "stale",
    reason: "stale_cashback_policy_money_split",
  });
});

test("compareLiveEvidenceAgainstPlan: (6a) persistence provenance is no longer unique -> stale_persisted_link_kind", () => {
  // The 4A2B taxonomy: tracker link now reports a different owner,
  // so loader returns owner_mismatch -> helper must fail closed.
  const live = baseLive({ persistedLinkKind: "owner_mismatch" });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_persisted_link_kind");
  }
});

test("compareLiveEvidenceAgainstPlan: (6b) tracking-link ownership pivot -> stale_publisher_attribution", () => {
  // Publisher/tracking-link attribution removed (null). The
  // helper reports stale_publisher_attribution before the
  // empty-source-row check (publisher must be present).
  const live = baseLive({ publisherId: null });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_publisher_attribution");
  }
});

test("compareLiveEvidenceAgainstPlan: (7) conversion status changed -> stale_current_status", () => {
  const live = baseLive({ currentStatus: "approved" });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    expectedPreviousStatus: "pending",
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_current_status");
  }
});

test("compareLiveEvidenceAgainstPlan: extra -- source_conversion_key changed -> stale_source_conversion_key", () => {
  const live = baseLive({
    sourceConversionKey:
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
  });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_source_conversion_key");
  }
});

test("compareLiveEvidenceAgainstPlan: extra -- ingestion_event_id changed -> stale_source_row_identity", () => {
  const live = baseLive({ ingestionEventId: null });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_source_row_identity");
  }
});

test("compareLiveEvidenceAgainstPlan: extra -- unchanged inputs but persisted fingerprint tampered -> stale_provenance_fingerprint", () => {
  const live = baseLive();
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint:
      "deadbeef".repeat(8), // 64 hex chars; not the real fingerprint
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_provenance_fingerprint");
  }
});

test("compareLiveEvidenceAgainstPlan: extra -- Addlivetag-claimed row with no real upstream evidence -> stale_persisted_link_kind", () => {
  // Addlivetag has no real persistence pipeline; the loadSourceEvidence
  // call returns persistedLinkKind = "missing". The production code
  // ALREADY refuses `missing`. The helper must agree.
  const live = baseLive({ persistedLinkKind: "missing" });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(baseLive()),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(result.kind, "stale");
  if (result.kind === "stale") {
    assert.equal(result.reason, "stale_persisted_link_kind");
  }
});

test("isCommitRevalidationStale: narrows the discriminated union", () => {
  const live = baseLive();
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    provenanceFingerprint: computeFingerprintForLive(live),
  };
  const match = compareLiveEvidenceAgainstPlan(live, plan);
  assert.equal(isCommitRevalidationStale(match), false);

  const stale = compareLiveEvidenceAgainstPlan(
    baseLive({ validationStatus: "rejected" }),
    plan,
  );
  assert.equal(isCommitRevalidationStale(stale), true);
});

// Phase 20K 4F1 -- BLOCKED; Phase 20K 4F1B -- HARD-BLOCK.
// The original 4F1 test asserted that the production-path
// revalidation returns `match` for an
// `approved + settlement_status='payable'` candidate whose
// fingerprint matches the live row. That test has been
// REPLACED below -- a `match` verdict at the revalidation
// layer is exactly the gap 4F1B must close with a hard
// producer gate, not by relying on the revalidation layer
// to ask "is the live value backed by a real settlement
// producer?". Phase 20K 4F1B installs that gate in two
// places:
//   1. The mapper
//      (`mapSourceEvidenceToDecision` in
//      `src/lib/reconciliation/source-evidence.ts`) refuses
//      to plan `approved -> payable`; it returns
//      `kind: "skip", reasonCode:
//      "rejected_unverified_settlement_evidence"`.
//   2. The engine's commit path
//      (`commitRun` in
//      `src/server/reconciliation/reconciliation.repository.ts`)
//      refuses any candidate whose
//      `intendedNextStatus = "payable"` BEFORE the
//      audit-claim INSERT or the conversion UPDATE, as
//      defense-in-depth for old or hand-crafted run
//      candidates.
//
// This unit test pins the documentary fact that the
// revalidation helper itself has no producer check. The
// `match` verdict below does NOT mean "safe to apply". A
// future 4F1-style checkpoint that introduces the real
// upstream settlement producer MUST replace BOTH the
// mapper gate and the commit gate before re-introducing
// the apply branch. Until then, Phase 20K is hard-blocked
// from advancing any conversion to `payable`, and the
// integration tests in
// `scripts/reconciliation-postgres.integration.test.ts`
// exercise the production-path fail-closed behavior
// end-to-end.
test("compareLiveEvidenceAgainstPlan: (4F1B HARD-BLOCK documentary) revalidation layer returns match for approved + settlement='payable' -- the safety gate lives in the mapper + commit path, NOT in revalidation", () => {
  const live = baseLive({
    currentStatus: "approved",
    validationStatus: "approved",
    settlementStatus: "payable",
    sourceStatus: "confirmed_eligible",
    persistedLinkKind: "unique",
  });
  const plan: CommitPlanSnapshot = {
    ...PLAN,
    expectedPreviousStatus: "approved",
    intendedNextStatus: "payable",
    provenanceFingerprint: computeFingerprintForLive(live),
  };
  const result = compareLiveEvidenceAgainstPlan(live, plan);
  // Documentary: the revalidation layer is fingerprint-only.
  // It does not know whether the settlement column is
  // backed by a real producer. The 4F1B producer gate must
  // live upstream (mapper) and at the commit-time defense-
  // in-depth check (reconciliation.repository.ts). Both are
  // asserted separately.
  assert.equal(
    result.kind,
    "match",
    "Phase 20K 4F1B: revalidation is fingerprint-only -- the producer gate is in the mapper + commit path, asserted by separate unit + integration tests",
  );
});

/**
 * Recompute the persisted `provenance_fingerprint` for a given
 * live-evidence shape so per-scenario plans can carry the same
 * fingerprint the planner would have written at dry-run. Calls
 * the same `buildProvenanceFingerprint` the production helper
 * invokes so the rebuild-equals-persisted check is meaningful.
 */
function computeFingerprintForLive(
  live: CommitLiveEvidence,
  cashbackShareBps = live.cashbackShareBpsSnapshot ?? 6000,
): string {
  return buildProvenanceFingerprint(
    {
      network: live.network,
      currentStatus: live.currentStatus,
      validationStatus: live.validationStatus as
        | "approved"
        | "rejected"
        | "recorded"
        | "reconciling"
        | "reversed"
        | null,
      settlementStatus: live.settlementStatus as
        | "not_payable"
        | "payable"
        | "paid"
        | null,
      sourceConversionKey: live.sourceConversionKey,
      ingestionEventId: live.ingestionEventId,
      persistedLinkKind: live.persistedLinkKind ?? null,
      sourceStatus: live.sourceStatus ?? "unknown",
    },
    PLAN.plannedIdempotencyKey,
    cashbackShareBps,
  );
}
