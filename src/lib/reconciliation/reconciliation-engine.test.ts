/**
 * Phase 20K -- reconciliation pure engine tests.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  planReconciliationDecisions,
  summariseDecisions,
  type ReconciliationConversionSnapshot,
} from "./reconciliation-engine";

function makeSnapshot(
  overrides: Partial<ReconciliationConversionSnapshot>,
): ReconciliationConversionSnapshot {
  const has = <K extends keyof ReconciliationConversionSnapshot>(
    key: K,
  ): boolean => Object.prototype.hasOwnProperty.call(overrides, key);
  const get = <K extends keyof ReconciliationConversionSnapshot>(
    key: K,
    fallback: ReconciliationConversionSnapshot[K],
  ): ReconciliationConversionSnapshot[K] =>
    has(key) ? (overrides[key] as ReconciliationConversionSnapshot[K]) : fallback;
  return {
    conversionId: get("conversionId", "conv-1"),
    network: get("network", "shopee"),
    sourceConversionKey: get("sourceConversionKey", "k-stable"),
    status: get("status", "pending"),
    networkCommission: get("networkCommission", 1000),
    cashbackShareBpsSnapshot: get("cashbackShareBpsSnapshot", 6000),
    userCashback: get("userCashback", 600),
    platformProfit: get("platformProfit", 400),
    stagedRowId: get("stagedRowId", "row-1"),
    matchedUserId: get("matchedUserId", "user-1"),
    matchedClickId: get("matchedClickId", "click-1"),
    matchedPurchaseIntentId: get("matchedPurchaseIntentId", "pi-1"),
    linkKind: get("linkKind", "unique"),
    occurredAt: get("occurredAt", new Date("2026-07-12T00:00:00Z")),
  };
}

test("Phase 20K plan: unique matched pending row → apply approved", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({ status: "pending" }),
  ]);
  assert.equal(decisions.length, 1);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "apply");
  if (decision.kind === "apply") {
    assert.equal(decision.previousStatus, "pending");
    assert.equal(decision.nextStatus, "approved");
    assert.equal(decision.reasonCode, "approved_eligible_by_match");
    assert.match(decision.idempotencyKey, /^[a-f0-9]{64}$/);
  }
});

test("Phase 20K plan: approved row is advanced to payable", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({ status: "approved" }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "apply");
  if (decision.kind === "apply") {
    assert.equal(decision.previousStatus, "approved");
    assert.equal(decision.nextStatus, "payable");
    assert.equal(decision.reasonCode, "marked_payable_by_reconciliation");
  }
});

test("Phase 20K plan: payable row is NOT advanced to paid (Phase 20K hard rule)", () => {
  // Phase 20K hard rule: the engine refuses to plan a
  // `payable -> paid` transition. Marking a conversion `paid`
  // requires the future settlement / payout pipeline (Phase 20K+).
  const decisions = planReconciliationDecisions([
    makeSnapshot({ status: "payable" }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.currentStatus, "payable");
    assert.equal(decision.reasonCode, "rejected_paid_out_of_phase_20k_scope");
  }
});

test("Phase 20K plan: terminal paid rows are skipped (refuses to mutate)", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({ status: "paid" }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_terminal_state");
  }
});

test("Phase 20K plan: terminal rejected rows are skipped", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({ status: "rejected" }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_terminal_state");
  }
});

test("Phase 20K plan: missing sourceConversionKey is skipped", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({ sourceConversionKey: null }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_duplicate_source_key");
  }
});

test("Phase 20K plan: unmatched rows are skipped (matched-user null fallback)", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({
      linkKind: "unmatched",
      matchedUserId: null,
      matchedClickId: null,
    }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_missing_user");
  }
});

test("Phase 20K plan: unmatched rows with only click missing → rejected_missing_click", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({
      linkKind: "unmatched",
      matchedUserId: "user-1",
      matchedClickId: null,
    }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_missing_click");
  }
});

test("Phase 20K plan: ambiguous match is skipped (no guessing)", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({ linkKind: "ambiguous" }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_ambiguous_match");
  }
});

test("Phase 20K plan: duplicate conversion link is skipped", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({ linkKind: "duplicate" }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_duplicate_conversion");
  }
});

test("Phase 20K plan: negative commission is skipped", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({
      networkCommission: -100,
      userCashback: 0,
      platformProfit: 0,
    }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_negative_commission");
  }
});

test("Phase 20K plan: invariant-broken existing row is refused", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({
      networkCommission: 1000,
      userCashback: 300,
      platformProfit: 200,
    }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_no_money_split");
  }
});

test("Phase 20K plan: policy 7000 accepts the persisted 700 / 300 split", () => {
  const [decision] = planReconciliationDecisions([
    makeSnapshot({
      networkCommission: 1_000,
      cashbackShareBpsSnapshot: 7_000,
      userCashback: 700,
      platformProfit: 300,
    }),
  ]);
  assert.equal(decision?.kind, "apply");
  if (decision?.kind === "apply") {
    assert.equal(decision.money.userCashbackBpsApplied, 7_000);
    assert.equal(decision.money.userCashback, 700);
    assert.equal(decision.money.platformProfit, 300);
  }
});

test("Phase 20K plan: policy boundaries 0 and 10000 remain valid", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({
      conversionId: "bps-zero",
      cashbackShareBpsSnapshot: 0,
      userCashback: 0,
      platformProfit: 1_000,
    }),
    makeSnapshot({
      conversionId: "bps-full",
      cashbackShareBpsSnapshot: 10_000,
      userCashback: 1_000,
      platformProfit: 0,
    }),
  ]);
  assert.deepEqual(decisions.map((decision) => decision.kind), ["apply", "apply"]);
});

test("Phase 20K plan: missing policy snapshot fails closed without falling back to 6000", () => {
  const [decision] = planReconciliationDecisions([
    makeSnapshot({ cashbackShareBpsSnapshot: null }),
  ]);
  assert.equal(decision?.kind, "skip");
  if (decision?.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_missing_cashback_policy");
  }
});

test("Phase 20K plan: invalid policy snapshots fail closed", () => {
  for (const cashbackShareBpsSnapshot of [-1, 10_001, 6_000.5]) {
    const [decision] = planReconciliationDecisions([
      makeSnapshot({ cashbackShareBpsSnapshot }),
    ]);
    assert.equal(decision?.kind, "skip");
    if (decision?.kind === "skip") {
      assert.equal(decision.reasonCode, "rejected_invalid_cashback_policy");
    }
  }
});

test("Phase 20K plan: policy 7000 rejects a persisted 600 / 400 split", () => {
  const [decision] = planReconciliationDecisions([
    makeSnapshot({ cashbackShareBpsSnapshot: 7_000 }),
  ]);
  assert.equal(decision?.kind, "skip");
  if (decision?.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_no_money_split");
  }
});

test("Phase 20K plan: tiktok network is never advanced even when perfectly matched", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({ network: "tiktok" }),
  ]);
  const decision = decisions[0];
  assert.ok(decision);
  assert.equal(decision.kind, "skip");
  if (decision.kind === "skip") {
    assert.equal(decision.reasonCode, "rejected_attribution_invalid");
  }
});

test("Phase 20K summarise: empty decision list yields zero summary", () => {
  const summary = summariseDecisions([]);
  assert.equal(summary.scannedRows, 0);
  assert.equal(summary.applied, 0);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.totals.networkCommission, 0);
  assert.equal(summary.totals.userCashback, 0);
  assert.equal(summary.totals.platformProfit, 0);
});

test("Phase 20K summarise: apply decisions contribute to totals, skip decisions do not", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({
      conversionId: "c-1",
      status: "pending",
      networkCommission: 1000,
      userCashback: 600,
      platformProfit: 400,
    }),
    makeSnapshot({
      conversionId: "c-2",
      status: "pending",
      networkCommission: 500,
      userCashback: 300,
      platformProfit: 200,
    }),
    makeSnapshot({
      conversionId: "c-3",
      status: "paid",
      networkCommission: 999_999,
      userCashback: 555_555,
      platformProfit: 444_444,
    }),
  ]);
  const summary = summariseDecisions(decisions);
  assert.equal(summary.scannedRows, 3);
  assert.equal(summary.applied, 2);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.totals.networkCommission, 1500);
  assert.equal(summary.totals.userCashback, 900);
  assert.equal(summary.totals.platformProfit, 600);
  assert.equal(summary.byReason.approved_eligible_by_match, 2);
  assert.equal(summary.byReason.rejected_terminal_state, 1);
});

test("Phase 20K summarise: summary preserves the invariant when summed", () => {
  const decisions = planReconciliationDecisions([
    makeSnapshot({
      conversionId: "c-1",
      status: "pending",
      networkCommission: 123_456_789,
      userCashback: 74_074_073,
      platformProfit: 49_382_716,
    }),
    makeSnapshot({
      conversionId: "c-2",
      status: "approved",
      networkCommission: 50_000_000,
      userCashback: 30_000_000,
      platformProfit: 20_000_000,
    }),
  ]);
  const summary = summariseDecisions(decisions);
  assert.equal(
    summary.totals.networkCommission,
    summary.totals.userCashback + summary.totals.platformProfit,
  );
});

test("Phase 20K idempotency: same sourceConversionKey + decision yields the same idempotency key", () => {
  const a = planReconciliationDecisions([
    makeSnapshot({
      conversionId: "c-a",
      sourceConversionKey: "stable-source",
      status: "pending",
      stagedRowId: "row-a",
    }),
  ]);
  const b = planReconciliationDecisions([
    makeSnapshot({
      conversionId: "c-b",
      sourceConversionKey: "stable-source",
      status: "pending",
      stagedRowId: "row-b",
    }),
  ]);
  const da = a[0];
  const db = b[0];
  assert.ok(da && db);
  assert.equal(da.kind, "apply");
  assert.equal(db.kind, "apply");
  if (da.kind === "apply" && db.kind === "apply") {
    assert.equal(da.idempotencyKey, db.idempotencyKey);
  }
});

test("Phase 20K idempotency: re-running plan on the same snapshot yields the same decision list", () => {
  const snapshot: ReconciliationConversionSnapshot = makeSnapshot({
    status: "approved",
  });
  const first = planReconciliationDecisions([snapshot]);
  const second = planReconciliationDecisions([snapshot]);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
