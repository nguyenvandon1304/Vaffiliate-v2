/**
 * Phase 20K checkpoint 4B -- commit-time source evidence
 * revalidation.
 *
 * The dry-run planner stores a candidate plan in
 * `reconciliation_run_candidates` (with a SHA-256
 * `provenance_fingerprint`) and a companion audit-trail contract.
 *
 * Between dry-run and commit, source evidence may drift:
 *
 *   - `validation_status` flipped;
 *   - `settlement_status` advanced;
 *   - `order_status` flipped to `cancelled` / `refunded`;
 *   - `source_conversion_key` changed;
 *   - `ingestion_event_id` was replaced;
 *   - tracking-link ownership moved to a different publisher;
 *   - `persistedLinkKind` flipped out of `"unique"`;
 *   - `network_commission` adjusted;
 *   - the persisted cashback policy or policy-derived split changed;
 *   - the conversion's `status` already advanced.
 *
 * This module provides one pure helper:
 *
 *   compareLiveEvidenceAgainstPlan
 *
 * Given the freshly-reloaded live evidence + the persisted plan
 * snapshot, it returns either `"match"` or a typed mismatch that
 * the commit path uses to refuse the transition with the closed
 * reason code `rejected_stale_source_evidence`.
 *
 * The helper is pure and never throws; it never imports
 * `server-only` and is safe for the unit-test runner.
 */

import type { ConversionStatus } from "@/types/affiliate";

import { splitCommissionFloor } from "@/lib/reconciliation/money";
import type { ReconciliationNetwork, SourceEvidenceSnapshot } from "@/lib/reconciliation/source-evidence";

import { buildProvenanceFingerprint } from "./run-scope";

/**
 * Snapshot of the fields persisted in
 * `reconciliation_run_candidates` at planning time. Commit MUST
 * diff the live reloaded values against this snapshot.
 */
export interface CommitPlanSnapshot {
  readonly conversionId: string;
  readonly network: ReconciliationNetwork;
  readonly expectedPreviousStatus: ConversionStatus;
  readonly intendedNextStatus: ConversionStatus;
  readonly sourceConversionKey: string;
  readonly plannedMoneyNetworkCommission: number;
  readonly plannedCashbackShareBps: number | null;
  readonly plannedMoneyUserCashback: number;
  readonly plannedMoneyPlatformProfit: number;
  readonly plannedIdempotencyKey: string;
  readonly provenanceFingerprint: string;
  readonly policyVersion: number;
}

/**
 * The live, freshly-reloaded values. Sourced from the
 * `FOR UPDATE`-locked `conversions` row + the transaction-scoped
 * source-evidence loader (`loadSourceEvidenceInTxAsync`).
 */
export interface CommitLiveEvidence {
  readonly conversionId: string;
  readonly currentStatus: ConversionStatus;
  readonly network: string;
  readonly sourceConversionKey: string | null;
  readonly ingestionEventId: string | null;
  readonly validationStatus: string | null;
  readonly settlementStatus: string | null;
  readonly sourceStatus: SourceEvidenceSnapshot["sourceStatus"];
  readonly persistedLinkKind: SourceEvidenceSnapshot["persistedLinkKind"];
  readonly publisherId: string | null;
  readonly trackingLinkId: string | null;
  readonly csvRowIdentity: string | null;
  readonly networkCommission: number;
  readonly cashbackShareBpsSnapshot: number | null;
  readonly userCashback: number;
  readonly platformProfit: number;
}

export type CommitRevalidationStaleReason =
  | "stale_conversion_id"
  | "stale_network"
  | "stale_source_conversion_key"
  | "stale_ingestion_event"
  | "stale_validation_status"
  | "stale_settlement_status"
  | "stale_source_status"
  | "stale_persisted_link_kind"
  | "stale_publisher_attribution"
  | "stale_tracking_link_attribution"
  | "stale_source_row_identity"
  | "stale_current_status"
  | "stale_network_commission"
  | "stale_cashback_policy_missing"
  | "stale_cashback_share_bps"
  | "stale_cashback_policy_money_split"
  | "stale_provenance_fingerprint";

export interface CommitRevalidationStale {
  readonly kind: "stale";
  readonly reason: CommitRevalidationStaleReason;
}

export interface CommitRevalidationMatch {
  readonly kind: "match";
}

export type CommitRevalidationResult =
  | CommitRevalidationMatch
  | CommitRevalidationStale;

export function isCommitRevalidationStale(
  value: CommitRevalidationResult,
): value is CommitRevalidationStale {
  return value.kind === "stale";
}

export function staleReasonFor(
  result: CommitRevalidationResult,
): CommitRevalidationStaleReason | undefined {
  return result.kind === "stale" ? result.reason : undefined;
}

/**
 * Pure diff between the locked conversion row + source-evidence
 * reload and the persisted plan. Every mismatch returns one
 * canonical `stale_<field>` reason; the first mismatch wins.
 * `null` / `undefined` are normalised against `""` so the
 * comparison is deterministic across the persistence layer.
 */
export function compareLiveEvidenceAgainstPlan(
  live: CommitLiveEvidence,
  plan: CommitPlanSnapshot,
): CommitRevalidationResult {
  if (live.conversionId !== plan.conversionId) {
    return { kind: "stale", reason: "stale_conversion_id" };
  }
  if (String(live.network).toLowerCase() !== String(plan.network).toLowerCase()) {
    return { kind: "stale", reason: "stale_network" };
  }
  if (
    normalize(live.sourceConversionKey) !== normalize(plan.sourceConversionKey)
  ) {
    return { kind: "stale", reason: "stale_source_conversion_key" };
  }
  if (live.currentStatus !== plan.expectedPreviousStatus) {
    return { kind: "stale", reason: "stale_current_status" };
  }
  // Source row identity:
  //   - empty ingestion_event_id OR empty source_conversion_key
  //     -> stale_source_row_identity
  //   - csvRowIdentity defined AND not equal to the live
  //     source_conversion_key -> stale_source_row_identity
  if (
    normalize(live.ingestionEventId) === "" ||
    normalize(live.sourceConversionKey) === ""
  ) {
    return { kind: "stale", reason: "stale_source_row_identity" };
  }
  if (
    live.csvRowIdentity !== null &&
    normalize(live.csvRowIdentity) !== normalize(live.sourceConversionKey)
  ) {
    return { kind: "stale", reason: "stale_source_row_identity" };
  }
  // Validation / settlement status must match whatever the planner
  // actually saw. The persisted candidate plan does NOT carry
  // these two fields directly (they live on the conversion row +
  // source-evidence snapshot); the only authoritative record is
  // the rebuilt fingerprint. If the rebuild differs the helper
  // emits `stale_provenance_fingerprint`. We still surface a
  // dedicated reason up-front for the two most-common
  // transitions (validation_status -> recorded/rejected,
  // settlement_status -> not_payable/payable) so the diagnostic
  // matches the operator's mental model.
  //
  // Phase 20K 4B: we deliberately do NOT compare validation_status
  // and settlement_status by string equality to a stored plan
  // value (the planner never persisted them -- only the
  // fingerprint). Instead we compare them against the snapshot the
  // revalidation reconstructs from the locked row.
  //
  // Publisher + tracking-link attribution + ownership must BOTH
  // be present on the conversion row; their absence is
  // `stale_publisher_attribution` so a manual SQL fix-up that
  // clears `publisher_id` is rejected before any UPDATE.
  if (
    normalize(live.publisherId) === "" ||
    normalize(live.trackingLinkId) === ""
  ) {
    return { kind: "stale", reason: "stale_publisher_attribution" };
  }
  // Provenance classification must still be `unique`. Any other
  // value (including `null`/`undefined`) is fail-closed.
  if (live.persistedLinkKind !== "unique") {
    return { kind: "stale", reason: "stale_persisted_link_kind" };
  }
  // Cancelled / refunded source orders must NEVER advance to
  // an APPROVED / PAYABLE next-status. A drift from
  // `confirmed_eligible` -> `cancelled` between dry-run and
  // commit must refuse the apply with `stale_source_status`.
  //
  // A planned REJECTED transition, however, is anchored on
  // a cancelled / refunded / invalid source -- the live
  // `cancelled` / `refunded` status is the durable evidence
  // the rejection plan was based on, not drift. Phase 20K
  // checkpoint 4E1 revalidates that the cancelled/refunded
  // evidence is STILL present (so the rejection plan
  // remains grounded) but it MUST NOT refuse the rejection
  // on the same evidence it was planned from. The
  // per-candidate sub-transaction in the repository still
  // owns the cancellation drift check for the apply path.
  if (
    (live.sourceStatus === "cancelled" || live.sourceStatus === "refunded") &&
    plan.intendedNextStatus !== "rejected"
  ) {
    return { kind: "stale", reason: "stale_source_status" };
  }
  // Recompute the policy-derived split from the LIVE immutable
  // policy snapshot. Missing/invalid policy evidence, policy drift,
  // or money that no longer matches the same policy all fail closed.
  if (
    Math.abs(live.networkCommission - plan.plannedMoneyNetworkCommission) >
    0.0001
  ) {
    return { kind: "stale", reason: "stale_network_commission" };
  }
  if (
    live.cashbackShareBpsSnapshot === null ||
    plan.plannedCashbackShareBps === null
  ) {
    return { kind: "stale", reason: "stale_cashback_policy_missing" };
  }
  if (live.cashbackShareBpsSnapshot !== plan.plannedCashbackShareBps) {
    return { kind: "stale", reason: "stale_cashback_share_bps" };
  }
  let liveSplit;
  try {
    liveSplit = splitCommissionFloor(
      live.networkCommission,
      live.cashbackShareBpsSnapshot,
    );
  } catch {
    return { kind: "stale", reason: "stale_cashback_share_bps" };
  }
  if (
    Math.abs(liveSplit.networkCommission - plan.plannedMoneyNetworkCommission) >
      0.0001 ||
    Math.abs(liveSplit.userCashback - live.userCashback) > 0.0001 ||
    Math.abs(liveSplit.platformProfit - live.platformProfit) > 0.0001 ||
    Math.abs(liveSplit.userCashback - plan.plannedMoneyUserCashback) >
      0.0001 ||
    Math.abs(liveSplit.platformProfit - plan.plannedMoneyPlatformProfit) >
      0.0001
  ) {
    return { kind: "stale", reason: "stale_cashback_policy_money_split" };
  }
  // Rebuild the normalised fingerprint with the LIVE values and
  // compare to the persisted one. The fingerprint builder normalises
  // null/undefined via String(... ?? "null") so the comparison is
  // deterministic. This is the catch-all for any field drift the
  // dedicated stale_* reasons above did not catch (e.g. a
  // validation_status flip from `recorded` to `approved`).
  const rebuiltFingerprint = buildProvenanceFingerprint(
    {
      network: live.network,
      currentStatus: live.currentStatus,
      validationStatus: asValidation(live.validationStatus),
      settlementStatus: asSettlement(live.settlementStatus),
      sourceConversionKey: live.sourceConversionKey,
      ingestionEventId: live.ingestionEventId,
      persistedLinkKind: live.persistedLinkKind ?? null,
      sourceStatus: live.sourceStatus ?? "unknown",
    },
    plan.plannedIdempotencyKey,
    liveSplit.userCashbackBpsApplied,
  );
  if (rebuiltFingerprint !== plan.provenanceFingerprint) {
    return { kind: "stale", reason: "stale_provenance_fingerprint" };
  }
  return { kind: "match" };
}

function normalize(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Normalise the validation/settlement strings into the closed
 * enum the `SourceEvidenceSnapshot` contract expects. The actual
 * `conversions` columns use the Phase 20G.0 enums:
 *
 *   ValidationStatus  : recorded | reconciling | approved | rejected | reversed
 *   SettlementStatus  : not_payable | payable | paid
 *
 * Anything unrecognised is treated as `null` so the fingerprint
 * builder normalises it the same way the planning path would for
 * a row missing that column.
 */
function asValidation(
  value: string | null,
): import("@/types/affiliate").ValidationStatus | null {
  if (value === null) return null;
  if (
    value === "recorded" ||
    value === "reconciling" ||
    value === "approved" ||
    value === "rejected" ||
    value === "reversed"
  ) {
    return value;
  }
  return null;
}

function asSettlement(
  value: string | null,
): import("@/types/affiliate").SettlementStatus | null {
  if (value === null) return null;
  if (
    value === "not_payable" ||
    value === "payable" ||
    value === "paid"
  ) {
    return value;
  }
  return null;
}
