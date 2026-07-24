/**
 * Phase 20K -- reconciliation reason codes.
 *
 * Closed enumeration of reason codes the engine attaches to every
 * reconciliation decision. Reason codes are stable strings
 * (machine-parseable, never localised, never changed once
 * published). They appear in the audit metadata so a downstream
 * analyst can group decisions without parsing freeform strings.
 *
 * Vietnamese admin copy that explains each reason code lives in
 * the admin page UI, NOT here. This module is the source of truth
 * for the canonical code; the UI is a separate layer that maps
 * code -> display label.
 */

export type ReconciliationReasonCode =
  | "approved_by_reconciliation"
  | "approved_eligible_by_match"
  | "approved_pending_source_confirmation"
  | "rejected_duplicate_source_key"
  | "rejected_duplicate_conversion"
  | "rejected_source_not_ready"
  | "rejected_attribution_invalid"
  | "rejected_negative_commission"
  | "rejected_missing_user"
  | "rejected_missing_click"
  | "rejected_ambiguous_match"
  | "rejected_canceled_by_source"
  | "rejected_missing_cashback_policy"
  | "rejected_invalid_cashback_policy"
  | "rejected_no_money_split"
  | "rejected_terminal_state"
  | "rejected_paid_out_of_phase_20k_scope"
  | "marked_payable_by_reconciliation"
  | "marked_paid_by_reconciliation";

export const RECONCILIATION_REASON_CODES: ReadonlyArray<ReconciliationReasonCode> =
  Object.freeze([
    "approved_by_reconciliation",
    "approved_eligible_by_match",
    "approved_pending_source_confirmation",
    "rejected_duplicate_source_key",
    "rejected_duplicate_conversion",
    "rejected_source_not_ready",
    "rejected_attribution_invalid",
    "rejected_negative_commission",
    "rejected_missing_user",
    "rejected_missing_click",
    "rejected_ambiguous_match",
    "rejected_canceled_by_source",
    "rejected_missing_cashback_policy",
    "rejected_invalid_cashback_policy",
    "rejected_no_money_split",
    "rejected_terminal_state",
    "rejected_paid_out_of_phase_20k_scope",
    "marked_payable_by_reconciliation",
    "marked_paid_by_reconciliation",
  ]);

export function isReconciliationReasonCode(
  value: unknown,
): value is ReconciliationReasonCode {
  return (
    typeof value === "string" &&
    (RECONCILIATION_REASON_CODES as ReadonlyArray<string>).includes(value)
  );
}
