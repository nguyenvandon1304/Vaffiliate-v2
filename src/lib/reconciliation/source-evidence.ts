/**
 * Phase 20K follow-up 2 -- pure source-evidence mapper.
 *
 * Given a row-shaped snapshot of a `conversions` row plus the
 * immutable ingestion evidence (`shopee_ingestion_events`,
 * upstream CSV row fingerprint) attached to it, produce the
 * single transition decision the engine may plan for that row
 * in Phase 20K.
 *
 * The mapper is pure and exhaustive: it covers every legal
 * combination of `network`, `validationStatus`,
 * `settlementStatus`, `status`, `ingestionEventId`,
 * `sourceConversionKey`, and the source-status evidence row
 * returned by the ingestion layer. Unknown / missing evidence
 * never produces a forward transition -- it produces a typed
 * `skip` decision with a closed reason code.
 *
 * This module replaces the BLK A/B/C/E fabrication of
 * `linkKind = "unique"` + `matchedPurchaseIntentId =
 * advertiser:campaign`. The mapper never invents evidence: it
 * either finds it in the snapshot or refuses to plan.
 */

import type { ConversionStatus, SettlementStatus, ValidationStatus } from "@/types/affiliate";

export type ReconciliationNetwork = "shopee" | "tiktok" | "manual";

export const ALLOWED_RECONCILIATION_NETWORKS: ReadonlyArray<ReconciliationNetwork> =
  Object.freeze(["shopee"]);

/**
 * The closed reason code list. Phase 20K follow-up 2 introduces
 * `rejected_missing_provenance`, `rejected_unknown_network`,
 * `rejected_source_status_unknown`,
 * `rejected_source_cancelled`,
 * `rejected_source_refunded`,
 * `rejected_source_invalid`,
 * `rejected_source_not_confirmed`,
 * `rejected_settlement_not_payable`,
 * `rejected_terminal_state` (kept for parity with the engine),
 * `rejected_paid_out_of_phase_20k_scope` (kept for parity).
 *
 * Phase 20K 4E2B splits the prior shared closed code so CANCELLED
 * always emits `rejected_source_cancelled` and REFUNDED always
 * emits `rejected_source_refunded`. Phase 20K 4E3 introduces the
 * distinct closed code `rejected_source_invalid` for the explicit
 * `pending + confirmed_invalid` -> reject (pending -> rejected)
 * branch, so the rejection surface for persisted INVALID evidence
 * (sourced from `shopee_ingestion_events.processing_status =
 * 'failed'` -> normalized `sourceStatus = "confirmed_invalid"`)
 * does not collide with the "not_confirmed" skip branch used when
 * no real source confirmation has been recorded yet.
 */
export type SourceEvidenceDecisionKind =
  | "approve"
  | "mark_payable"
  | "reject"
  | "skip";

export type SourceEvidenceReasonCode =
  | "approved_eligible_by_match"
  | "approved_eligible_by_source_confirmation"
  | "rejected_missing_provenance"
  | "rejected_missing_source_key"
  | "rejected_missing_ingestion_event"
  | "rejected_unknown_network"
  | "rejected_source_status_unknown"
  | "rejected_source_cancelled"
  | "rejected_source_refunded"
  | "rejected_source_invalid"
  | "rejected_source_not_confirmed"
  | "rejected_missing_cashback_policy"
  | "rejected_invalid_cashback_policy"
  | "rejected_cashback_policy_money_mismatch"
  | "rejected_settlement_not_payable"
  | "rejected_terminal_state"
  | "rejected_paid_out_of_phase_20k_scope"
  | "rejected_attribution_owner_mismatch"
  | "rejected_attribution_source_key_collision"
  | "rejected_attribution_order_id_collision"
  | "rejected_stale_source_evidence"
  // Phase 20K 4F1B -- closed skip code emitted whenever the
  // reconciliation engine is asked to advance an `approved`
  // conversion to `payable` WITHOUT verified upstream
  // settlement evidence. A real durable upstream settlement
  // producer does not exist in this repository today (Phase
  // 20K 4F1 inventory), so any `approved -> payable` plan --
  // whether produced by the mapper from a hand-set column,
  // persisted in an older run candidate, or constructed by
  // accident -- must fail closed with this reason. The
  // `payable` apply branch in the mapper is REMOVED for
  // Phase 20K 4F1B; the engine's commit path also refuses
  // `intendedNextStatus = "payable"` as a defense-in-depth
  // check before any audit-claim INSERT or conversion
  // UPDATE. A future checkpoint that introduces the real
  // upstream settlement producer MUST replace this guard
  // (rather than merely toggling it off) so the gate's
  // intent -- "no producer, no payable transition" -- is
  // preserved.
  | "rejected_unverified_settlement_evidence";

export interface SourceEvidenceSnapshot {
  /** The closed network enum read from `conversions.network`. */
  readonly network: ReconciliationNetwork | string | null;
  /** Current lifecycle status from `conversions.status`. */
  readonly currentStatus: ConversionStatus;
  /** Phase 20G.2a split-status: validation lifecycle. */
  readonly validationStatus: ValidationStatus | null | undefined;
  /** Phase 20G.2a split-status: settlement lifecycle. */
  readonly settlementStatus: SettlementStatus | null | undefined;
  /** SHA-256 hex of the source CSV row fingerprint. */
  readonly sourceConversionKey: string | null | undefined;
  /** FK to the immutable ingestion event (Shopee / Addlivetag). */
  readonly ingestionEventId: string | null | undefined;
  /** Persisted link-kind stamp from the ingestion layer (if any). */
  readonly persistedLinkKind?:
    | "unique"
    | "missing"
    | "owner_mismatch"
    | "order_id_collision"
    | "source_key_collision"
    | null;
  /**
   * The source-status evidence field populated by the ingestion
   * layer (e.g. Addlivetag normalised status, Shopee CSV status).
   * The mapper treats `null` / `undefined` / unknown values as
   * "no evidence" and refuses to advance.
   *
   * Phase 20K 4E3B: `"confirmed_invalid"` is RESERVED for a
   * future checkpoint that introduces an explicit allowlist of
   * business-invalid `failure_code` values. The current
   * ingestion layer has zero writers for any
   * `processing_status = 'failed'` row, and the persisted
   * `failure_code` column is unvalidated free-form text; the
   * loader therefore does NOT auto-emit
   * `sourceStatus = "confirmed_invalid"` from any persisted
   * state today (a `failed` ingestion event falls through to
   * the default `"unknown"` and produces a fail-closed skip).
   * Consumers constructing the snapshot directly (e.g. tests)
   * MAY still pass this value to exercise the reserved
   * mapper branch, but production paths MUST NOT.
   */
  readonly sourceStatus:
    | "confirmed_eligible"
    | "confirmed_invalid"
    | "cancelled"
    | "refunded"
    | "pending_source"
    | "unknown"
    | null
    | undefined;
}

export interface SourceEvidenceDecisionApply {
  readonly kind: "apply";
  readonly nextStatus: Exclude<ConversionStatus, "paid">;
  readonly reasonCode: SourceEvidenceReasonCode;
  readonly requiresNetwork: ReconciliationNetwork;
}

export interface SourceEvidenceDecisionSkip {
  readonly kind: "skip";
  readonly reasonCode: SourceEvidenceReasonCode;
}

export interface SourceEvidenceDecisionReject {
  readonly kind: "reject";
  readonly nextStatus: "rejected";
  readonly reasonCode: SourceEvidenceReasonCode;
}

export type SourceEvidenceDecision =
  | SourceEvidenceDecisionApply
  | SourceEvidenceDecisionReject
  | SourceEvidenceDecisionSkip;

export class SourceEvidenceError extends Error {
  constructor(
    public readonly reason:
      | "invalid_network"
      | "missing_source_conversion_key"
      | "missing_ingestion_event_id",
    message: string,
  ) {
    super(message);
    this.name = "SourceEvidenceError";
  }
}

/**
 * Fail-closed network classification. Only networks that have a
 * durable persisted provenance contract (see `docs/PHASE_20K_*`
 * provenance catalogue) are allowed. Phase 20K checkpoint 4A2B
 * removes `"manual"` from the allowlist because no ingestion
 * pipeline persists a manual-network conversion with
 * `(ingestion_event, source_conversion_key, csv row)` evidence
 * -- without that evidence the engine cannot verify provenance
 * and MUST refuse.
 */
function classifyNetwork(network: unknown): {
  readonly kind: "ok" | "unknown";
  readonly network?: ReconciliationNetwork;
} {
  if (network === "shopee") {
    return { kind: "ok", network };
  }
  return { kind: "unknown" };
}

function isTrue(value: unknown): boolean {
  return value === true;
}

/**
 * Map a single source-evidence snapshot to the single decision
 * the engine may plan. This is the authoritative source-evidence
 * gate: the repository calls this for every candidate it loads
 * from `reconciliation_run_candidates`.
 *
 * Rules (exhaustive):
 *
 *   1. Unknown network                -> skip  rejected_unknown_network
 *   2. Missing source key             -> skip  rejected_missing_source_key
 *   3. Missing ingestion event        -> skip  rejected_missing_ingestion_event
 *   4. persistedLinkKind owner_mismatch
 *                                    -> skip  rejected_attribution_owner_mismatch
 *   5. persistedLinkKind source_key_collision
 *                                    -> skip  rejected_attribution_source_key_collision
 *   6. persistedLinkKind order_id_collision
 *                                    -> skip  rejected_attribution_order_id_collision
 *   7. persistedLinkKind missing      -> skip  rejected_missing_provenance
 *   8. status = paid/rejected         -> skip  rejected_terminal_state
 *   9. status = pending:
 *        - source confirmed_eligible + persisted unique ->
 *            apply  pending -> approved
 *        - source cancelled / refunded ->
 *            reject pending -> rejected
 *        - source confirmed_invalid ->
 *            reject pending -> rejected
 *        - else ->
 *            skip  rejected_source_not_confirmed
 *  10. status = approved:
 *        - settlement_status = 'payable' + persisted unique ->
 *            apply  approved -> payable
 *        - settlement_status = 'not_payable' ->
 *            skip  rejected_settlement_not_payable
 *        - else ->
 *            skip  rejected_source_not_confirmed
 *   7. status = payable -> skip  rejected_paid_out_of_phase_20k_scope
 *   8. status = paid     -> skip  rejected_terminal_state
 *
 * The mapper NEVER produces `nextStatus = 'paid'`.
 */
export function mapSourceEvidenceToDecision(
  snapshot: SourceEvidenceSnapshot,
): SourceEvidenceDecision {
  const network = classifyNetwork(snapshot.network);
  if (network.kind === "unknown") {
    return { kind: "skip", reasonCode: "rejected_unknown_network" };
  }
  if (
    typeof snapshot.sourceConversionKey !== "string" ||
    snapshot.sourceConversionKey.trim().length === 0
  ) {
    return { kind: "skip", reasonCode: "rejected_missing_source_key" };
  }
  if (
    typeof snapshot.ingestionEventId !== "string" ||
    snapshot.ingestionEventId.trim().length === 0
  ) {
    return { kind: "skip", reasonCode: "rejected_missing_ingestion_event" };
  }
  if (snapshot.persistedLinkKind !== undefined && snapshot.persistedLinkKind !== null) {
    // Phase 20K checkpoint 4A2B -- each non-unique
    // persistedLinkKind produces a distinct closed reason code
    // so the audit trail distinguishes ownership mismatches
    // from collision-level conflicts.
    if (snapshot.persistedLinkKind === "owner_mismatch") {
      return {
        kind: "skip",
        reasonCode: "rejected_attribution_owner_mismatch",
      };
    }
    if (snapshot.persistedLinkKind === "source_key_collision") {
      return {
        kind: "skip",
        reasonCode: "rejected_attribution_source_key_collision",
      };
    }
    if (snapshot.persistedLinkKind === "order_id_collision") {
      return {
        kind: "skip",
        reasonCode: "rejected_attribution_order_id_collision",
      };
    }
    if (snapshot.persistedLinkKind === "missing") {
      return { kind: "skip", reasonCode: "rejected_missing_provenance" };
    }
    // Defensive: any other non-unique value falls through to the
    // generic missing-provenance reason so unknown link-kinds
    // never silently auto-approve.
    if (snapshot.persistedLinkKind !== "unique") {
      return { kind: "skip", reasonCode: "rejected_missing_provenance" };
    }
  }
  // Phase 20K follow-up 4 -- fail-closed on missing provenance.
  // An undefined/null `persistedLinkKind` is NO LONGER treated as
  // eligible: the only acceptable value is "unique". Every other
  // value (including the absence of the field) refuses the
  // transition with a typed skip reason.
  if (snapshot.persistedLinkKind !== "unique") {
    return { kind: "skip", reasonCode: "rejected_missing_provenance" };
  }

  if (
    snapshot.currentStatus === "paid" ||
    snapshot.currentStatus === "rejected"
  ) {
    return { kind: "skip", reasonCode: "rejected_terminal_state" };
  }
  if (snapshot.currentStatus === "payable") {
    return { kind: "skip", reasonCode: "rejected_paid_out_of_phase_20k_scope" };
  }

  if (snapshot.currentStatus === "pending") {
    if (snapshot.sourceStatus === "cancelled") {
      return {
        kind: "reject",
        nextStatus: "rejected",
        reasonCode: "rejected_source_cancelled",
      };
    }
    if (snapshot.sourceStatus === "refunded") {
      return {
        kind: "reject",
        nextStatus: "rejected",
        reasonCode: "rejected_source_refunded",
      };
    }
    if (snapshot.sourceStatus === "confirmed_invalid") {
      // Phase 20K 4E3B -- RESERVED mapper branch.
      // `sourceStatus === "confirmed_invalid"` is documented on
      // `SourceEvidenceSnapshot.sourceStatus` as a value no
      // production loader currently emits. The closed reason
      // code `rejected_source_invalid` is reserved for a future
      // checkpoint that introduces an explicit allowlist of
      // `failure_code` values meaning "the source explicitly
      // says the conversion is business-invalid". A future
      // checkpoint that wires that allowlist MUST change this
      // branch to read the allowlisted code (and only the
      // allowlisted code); the generic auto-classification
      // intentionally removed by Phase 20K 4E3B MUST NOT be
      // reintroduced.
      return {
        kind: "reject",
        nextStatus: "rejected",
        reasonCode: "rejected_source_invalid",
      };
    }
    if (
      snapshot.sourceStatus === "confirmed_eligible" &&
      isTrue(snapshot.persistedLinkKind === "unique" || snapshot.persistedLinkKind === undefined)
    ) {
      return {
        kind: "apply",
        nextStatus: "approved",
        reasonCode: "approved_eligible_by_source_confirmation",
        requiresNetwork: network.network!,
      };
    }
    if (
      snapshot.validationStatus === "approved" &&
      snapshot.sourceStatus !== "unknown" &&
      snapshot.sourceStatus !== "pending_source"
    ) {
      return {
        kind: "apply",
        nextStatus: "approved",
        reasonCode: "approved_eligible_by_match",
        requiresNetwork: network.network!,
      };
    }
    return { kind: "skip", reasonCode: "rejected_source_not_confirmed" };
  }

  if (snapshot.currentStatus === "approved") {
    // Phase 20K 4F1B -- HARD-BLOCK. The previous branch in
    // this position returned `{ kind: "apply", nextStatus:
    // "payable", reasonCode: "approved_eligible_by_match" }`
    // whenever `settlementStatus === "payable"`. That branch
    // required no independent upstream settlement evidence --
    // it read the column and emitted an apply. Phase 20K 4F1
    // proved no production writer populates
    // `settlement_status = 'payable'` from any durable
    // settlement producer; the only way to obtain that value
    // today is direct SQL admin mutation, which the task spec
    // explicitly excludes as evidence.
    //
    // Until a real upstream settlement producer exists, every
    // path that would advance `approved -> payable` is
    // HARD-BLOCKED. The mapper MUST NOT plan such a
    // transition; it must return a skip with the distinct
    // closed reason code `rejected_unverified_settlement_evi-
    // dence`. The `payable -> paid` prohibition at the
    // mapper's `currentStatus === "payable"` branch (which
    // returns `rejected_paid_out_of_phase_20k_scope`) is
    // preserved unchanged.
    //
    // A future checkpoint that introduces the real upstream
    // settlement producer MUST restore the apply branch here
    // (with a producer-bound, durable-evidence gate, not the
    // previous "column self-validates" trust), and the
    // commit-time defense-in-depth in
    // `reconciliation.repository.ts` will likewise flip from
    // refusal to allow.
    if (snapshot.settlementStatus === "payable") {
      return {
        kind: "skip",
        reasonCode: "rejected_unverified_settlement_evidence",
      };
    }
    if (snapshot.settlementStatus === "not_payable") {
      return {
        kind: "skip",
        reasonCode: "rejected_settlement_not_payable",
      };
    }
    return { kind: "skip", reasonCode: "rejected_source_not_confirmed" };
  }

  return { kind: "skip", reasonCode: "rejected_source_status_unknown" };
}
