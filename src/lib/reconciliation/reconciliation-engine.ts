/**
 * Phase 20K -- pure reconciliation engine.
 *
 * Given a snapshot of in-flight decisions (loaded from
 * `conversions` joined against `shopee_csv_rows` upstream of this
 * module), the engine returns a typed decision list that the
 * repository can apply inside a transaction.
 *
 * Pure by design: NO db / network / clock access. The repository
 * supplies the now() so every commit is reproducible from a
 * given timestamp.
 *
 * Decides, per staged row, a single next-step:
 *
 *   - `apply`: status transition with the appropriate reason code,
 *     ready to be written via `UPDATE conversions SET ...`.
 *   - `skip`: not actionable in this run (terminal status, source
 *     not ready, ambiguous match, etc.). The repository still
 *     records an audit entry when the reason is interesting.
 *
 * Decisions are derived strictly from the supplied snapshot. The
 * repository must re-read the row inside the transaction
 * (`FOR UPDATE`) before applying the decision; this module is a
 * planner, not an executor.
 */

import type { ConversionStatus } from "@/types/affiliate";

import { canTransition } from "./state-machine";
import {
  isCommissionSplitInvariant,
  MoneySplitError,
  splitCommissionFloor,
  type CommissionSplit,
} from "./money";
import type { ReconciliationReasonCode } from "./reason-codes";
import {
  buildReconciliationIdempotencyKey,
  type ReconciliationDecisionKind,
  type ReconciliationNetwork,
} from "./idempotency";

/**
 * A row-shaped snapshot of `conversions` + `shopee_csv_rows`. The
 * repository reads all of these fields via plain Drizzle queries;
 * the engine does not know how they were loaded.
 */
export interface ReconciliationConversionSnapshot {
  readonly conversionId: string;
  readonly network: "shopee" | "manual" | "tiktok";
  readonly sourceConversionKey: string | null;
  readonly status: ConversionStatus;
  readonly networkCommission: number;
  readonly cashbackShareBpsSnapshot: number | null;
  readonly userCashback: number;
  readonly platformProfit: number;
  readonly stagedRowId: string | null;
  readonly matchedUserId: string | null;
  readonly matchedClickId: string | null;
  readonly matchedPurchaseIntentId: string | null;
  readonly linkKind: "ambiguous" | "unique" | "unmatched" | "duplicate";
  readonly occurredAt: Date;
}

export interface ReconciliationDecisionApplied {
  readonly kind: "apply";
  readonly conversionId: string;
  readonly network: ReconciliationNetwork;
  readonly sourceConversionKey: string;
  readonly stagedRowId: string | null;
  readonly previousStatus: ConversionStatus;
  readonly nextStatus: ConversionStatus;
  readonly reasonCode: ReconciliationReasonCode;
  readonly humanReadableReason: string;
  readonly decisionKind: ReconciliationDecisionKind;
  readonly money: CommissionSplit;
  readonly idempotencyKey: string;
  readonly matchedUserId: string | null;
  readonly matchedClickId: string | null;
  readonly matchedPurchaseIntentId: string | null;
  readonly occurredAt: Date;
}

export interface ReconciliationDecisionSkipped {
  readonly kind: "skip";
  readonly conversionId: string;
  readonly stagedRowId: string | null;
  readonly currentStatus: ConversionStatus;
  readonly reasonCode: ReconciliationReasonCode;
  readonly humanReadableReason: string;
}

export type ReconciliationDecision =
  | ReconciliationDecisionApplied
  | ReconciliationDecisionSkipped;

export interface ReconciliationEngineSummary {
  readonly scannedRows: number;
  readonly applied: number;
  readonly skipped: number;
  readonly byReason: Readonly<Record<ReconciliationReasonCode, number>>;
  readonly totals: CommissionSplit;
}

const ZERO_SPLIT = Object.freeze({
  networkCommission: 0,
  userCashback: 0,
  platformProfit: 0,
  userCashbackBpsApplied: 0,
} as CommissionSplit);

function formatVnd(amount: number): string {
  if (amount === 0) return "0";
  const abs = Math.abs(amount);
  // VND is typed in plain thousands. We use '.' as the grouping
  // separator because that's the dominant Vietnamese convention
  // for admin summaries.
  const grouped = abs
    .toString()
    .split("")
    .reverse()
    .reduce<string[]>((acc, ch, idx) => {
      if (idx !== 0 && idx % 3 === 0) acc.push(".");
      acc.push(ch);
      return acc;
    }, [])
    .reverse()
    .join("");
  return (amount < 0 ? "-" : "") + grouped;
}

function genericSkipReason(
  code: ReconciliationReasonCode,
): string {
  switch (code) {
    case "rejected_terminal_state":
      return "Conversion is in a terminal status; no further reconciliation action is allowed.";
    case "rejected_source_not_ready":
      return "Staged source row is not ready for reconciliation yet.";
    case "rejected_missing_user":
      return "No matching buyer / publisher is attached to the staged conversion.";
    case "rejected_missing_click":
      return "No matching click record is attached to the staged conversion.";
    case "rejected_attribution_invalid":
      return "Source attribution did not pass the pure matcher; cannot approve.";
    case "rejected_ambiguous_match":
      return "Multiple click / purchase-intent candidates matched; the engine refuses to guess.";
    case "rejected_duplicate_source_key":
      return "Duplicate source_conversion_key already processed.";
    case "rejected_duplicate_conversion":
      return "Duplicate conversion already exists for this external order.";
    case "rejected_negative_commission":
      return "Network commission is negative; refusing to apply.";
    case "rejected_missing_cashback_policy":
      return "Cashback policy snapshot is missing; refusing to infer a default policy.";
    case "rejected_invalid_cashback_policy":
      return "Cashback policy snapshot is invalid; refusing to apply.";
    case "rejected_no_money_split":
      return "Money split failed invariant validation; refusing to apply.";
    case "rejected_canceled_by_source":
      return "Source status indicates a cancelled / refunded order.";
    case "approved_by_reconciliation":
    case "approved_eligible_by_match":
      return "Conversion matches attribution and is eligible for cashback.";
    case "approved_pending_source_confirmation":
      return "Conversion recorded; awaiting higher-confidence confirmation before approving.";
    case "marked_payable_by_reconciliation":
      return "Approved conversion is now eligible for settlement.";
    case "marked_paid_by_reconciliation":
      return "Payable conversion has been marked as paid by the reconciliation pass.";
    default:
      return "Reconciliation decision recorded.";
  }
}

function emptyReasonTally(): Record<ReconciliationReasonCode, number> {
  const tally = {} as Record<ReconciliationReasonCode, number>;
  for (const code of Object.keys({
    approved_by_reconciliation: 0,
    approved_eligible_by_match: 0,
    approved_pending_source_confirmation: 0,
    rejected_duplicate_source_key: 0,
    rejected_duplicate_conversion: 0,
    rejected_source_not_ready: 0,
    rejected_attribution_invalid: 0,
    rejected_negative_commission: 0,
    rejected_missing_user: 0,
    rejected_missing_click: 0,
    rejected_ambiguous_match: 0,
    rejected_canceled_by_source: 0,
    rejected_missing_cashback_policy: 0,
    rejected_invalid_cashback_policy: 0,
    rejected_no_money_split: 0,
    rejected_terminal_state: 0,
    rejected_paid_out_of_phase_20k_scope: 0,
    marked_payable_by_reconciliation: 0,
    marked_paid_by_reconciliation: 0,
  }) as ReconciliationReasonCode[]) {
    tally[code] = 0;
  }
  return tally;
}

/**
 * Plan a single round of reconciliation decisions. The function
 * is deterministic; running it twice on the same snapshot list
 * produces the same output list (modulo the caller's sort).
 */
export function planReconciliationDecisions(
  snapshot: ReadonlyArray<ReconciliationConversionSnapshot>,
): ReadonlyArray<ReconciliationDecision> {
  const decisions: ReconciliationDecision[] = [];
  for (const row of snapshot) {
    decisions.push(planOne(row));
  }
  return decisions;
}

function planOne(
  row: ReconciliationConversionSnapshot,
): ReconciliationDecision {
  // Defensive: terminal states skip, never apply.
  if (row.status === "paid" || row.status === "rejected") {
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode: "rejected_terminal_state",
      humanReadableReason: genericSkipReason("rejected_terminal_state"),
    };
  }

  // Money invariants. The engine refuses to advance any decision
  // that does not satisfy the invariant. We trust the schema's
  // `bigint` typing here; if a malformed row slipped through we
  // still bail closed.
  let money: CommissionSplit;
  try {
    money = splitCommissionFloor(
      row.networkCommission,
      row.cashbackShareBpsSnapshot,
    );
  } catch (error) {
    const policyReason =
      error instanceof MoneySplitError && error.reason === "missing_bps"
        ? "rejected_missing_cashback_policy"
        : error instanceof MoneySplitError &&
            (error.reason === "non_finite_bps" ||
              error.reason === "non_integer_bps" ||
              error.reason === "bps_out_of_range")
          ? "rejected_invalid_cashback_policy"
          : "rejected_negative_commission";
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode: policyReason,
      humanReadableReason: genericSkipReason(policyReason),
    };
  }
  if (
    money.networkCommission !== row.networkCommission ||
    money.userCashback !== row.userCashback ||
    money.platformProfit !== row.platformProfit
  ) {
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode: "rejected_no_money_split",
      humanReadableReason: genericSkipReason("rejected_no_money_split"),
    };
  }
  if (!isCommissionSplitInvariant(money)) {
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode: "rejected_no_money_split",
      humanReadableReason: genericSkipReason("rejected_no_money_split"),
    };
  }

  // Source-key presence gate.
  if (
    typeof row.sourceConversionKey !== "string" ||
    row.sourceConversionKey.length === 0
  ) {
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode: "rejected_duplicate_source_key",
      humanReadableReason: genericSkipReason("rejected_duplicate_source_key"),
    };
  }

  // Match gate.
  if (row.linkKind === "unmatched") {
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode:
        row.matchedUserId === null
          ? "rejected_missing_user"
          : "rejected_missing_click",
      humanReadableReason: genericSkipReason(
        row.matchedUserId === null
          ? "rejected_missing_user"
          : "rejected_missing_click",
      ),
    };
  }
  if (row.linkKind === "ambiguous") {
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode: "rejected_ambiguous_match",
      humanReadableReason: genericSkipReason("rejected_ambiguous_match"),
    };
  }
  if (row.linkKind === "duplicate") {
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode: "rejected_duplicate_conversion",
      humanReadableReason: genericSkipReason("rejected_duplicate_conversion"),
    };
  }

  // Decide next status from current. The state machine table
  // caps us at one forward step per pass.
  //
  // Phase 20K hard rule: we never plan a `payable -> paid`
  // transition. Marking a conversion `paid` requires the future
  // settlement / payout pipeline (Phase 20K+). The application
  // guard here is the authoritative refusal; the
  // `reconciliation_audit_events_no_paid_by_phase_20k_check` DB
  // CHECK is defense in depth.
  let proposedNext: ConversionStatus;
  if (row.status === "pending") {
    proposedNext = "approved";
  } else if (row.status === "approved") {
    proposedNext = "payable";
  } else {
    // `paid`, `rejected`, `payable` all collapse to "no forward
    // step in Phase 20K". `payable` is the explicit refusal of
    // the `payable -> paid` transition (payout pipeline only).
    proposedNext = row.status;
  }

  // Phase 20K hard rule: even if the state machine permits
  // `payable -> paid`, the engine refuses to plan that
  // transition. `payable` rows stay skipped with a Phase 20K-
  // specific reason code so the admin UI can show the contract
  // instead of producing an audit row the schema refuses.
  if (row.status === "payable") {
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode: "rejected_paid_out_of_phase_20k_scope",
      humanReadableReason:
        "Chuyển sang 'paid' yêu cầu quy trình chi trả (Phase 20K+). Phase 20K không xử lý chi trả, không ghi vào ví người dùng, không đánh dấu paid.",
    };
  }

  if (!canTransition(row.status, proposedNext)) {
    // Should be unreachable given the terminal-state guard above,
    // but we keep the explicit refusal so a future schema migration
    // cannot silently introduce a status the engine does not know.
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode: "rejected_terminal_state",
      humanReadableReason: genericSkipReason("rejected_terminal_state"),
    };
  }

  const decisionKind: ReconciliationDecisionKind =
    proposedNext === "approved"
      ? "approve"
      : proposedNext === "payable"
        ? "mark_payable"
        : "reject";

  let reasonCode: ReconciliationReasonCode;
  switch (proposedNext) {
    case "approved":
      reasonCode = "approved_eligible_by_match";
      break;
    case "payable":
      reasonCode = "marked_payable_by_reconciliation";
      break;
    default:
      // Unreachable: `proposedNext` is typed as
      // `'approved' | 'payable' | ConversionStatus` (current
      // status). The earlier `payable -> paid is out of Phase 20K
      // scope` short-circuit and the `canTransition` guard below
      // ensure we only ever reach the switch with a real forward
      // step. The default catches the "current === proposedNext"
      // edge case (e.g. `payable` slipping past the early
      // short-circuit).
      reasonCode = "rejected_terminal_state";
      break;
  }

  const humanReadableReason =
    genericSkipReason(reasonCode) +
    " Phân bổ tiền: tổng hoa hồng mạng " +
    formatVnd(money.networkCommission) +
    "đ; tiền hoàn người dùng " +
    formatVnd(money.userCashback) +
    "đ; lợi nhuận nền tảng " +
    formatVnd(money.platformProfit) +
    "đ.";

  // Network guard: TikTok and any non-{shopee,manual} networks are
  // explicitly not eligible for `apply` even when they pass every
  // other gate. The state machine never advances them; this is
  // defense in depth so a future network enum cannot accidentally
  // be marked approved / payable / paid.
  if (row.network !== "shopee" && row.network !== "manual") {
    return {
      kind: "skip",
      conversionId: row.conversionId,
      stagedRowId: row.stagedRowId,
      currentStatus: row.status,
      reasonCode: "rejected_attribution_invalid",
      humanReadableReason: genericSkipReason("rejected_attribution_invalid"),
    };
  }

  return {
    kind: "apply",
    conversionId: row.conversionId,
    network: row.network,
    sourceConversionKey: row.sourceConversionKey,
    stagedRowId: row.stagedRowId,
    previousStatus: row.status,
    nextStatus: proposedNext,
    reasonCode,
    humanReadableReason,
    decisionKind,
    money,
    idempotencyKey: buildReconciliationIdempotencyKey({
      network: row.network,
      sourceConversionKey: row.sourceConversionKey,
      previousStatus: row.status,
      nextStatus: proposedNext,
      decision: decisionKind,
    }),
    matchedUserId: row.matchedUserId,
    matchedClickId: row.matchedClickId,
    matchedPurchaseIntentId: row.matchedPurchaseIntentId,
    occurredAt: row.occurredAt,
  };
}

/**
 * Aggregate the decision list into a small summary suitable for
 * the admin UI. Pure: sum of networkCommission, userCashback,
 * platformProfit across `apply` decisions. `skip` decisions do
 * NOT contribute.
 */
export function summariseDecisions(
  decisions: ReadonlyArray<ReconciliationDecision>,
): ReconciliationEngineSummary {
  const byReason = emptyReasonTally();
  let applied = 0;
  let skipped = 0;
  let networkCommission = 0;
  let userCashback = 0;
  let platformProfit = 0;
  for (const decision of decisions) {
    byReason[decision.reasonCode] += 1;
    if (decision.kind === "apply") {
      applied += 1;
      networkCommission += decision.money.networkCommission;
      userCashback += decision.money.userCashback;
      platformProfit += decision.money.platformProfit;
    } else {
      skipped += 1;
    }
  }
  const totals: CommissionSplit = {
    networkCommission,
    userCashback,
    platformProfit,
    userCashbackBpsApplied: ZERO_SPLIT.userCashbackBpsApplied,
  };
  return {
    scannedRows: decisions.length,
    applied,
    skipped,
    byReason,
    totals,
  };
}

export const FORMAT_HELPERS_FOR_TESTING = Object.freeze({ formatVnd });
