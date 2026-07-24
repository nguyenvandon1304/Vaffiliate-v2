/**
 * Phase 20K follow-up 2 -- reconciliation action state.
 *
 * Sibling module to `actions.ts` for the same `"use server"` reason
 * documented in Phase 20J: Next.js forbids exporting non-async
 * values from a `"use server"` file. The discriminated-union
 * response type and the initial-state constant live here so the
 * client form can import them without tripping the bundler.
 */

export interface ReconciliationAppliedRow {
  readonly conversionId: string;
  readonly previousStatus: string;
  readonly nextStatus: string;
  readonly reasonCode: string;
  readonly networkCommission: number;
  readonly userCashback: number;
  readonly platformProfit: number;
  readonly idempotencyKeyShort: string;
}

export interface ReconciliationSkippedRow {
  readonly conversionId: string;
  readonly reasonCode: string;
  readonly idempotentReplay?: boolean;
}

export interface ReconciliationSummary {
  readonly scannedRows: number;
  readonly applied: number;
  readonly skipped: number;
  readonly reject: number;
  readonly totals: {
    readonly networkCommission: number;
    readonly userCashback: number;
    readonly platformProfit: number;
  };
}

export type RunReconciliationActionState =
  | {
      readonly ok: true;
      readonly mode: "dry_run" | "commit";
      readonly network: "shopee" | "manual";
      readonly reconciliationRunId: string;
      readonly summary: ReconciliationSummary;
      readonly applied: ReadonlyArray<ReconciliationAppliedRow>;
      readonly skipped: ReadonlyArray<ReconciliationSkippedRow>;
      readonly committedAt: string;
      readonly scannedRowCount: number;
      readonly sampleDecisions: ReadonlyArray<{
        readonly kind: string;
        readonly reasonCode: string;
      }>;
    }
  | { readonly ok: false; readonly message: string };

export const INITIAL_RUN_RECONCILIATION_ACTION_STATE: RunReconciliationActionState =
  { ok: false, message: "" };