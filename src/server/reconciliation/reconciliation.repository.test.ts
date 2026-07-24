/**
 * Phase 20K -- pure parser / status helpers for the reconciliation
 * repository.
 *
 * Pure helpers and the public async repository paths are tested here. The
 * async tests use a scripted Drizzle executor, so no database socket or
 * credential is involved.
 */

import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";

import {
  assertAuditIdentifierResults,
  assertCandidateIdentifierResults,
  assertReconciliationIdentifierResult,
  ReconciliationIdentifierPlanError,
  resolveCommitReconciliationIdentifierPlan,
  resolveDryRunReconciliationIdentifierPlan,
  validateCommitReconciliationIdentifierPlan,
  validateDryRunReconciliationIdentifierPlan,
  createScriptedReconciliationHarness as createUncheckedScriptedReconciliationHarness,
  type ExternalCommittedMutationInput,
  type ScriptedSqlStep,
  type StateBackedSelectKind,
  parseStatus,
  parseCommission,
} from "./reconciliation.repository.test-helpers";
import {
  commitReconciliationAsync,
  dryRunReconciliationAsync,
  type ReconciliationExecutor,
} from "./reconciliation.repository";
import { buildReconciliationAdminActor } from "@/lib/reconciliation/actor";
import { buildProvenanceFingerprint } from "@/lib/reconciliation/run-scope";

const RUN_ID = "10000000-0000-4000-8000-000000000001";
const CONVERSION_A_ID = "10000000-0000-4000-8000-000000000002";
const CONVERSION_B_ID = "10000000-0000-4000-8000-000000000003";
const CANDIDATE_A_ID = "10000000-0000-4000-8000-000000000004";
const CANDIDATE_B_ID = "10000000-0000-4000-8000-000000000005";
const AUDIT_A_ID = "10000000-0000-4000-8000-000000000006";
const AUDIT_B_ID = "10000000-0000-4000-8000-000000000007";
const AUDIT_B_RETRY_ID = "10000000-0000-4000-8000-00000000000a";
const ACTOR_ID = "10000000-0000-4000-8000-000000000008";
const INGESTION_ID = "10000000-0000-4000-8000-000000000009";
const SOURCE_A = "a".repeat(64);
const SOURCE_B = "b".repeat(64);
const IDEMPOTENCY_A = "c".repeat(64);
const IDEMPOTENCY_B = "d".repeat(64);
const INITIAL_AT = "2025-01-01T00:00:00.000Z";
const CONCURRENT_AT = "2025-01-01T00:01:00.000Z";

function isTimestamp(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

const BASE_RUN_SEED = Object.freeze({
  id: RUN_ID,
  network: "shopee",
  created_by_user_id: ACTOR_ID,
  created_by_role: "admin",
  policy_version: 1,
  candidate_fingerprint: "candidate-fingerprint",
  scope: Object.freeze({ sourceConversionKeys: Object.freeze([SOURCE_A]) }),
  scope_candidate_count: 1,
  status: "draft",
  failed_at: null,
  failed_reason: null,
  created_at: INITIAL_AT,
  committed_at: null,
});
const TWO_CANDIDATE_RUN_SEED = Object.freeze({
  ...BASE_RUN_SEED,
  scope: Object.freeze({ sourceConversionKeys: Object.freeze([SOURCE_A, SOURCE_B]) }),
  scope_candidate_count: 2,
});

function candidateSeed(candidate: Record<string, unknown>) {
  return Object.freeze({
    id: candidate.id,
    run_id: RUN_ID,
    conversion_id: candidate.conversion_id,
    source_conversion_key: candidate.source_conversion_key,
    network: candidate.network,
    expected_previous_status: candidate.expected_previous_status,
    intended_next_status: candidate.intended_next_status,
    planned_reason_code: candidate.planned_reason_code,
    planned_money_network_commission: Number(candidate.planned_money_network_commission),
    planned_cashback_share_bps: Number(candidate.planned_cashback_share_bps),
    planned_money_user_cashback: Number(candidate.planned_money_user_cashback),
    planned_money_platform_profit: Number(candidate.planned_money_platform_profit),
    planned_idempotency_key: candidate.planned_idempotency_key,
    provenance_fingerprint: candidate.provenance_fingerprint,
    processing_outcome: "pending",
    processing_completed_at: null,
    processing_reason_code: null,
    created_at: INITIAL_AT,
  });
}

function conversionSeed(conversion: Record<string, unknown>, externalOrderId: string) {
  return Object.freeze({
    id: conversion.id,
    network: conversion.network,
    external_order_id: externalOrderId,
    publisher_id: conversion.publisher_id,
    advertiser_id: "adv-a",
    campaign_id: "cmp-a",
    offer_id: "off-a",
    tracking_link_id: conversion.tracking_link_id,
    status: conversion.status,
    order_amount: 2000,
    network_commission: Number(conversion.network_commission),
    cashback_share_bps_snapshot: Number(
      conversion.cashback_share_bps_snapshot,
    ),
    user_cashback: Number(conversion.user_cashback),
    platform_profit: Number(conversion.platform_profit),
    occurred_at: conversion.occurred_at,
    approved_at: null,
    payable_at: null,
    paid_at: null,
    rejected_at: null,
    rejected_reason: null,
    source_conversion_key: conversion.source_conversion_key,
    validation_status: conversion.validation_status,
    settlement_status: conversion.settlement_status,
    ingestion_event_id: conversion.ingestion_event_id,
    created_at: INITIAL_AT,
    updated_at: INITIAL_AT,
  });
}

function auditSeed(args: {
  readonly id: string;
  readonly candidate?: Record<string, unknown>;
}) {
  const candidate = args.candidate ?? BASE_COMMIT_CANDIDATE;
  return Object.freeze({
    id: args.id,
    network: "shopee",
    source_conversion_key: candidate.source_conversion_key,
    idempotency_key: candidate.planned_idempotency_key,
    conversion_id: candidate.conversion_id,
    previous_status: candidate.expected_previous_status,
    next_status: candidate.intended_next_status,
    decision: candidate.intended_next_status === "approved" ? "approve" : "reject",
    reason_code: candidate.planned_reason_code,
    human_reason: candidate.planned_reason_code,
    network_commission: Number(candidate.planned_money_network_commission),
    cashback_share_bps_snapshot: Number(
      candidate.planned_cashback_share_bps,
    ),
    user_cashback: Number(candidate.planned_money_user_cashback),
    platform_profit: Number(candidate.planned_money_platform_profit),
    actor_kind: "admin",
    actor_user_id: ACTOR_ID,
    actor_role: "admin",
    reconciliation_run_id: RUN_ID,
    run_candidate_id: candidate.id,
    created_at: INITIAL_AT,
  });
}

function sourceEvidenceSeed(evidence: Record<string, unknown>) {
  return Object.freeze({
    conversion_id: evidence.conversion_id,
    processing_status: evidence.processing_status,
    csv_source: evidence.csv_source,
    csv_order_status: evidence.csv_order_status,
    publisher_exists: evidence.publisher_exists,
    tracking_link_exists: evidence.tracking_link_exists,
    tracking_link_publisher_match: evidence.tracking_link_publisher_match,
    external_order_collision_count: evidence.external_order_collision_count,
    source_conversion_key_collision_count:
      evidence.source_conversion_key_collision_count,
  });
}

function baseSeedRows() {
  return [
    { relation: "reconciliation_runs" as const, primaryKey: RUN_ID, row: BASE_RUN_SEED },
    {
      relation: "reconciliation_run_candidates" as const,
      primaryKey: CANDIDATE_A_ID,
      row: candidateSeed(BASE_COMMIT_CANDIDATE),
    },
    {
      relation: "conversions" as const,
      primaryKey: CONVERSION_A_ID,
      row: conversionSeed(BASE_LOCKED_CONVERSION, "order-a"),
    },
    {
      relation: "source_evidence" as const,
      primaryKey: CONVERSION_A_ID,
      row: sourceEvidenceSeed(BASE_SOURCE_EVIDENCE),
    },
  ];
}

function twoCandidateSeedRows() {
  return [
    ...baseSeedRows().map((seed) =>
      seed.relation === "reconciliation_runs"
        ? { ...seed, row: TWO_CANDIDATE_RUN_SEED }
        : seed,
    ),
    {
      relation: "reconciliation_run_candidates" as const,
      primaryKey: CANDIDATE_B_ID,
      row: candidateSeed(BASE_COMMIT_CANDIDATE_B),
    },
    {
      relation: "conversions" as const,
      primaryKey: CONVERSION_B_ID,
      row: conversionSeed(BASE_LOCKED_CONVERSION_B, "order-b"),
    },
    {
      relation: "source_evidence" as const,
      primaryKey: CONVERSION_B_ID,
      row: sourceEvidenceSeed(BASE_SOURCE_EVIDENCE_B),
    },
  ];
}

function seedRowsWithCandidateA(candidate: Record<string, unknown>) {
  return baseSeedRows().map((seed) =>
    seed.relation === "reconciliation_run_candidates" &&
    seed.primaryKey === CANDIDATE_A_ID
      ? { ...seed, row: candidateSeed(candidate) }
      : seed,
  );
}

function assertFullRowEqual(
  actual: Readonly<Record<string, unknown>> | undefined,
  expected: Readonly<Record<string, unknown>>,
): void {
  assert.deepEqual(
    JSON.parse(JSON.stringify(actual)),
    JSON.parse(JSON.stringify(expected)),
  );
}

const activeHarnesses: Array<
  ReturnType<typeof createUncheckedScriptedReconciliationHarness>
> = [];

function createScriptedReconciliationHarness(
  steps: Parameters<typeof createUncheckedScriptedReconciliationHarness>[0],
  options?: Parameters<typeof createUncheckedScriptedReconciliationHarness>[1],
) {
  const harness = createUncheckedScriptedReconciliationHarness(steps, {
    seedRows: options?.seedRows ?? baseSeedRows(),
  });
  activeHarnesses.push(harness);
  return harness;
}

afterEach(() => {
  for (const harness of activeHarnesses.splice(0)) {
    harness.assertComplete();
  }
});

function hasIdentifierError(code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof ReconciliationIdentifierPlanError && error.code === code;
}

const BASE_COMMIT_CANDIDATE = Object.freeze({
  id: CANDIDATE_A_ID,
  conversion_id: CONVERSION_A_ID,
  network: "shopee",
  source_conversion_key: SOURCE_A,
  expected_previous_status: "pending",
  intended_next_status: "approved",
  planned_reason_code: "approved_eligible_by_match",
  planned_money_network_commission: "1000",
  planned_cashback_share_bps: 6000,
  planned_money_user_cashback: "600",
  planned_money_platform_profit: "400",
  planned_idempotency_key: IDEMPOTENCY_A,
  provenance_fingerprint: buildProvenanceFingerprint(
    {
      network: "shopee",
      currentStatus: "pending",
      validationStatus: "approved",
      settlementStatus: "not_payable",
      sourceConversionKey: SOURCE_A,
      ingestionEventId: INGESTION_ID,
      persistedLinkKind: "unique",
      sourceStatus: "confirmed_eligible",
    },
    IDEMPOTENCY_A,
    6000,
  ),
  processing_outcome: "pending",
});

const BASE_LOCKED_CONVERSION = Object.freeze({
  id: CONVERSION_A_ID,
  status: "pending",
  network: "shopee",
  network_commission: "1000",
  cashback_share_bps_snapshot: 6000,
  user_cashback: "600",
  platform_profit: "400",
  validation_status: "approved",
  settlement_status: "not_payable",
  source_conversion_key: SOURCE_A,
  ingestion_event_id: INGESTION_ID,
  publisher_id: ACTOR_ID,
  tracking_link_id: "tracking-a",
  occurred_at: new Date(0).toISOString(),
});

const BASE_SOURCE_EVIDENCE = Object.freeze({
  conversion_id: CONVERSION_A_ID,
  network: "shopee",
  external_order_id: "order-a",
  source_conversion_key: SOURCE_A,
  publisher_id: ACTOR_ID,
  tracking_link_id: "tracking-a",
  validation_status: "approved",
  settlement_status: "not_payable",
  processing_status: "succeeded",
  csv_source: "manual_csv",
  csv_order_status: "COMPLETED",
  publisher_exists: true,
  tracking_link_exists: true,
  tracking_link_publisher_match: true,
  external_order_collision_count: 1,
  source_conversion_key_collision_count: 1,
});

const BASE_COMMIT_CANDIDATE_B = Object.freeze({
  ...BASE_COMMIT_CANDIDATE,
  id: CANDIDATE_B_ID,
  conversion_id: CONVERSION_B_ID,
  source_conversion_key: SOURCE_B,
  planned_idempotency_key: IDEMPOTENCY_B,
  provenance_fingerprint: buildProvenanceFingerprint(
    {
      network: "shopee",
      currentStatus: "pending",
      validationStatus: "approved",
      settlementStatus: "not_payable",
      sourceConversionKey: SOURCE_B,
      ingestionEventId: INGESTION_ID,
      persistedLinkKind: "unique",
      sourceStatus: "confirmed_eligible",
    },
    IDEMPOTENCY_B,
    6000,
  ),
});

const BASE_LOCKED_CONVERSION_B = Object.freeze({
  ...BASE_LOCKED_CONVERSION,
  id: CONVERSION_B_ID,
  source_conversion_key: SOURCE_B,
});

const BASE_SOURCE_EVIDENCE_B = Object.freeze({
  ...BASE_SOURCE_EVIDENCE,
  conversion_id: CONVERSION_B_ID,
  external_order_id: "order-b",
  source_conversion_key: SOURCE_B,
});

function commitInput(auditEvents: readonly {
  readonly runCandidateId: string;
  readonly auditEventId: string;
}[]) {
  return {
    actorUserId: ACTOR_ID,
    actorRole: "admin" as const,
    reconciliationRunId: RUN_ID,
    identifierPlan: { auditEvents },
  };
}

function runUpdateStep(args: {
  readonly status: "committing" | "committed" | "failed";
  readonly affectedRows?: number;
  readonly returning?: boolean;
  readonly error?: Error;
  readonly errorAfterMutation?: Error;
  readonly expectedReason?: string;
  readonly concurrentStatus?: "committed" | "failed";
}): ScriptedSqlStep {
  const affectedRows = args.affectedRows ?? 1;
  const returning = args.returning ?? true;
  return {
    match: new RegExp(
      "^\\s*UPDATE reconciliation_runs[\\s\\S]*SET status = '" +
        args.status +
        "'[\\s\\S]*WHERE id = [\\s\\S]*RETURNING id",
      "i",
    ),
    dml: {
      operation: "update",
      relation: "reconciliation_runs",
      primaryKey: RUN_ID,
      affectedRows,
      returnedRows:
        returning && affectedRows === 1 ? [{ id: RUN_ID }] : [],
      expectedFields: {
        status: args.status,
        ...(args.status === "committing"
          ? { failed_at: null, failed_reason: null }
          : {}),
        ...(args.expectedReason ? { failed_reason: args.expectedReason } : {}),
      },
      expectedFieldPredicates:
        args.status === "committed"
          ? { committed_at: isTimestamp }
          : args.status === "failed"
            ? { failed_at: isTimestamp }
            : undefined,
      expectedParameterValues: [RUN_ID],
    },
    ...(args.error ? { error: args.error } : {}),
    ...(args.errorAfterMutation
      ? { errorAfterMutation: args.errorAfterMutation }
      : {}),
    ...(args.concurrentStatus
      ? {
          externalMutationsAfter: [{
            operation: "update" as const,
            relation: "reconciliation_runs" as const,
            primaryKey: RUN_ID,
            fields: args.concurrentStatus === "committed"
              ? { status: "committed", committed_at: CONCURRENT_AT }
              : {
                  status: "failed",
                  failed_at: CONCURRENT_AT,
                  failed_reason: "concurrent_finalization_failure",
                },
          }],
        }
      : {}),
  };
}

function runNonReturningUpdateStep(args: {
  readonly status: "failed";
  readonly reason?: string;
  readonly affectedRows?: number;
}): ScriptedSqlStep {
  return {
    match: /^\s*UPDATE reconciliation_runs[\s\S]*SET status = 'failed'[\s\S]*WHERE id =/i,
    dml: {
      operation: "update",
      relation: "reconciliation_runs",
      primaryKey: RUN_ID,
      affectedRows: args.affectedRows ?? 1,
      returnedRows: [],
      expectedFields: {
        status: args.status,
        ...(args.reason ? { failed_reason: args.reason } : {}),
      },
      expectedFieldPredicates: {
        failed_at: isTimestamp,
        ...(args.reason ? {} : { failed_reason: (value) => typeof value === "string" }),
      },
      expectedParameterValues: [RUN_ID],
    },
  };
}

function candidateOutcomeStep(args: {
  readonly candidateId: string;
  readonly outcome: string;
  readonly reason: string;
  readonly affectedRows?: number;
  readonly error?: Error;
}): ScriptedSqlStep {
  return {
    match: new RegExp(
      "^\\s*UPDATE reconciliation_run_candidates[\\s\\S]*processing_outcome = '" +
        args.outcome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "'[\\s\\S]*WHERE id =",
      "i",
    ),
    dml: {
      operation: "update",
      relation: "reconciliation_run_candidates",
      primaryKey: args.candidateId,
      affectedRows: args.error ? 0 : (args.affectedRows ?? 1),
      returnedRows: [],
      expectedFields: {
        processing_outcome: args.outcome,
        processing_reason_code: args.reason,
      },
      expectedFieldPredicates: { processing_completed_at: isTimestamp },
      expectedParameterValues: [args.candidateId],
    },
    ...(args.error ? { error: args.error } : {}),
  };
}

function auditInsertStep(args: {
  readonly auditId: string;
  readonly candidate?: Record<string, unknown>;
  readonly explicitId?: boolean;
  readonly affectedRows?: number;
}): ScriptedSqlStep {
  const candidate = args.candidate ?? BASE_COMMIT_CANDIDATE;
  const explicitId = args.explicitId ?? true;
  const affectedRows = args.affectedRows ?? 1;
  const nextStatus = String(candidate.intended_next_status);
  const previousStatus = String(candidate.expected_previous_status);
  const reason = String(candidate.planned_reason_code);
  return {
    match: explicitId
      ? /^\s*INSERT INTO reconciliation_audit_events\s*\(\s*id\s*,/i
      : /^\s*INSERT INTO reconciliation_audit_events\s*\(\s*network\s*,/i,
    dml: {
      operation: "insert",
      relation: "reconciliation_audit_events",
      primaryKey: args.auditId,
      affectedRows,
      returnedRows: affectedRows === 1 ? [{ id: args.auditId }] : [],
      expectedFields: {
        ...(explicitId ? { id: args.auditId } : {}),
        network: "shopee",
        source_conversion_key: candidate.source_conversion_key,
        idempotency_key: candidate.planned_idempotency_key,
        conversion_id: candidate.conversion_id,
        previous_status: previousStatus,
        next_status: nextStatus,
        decision: nextStatus === "approved" ? "approve" : "reject",
        reason_code: reason,
        human_reason: reason,
        network_commission: Number(candidate.planned_money_network_commission),
        cashback_share_bps_snapshot: Number(
          candidate.planned_cashback_share_bps,
        ),
        user_cashback: Number(candidate.planned_money_user_cashback),
        platform_profit: Number(candidate.planned_money_platform_profit),
        actor_kind: "admin",
        actor_user_id: ACTOR_ID,
        actor_role: "admin",
        reconciliation_run_id: RUN_ID,
        run_candidate_id: candidate.id,
      },
      expectedParameterValues: [
        candidate.conversion_id,
        candidate.id,
        RUN_ID,
        ...(explicitId ? [args.auditId] : []),
      ],
    },
  };
}

function conversionUpdateStep(args: {
  readonly candidate?: Record<string, unknown>;
  readonly affectedRows?: number;
}): ScriptedSqlStep {
  const candidate = args.candidate ?? BASE_COMMIT_CANDIDATE;
  const affectedRows = args.affectedRows ?? 1;
  return {
    match: /^\s*update "conversions"[\s\S]*where/i,
    method: "all",
    dml: {
      operation: "update",
      relation: "conversions",
      primaryKey: String(candidate.conversion_id),
      affectedRows,
      returnedRows:
        affectedRows === 1 ? [{ id: String(candidate.conversion_id) }] : [],
      expectedFields: {
        status: candidate.intended_next_status,
        network_commission: Number(candidate.planned_money_network_commission),
        cashback_share_bps_snapshot: Number(
          candidate.planned_cashback_share_bps,
        ),
        user_cashback: Number(candidate.planned_money_user_cashback),
        platform_profit: Number(candidate.planned_money_platform_profit),
        ...(candidate.intended_next_status === "rejected"
          ? { rejected_reason: candidate.planned_reason_code }
          : {}),
      },
      expectedFieldPredicates: {
        updated_at: isTimestamp,
        ...(candidate.intended_next_status === "approved"
          ? { approved_at: isTimestamp }
          : candidate.intended_next_status === "rejected"
            ? { rejected_at: isTimestamp }
            : {}),
      },
      expectedParameterValues: [candidate.conversion_id],
    },
  };
}

function unmodeledInsertStep(args: {
  readonly relation: "reconciliation_runs" | "reconciliation_run_candidates";
  readonly primaryKeys: readonly string[];
  readonly returnedRows?: readonly unknown[];
}): ScriptedSqlStep {
  return {
    match: new RegExp('^\\s*insert into "' + args.relation + '"', "i"),
    dml: {
      operation: "insert",
      relation: args.relation,
      primaryKeys: args.primaryKeys,
      affectedRows: args.primaryKeys.length,
      returnedRows: args.returnedRows ?? [],
      expectedParameterValues: args.primaryKeys,
      model: false,
    },
  };
}

function stateProjectionStep(args: {
  readonly match: RegExp;
  readonly kind: StateBackedSelectKind;
  readonly identity: string | readonly string[];
  readonly expectedKeys?: readonly string[];
  readonly externalMutationsBefore?: readonly ExternalCommittedMutationInput[];
  readonly externalMutationsAfter?: readonly ExternalCommittedMutationInput[];
}): ScriptedSqlStep {
  return {
    match: args.match,
    stateSelect: {
      kind: args.kind,
      identity: args.identity,
      expectedKeys: args.expectedKeys,
    },
    externalMutationsBefore: args.externalMutationsBefore,
    externalMutationsAfter: args.externalMutationsAfter,
  };
}

function commitReadSteps(args?: {
  readonly runStatus?: string;
  readonly candidate?: Record<string, unknown>;
  readonly conversionRows?: readonly Record<string, unknown>[];
  readonly claimRows?: readonly Record<string, unknown>[];
  readonly evidenceRows?: readonly Record<string, unknown>[];
}) {
  const candidate = args?.candidate ?? BASE_COMMIT_CANDIDATE;
  const runStatus = args?.runStatus ?? "draft";
  const steps = [
    {
      match: /FROM reconciliation_runs[\s\S]*FOR UPDATE/i,
      rows: [
        {
          id: RUN_ID,
          network: "shopee",
          status: runStatus,
          policy_version: 1,
        },
      ],
    },
    {
      match: /FROM reconciliation_run_candidates[\s\S]*FOR UPDATE/i,
      rows: [candidate],
    },
  ];
  if (
    runStatus !== "committed" &&
    runStatus !== "committing" &&
    candidate.intended_next_status !== "paid" &&
    candidate.expected_previous_status !== "paid" &&
    candidate.expected_previous_status !== "rejected"
  ) {
    steps.push({
      match: /FROM conversions[\s\S]*FOR UPDATE/i,
      rows: [...(args?.conversionRows ?? [BASE_LOCKED_CONVERSION])],
    });
    if ((args?.conversionRows ?? [BASE_LOCKED_CONVERSION]).length > 0) {
      steps.push({
        match: /FROM reconciliation_audit_events/i,
        rows: [...(args?.claimRows ?? [])],
      });
      if (
        (args?.claimRows ?? []).length === 0 &&
        candidate.intended_next_status !== "payable"
      ) {
        steps.push({
          match: /FROM conversions c[\s\S]*shopee_ingestion_events/i,
          rows: [...(args?.evidenceRows ?? [BASE_SOURCE_EVIDENCE])],
        });
      }
    }
  }
  return steps;
}

function legacyCommitReadSteps(args?: {
  readonly runStatus?: string;
  readonly candidate?: Record<string, unknown>;
  readonly processingOutcome?: string;
}) {
  const candidate = args?.candidate ?? BASE_COMMIT_CANDIDATE;
  return [
    {
      match: /FROM reconciliation_runs/i,
      rows: [
        {
          id: RUN_ID,
          network: "shopee",
          status: args?.runStatus ?? "draft",
          policy_version: 1,
        },
      ],
    },
    {
      match: /FROM reconciliation_run_candidates[\s\S]*ORDER BY/i,
      rows: [candidate],
    },
    {
      match: /SELECT id::text AS id, processing_outcome/i,
      rows: [
        {
          id: candidate.id,
          processing_outcome: args?.processingOutcome ?? "pending",
        },
      ],
    },
  ];
}

function runtimeCandidateReadSteps(args?: {
  readonly candidate?: Record<string, unknown>;
  readonly conversionRows?: readonly Record<string, unknown>[];
  readonly claimRows?: readonly Record<string, unknown>[];
  readonly evidenceRows?: readonly Record<string, unknown>[];
  readonly stateBacked?: boolean;
  readonly externalMutationsBefore?: readonly ExternalCommittedMutationInput[];
}) {
  const candidate = args?.candidate ?? BASE_COMMIT_CANDIDATE;
  const steps = [];
  if (
    candidate.intended_next_status !== "paid" &&
    candidate.expected_previous_status !== "paid" &&
    candidate.expected_previous_status !== "rejected"
  ) {
    steps.push(
      args?.stateBacked
        ? stateProjectionStep({
            match: /FROM conversions[\s\S]*FOR UPDATE/i,
            kind: "conversion_lock",
            identity: String(candidate.conversion_id),
            expectedKeys:
              (args?.conversionRows ?? [BASE_LOCKED_CONVERSION]).length > 0
                ? [String(candidate.conversion_id)]
                : [],
            externalMutationsBefore: args?.externalMutationsBefore,
          })
        : {
            match: /FROM conversions[\s\S]*FOR UPDATE/i,
            rows: [...(args?.conversionRows ?? [BASE_LOCKED_CONVERSION])],
            externalMutationsBefore: args?.externalMutationsBefore,
          },
    );
    if ((args?.conversionRows ?? [BASE_LOCKED_CONVERSION]).length > 0) {
      steps.push(
        args?.stateBacked
          ? stateProjectionStep({
              match: /FROM reconciliation_audit_events/i,
              kind: "audit_claim",
              identity: String(candidate.id),
              expectedKeys: (args?.claimRows ?? []).map((row) => String(row.id)),
            })
          : {
              match: /FROM reconciliation_audit_events/i,
              rows: [...(args?.claimRows ?? [])],
            },
      );
      if (
        (args?.claimRows ?? []).length === 0 &&
        candidate.intended_next_status !== "payable"
      ) {
        steps.push(
          args?.stateBacked
            ? stateProjectionStep({
                match: /FROM conversions c[\s\S]*shopee_ingestion_events/i,
                kind: "source_evidence",
                identity: [String(candidate.conversion_id)],
                expectedKeys: [String(candidate.conversion_id)],
              })
            : {
                match: /FROM conversions c[\s\S]*shopee_ingestion_events/i,
                rows: [...(args?.evidenceRows ?? [BASE_SOURCE_EVIDENCE])],
              },
        );
      }
    }
  }
  return steps;
}

function plannedPreflightSteps(args: {
  readonly runStatus: string;
  readonly candidates: readonly Record<string, unknown>[];
  readonly candidateReads: readonly ReturnType<
    typeof runtimeCandidateReadSteps
  >[];
  readonly stateBacked?: boolean;
}) {
  const steps = [
    args.stateBacked
      ? stateProjectionStep({
          match: /FROM reconciliation_runs[\s\S]*FOR UPDATE/i,
          kind: "run_lock",
          identity: RUN_ID,
          expectedKeys: [RUN_ID],
        })
      : {
          match: /FROM reconciliation_runs[\s\S]*FOR UPDATE/i,
          rows: [{ id: RUN_ID, network: "shopee", status: args.runStatus, policy_version: 1 }],
        },
    args.stateBacked
      ? stateProjectionStep({
          match: /FROM reconciliation_run_candidates[\s\S]*FOR UPDATE/i,
          kind: "candidate_lock",
          identity: RUN_ID,
          expectedKeys: args.candidates.map((candidate) => String(candidate.id)),
        })
      : {
          match: /FROM reconciliation_run_candidates[\s\S]*FOR UPDATE/i,
          rows: args.candidates,
        },
  ];
  for (let index = 0; index < args.candidates.length; index += 1) {
    if (
      String(args.candidates[index]?.processing_outcome ?? "pending") ===
      "pending"
    ) {
      steps.push(...args.candidateReads[index]!);
    }
  }
  return steps;
}

function legacyMultiCandidateReadSteps(args: {
  readonly runStatus: string;
  readonly candidates: readonly Record<string, unknown>[];
  readonly stateBacked?: boolean;
  readonly externalMutationsBefore?: readonly ExternalCommittedMutationInput[];
}) {
  return [
    args.stateBacked
      ? stateProjectionStep({
          match: /FROM reconciliation_runs/i,
          kind: "run_load",
          identity: RUN_ID,
          expectedKeys: [RUN_ID],
          externalMutationsBefore: args.externalMutationsBefore,
        })
      : {
          match: /FROM reconciliation_runs/i,
          rows: [{ id: RUN_ID, network: "shopee", status: args.runStatus, policy_version: 1 }],
          externalMutationsBefore: args.externalMutationsBefore,
        },
    args.stateBacked
      ? stateProjectionStep({
          match: /FROM reconciliation_run_candidates[\s\S]*ORDER BY/i,
          kind: "candidate_load",
          identity: RUN_ID,
          expectedKeys: args.candidates.map((candidate) => String(candidate.id)),
        })
      : { match: /FROM reconciliation_run_candidates[\s\S]*ORDER BY/i, rows: args.candidates },
    args.stateBacked
      ? stateProjectionStep({
          match: /SELECT id::text AS id, processing_outcome/i,
          kind: "candidate_outcomes",
          identity: RUN_ID,
          expectedKeys: args.candidates.map((candidate) => String(candidate.id)),
        })
      : {
          match: /SELECT id::text AS id, processing_outcome/i,
          rows: args.candidates.map((candidate) => ({
            id: candidate.id,
            processing_outcome: candidate.processing_outcome ?? "pending",
          })),
        },
  ];
}

function completedRunWriteSteps() {
  return [
    stateProjectionStep({
      match: /SELECT count\(\*\)::int AS pending/i,
      kind: "pending_count",
      identity: RUN_ID,
    }),
    runUpdateStep({ status: "committed" }),
  ];
}

function plannedNoAuditExecutionSteps(args?: {
  readonly runStatus?: string;
  readonly candidate?: Record<string, unknown>;
  readonly conversionRows?: readonly Record<string, unknown>[];
  readonly claimRows?: readonly Record<string, unknown>[];
  readonly evidenceRows?: readonly Record<string, unknown>[];
  readonly expectedOutcome?: string;
  readonly expectedReason?: string;
}) {
  const candidate = args?.candidate ?? BASE_COMMIT_CANDIDATE;
  const expectedReason =
    args?.expectedReason ??
    (candidate.intended_next_status === "payable"
      ? "rejected_unverified_settlement_evidence"
      : candidate.intended_next_status === "paid"
        ? "rejected_paid_out_of_phase_20k_scope"
        : candidate.expected_previous_status === "paid" ||
            candidate.expected_previous_status === "rejected"
          ? "rejected_terminal_state"
          : (args?.claimRows?.length ?? 0) > 0
            ? "rejected_duplicate_conversion"
            : (args?.conversionRows ?? [BASE_LOCKED_CONVERSION]).length === 0
              ? "rejected_source_not_ready"
              : "rejected_stale_source_evidence");
  const expectedOutcome =
    args?.expectedOutcome ??
    (expectedReason === "rejected_duplicate_conversion"
      ? "skipped/idempotent"
      : expectedReason === "rejected_stale_source_evidence"
        ? "skipped/stale"
        : expectedReason === "rejected_unverified_settlement_evidence"
          ? "skipped/blocked"
          : "failed");
  return [
    ...legacyCommitReadSteps({
      runStatus: args?.runStatus,
      candidate,
    }),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps({
      candidate,
      conversionRows: args?.conversionRows,
      claimRows: args?.claimRows,
      evidenceRows: args?.evidenceRows,
    }),
    candidateOutcomeStep({
      candidateId: String(candidate.id),
      outcome: expectedOutcome,
      reason: expectedReason,
    }),
    ...completedRunWriteSteps(),
  ];
}

async function runAuditToNoAuditDriftScenario(args: {
  readonly runtimeCandidate?: Record<string, unknown>;
  readonly externalMutations: readonly ExternalCommittedMutationInput[];
  readonly conversionPresent?: boolean;
  readonly expectedConversion?: Readonly<Record<string, unknown>>;
  readonly expectedReason: string;
  readonly expectedOutcome: string;
}) {
  const runtimeCandidate = args.runtimeCandidate ?? BASE_COMMIT_CANDIDATE;
  const harness = createScriptedReconciliationHarness([
    ...plannedPreflightSteps({
      runStatus: "draft",
      candidates: [BASE_COMMIT_CANDIDATE],
      candidateReads: [runtimeCandidateReadSteps({ stateBacked: true })],
      stateBacked: true,
    }),
    ...legacyMultiCandidateReadSteps({
      runStatus: "draft",
      candidates: [runtimeCandidate],
      stateBacked: true,
      externalMutationsBefore: args.externalMutations,
    }),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps({
      candidate: runtimeCandidate,
      conversionRows: args.conversionPresent === false ? [] : [runtimeCandidate],
      stateBacked: true,
    }),
    candidateOutcomeStep({
      candidateId: CANDIDATE_A_ID,
      outcome: args.expectedOutcome,
      reason: args.expectedReason,
    }),
    ...completedRunWriteSteps(),
  ]);

  const result = await commitReconciliationAsync(
    commitInput([
      { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
    ]),
    harness.executor as ReconciliationExecutor,
  );

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0]?.reasonCode, args.expectedReason);
  assert.equal(
    harness.readCommittedRow("reconciliation_audit_events", AUDIT_A_ID),
    undefined,
  );
  if (args.expectedConversion) {
    assertFullRowEqual(
      harness.readCommittedRow("conversions", CONVERSION_A_ID),
      args.expectedConversion,
    );
  } else {
    assert.equal(harness.readCommittedRow("conversions", CONVERSION_A_ID), undefined);
  }
  assert.equal(
    harness.readCommittedRow(
      "reconciliation_run_candidates",
      CANDIDATE_A_ID,
    )?.processing_outcome,
    args.expectedOutcome,
  );
  assert.equal(
    harness.readCommittedRow(
      "reconciliation_run_candidates",
      CANDIDATE_A_ID,
    )?.processing_reason_code,
    args.expectedReason,
  );
  const driftCandidate = harness.readCommittedRow(
    "reconciliation_run_candidates",
    CANDIDATE_A_ID,
  )!;
  assert.equal(isTimestamp(driftCandidate.processing_completed_at), true);
  assertFullRowEqual(driftCandidate, {
    ...candidateSeed(BASE_COMMIT_CANDIDATE),
    ...(runtimeCandidate.expected_previous_status !== BASE_COMMIT_CANDIDATE.expected_previous_status
      ? {
          expected_previous_status: runtimeCandidate.expected_previous_status,
          intended_next_status: runtimeCandidate.intended_next_status,
        }
      : {}),
    processing_outcome: args.expectedOutcome,
    processing_completed_at: driftCandidate.processing_completed_at,
    processing_reason_code: args.expectedReason,
  });
  assert.equal(
    harness.countCommittedMutations("conversions", CONVERSION_A_ID, "update"),
    0,
  );
  assert.deepEqual(
    harness.listExternalOperations().map((mutation) => ({
      operation: mutation.operation,
      relation: mutation.relation,
      primaryKey: mutation.primaryKey,
    })),
    args.externalMutations.map((mutation) => ({
      operation: mutation.operation,
      relation: mutation.relation,
      primaryKey: mutation.primaryKey.toLowerCase(),
    })),
  );
  assert.equal(
    harness.countCommittedMutations(
      "reconciliation_audit_events",
      AUDIT_A_ID,
      "insert",
    ),
    0,
  );
  assert.equal(
    harness.operations.some(
      (operation) =>
        operation.kind === "insert" &&
        /reconciliation_audit_events/i.test(operation.sql),
    ),
    false,
  );
  assert.equal(harness.getTransactionOutcome(1), "committed");
  assert.equal(harness.getTransactionOutcome(2), "committed");
  const driftRun = harness.readCommittedRow("reconciliation_runs", RUN_ID)!;
  assert.equal(isTimestamp(driftRun.committed_at), true);
  assertFullRowEqual(driftRun, {
    ...BASE_RUN_SEED,
    status: "committed",
    committed_at: driftRun.committed_at,
  });
  assert.equal(
    harness
      .listCommittedOperations()
      .some(
        (mutation) =>
          mutation.transactionId === 1 && mutation.operation !== "delete",
      ),
    false,
  );
  assert.equal(harness.remainingSteps(), 0);
  return harness;
}

test("Phase 20K parseStatus: accept every ConversionStatus", () => {
  assert.equal(parseStatus("pending"), "pending");
  assert.equal(parseStatus("approved"), "approved");
  assert.equal(parseStatus("payable"), "payable");
  assert.equal(parseStatus("paid"), "paid");
  assert.equal(parseStatus("rejected"), "rejected");
});

test("Phase 20K parseStatus: unknown status throws", () => {
  assert.throws(() => parseStatus("not_a_status"));
  assert.throws(() => parseStatus("PAID"));
  assert.throws(() => parseStatus(""));
});

test("Phase 20K parseCommission: integer number passes through", () => {
  assert.equal(parseCommission(123), 123);
  assert.equal(parseCommission(0), 0);
});

test("Phase 20K parseCommission: integer string parses", () => {
  assert.equal(parseCommission("123"), 123);
  assert.equal(parseCommission("123456789"), 123_456_789);
});

test("Phase 20K parseCommission: null becomes 0 (refuses silent NaN)", () => {
  assert.equal(parseCommission(null), 0);
});

test("Phase 20K parseCommission: non-integer string throws", () => {
  assert.throws(() => parseCommission("12.5"));
  assert.throws(() => parseCommission("abc"));
});

test("Phase 20K parseCommission: non-integer number throws", () => {
  assert.throws(() => parseCommission(12.5));
});

test("Phase 20K strict harness: correct regex cannot hide a wrong DML relation", async () => {
  const harness = createScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: CANDIDATE_A_ID,
        affectedRows: 1,
        returnedRows: [],
      },
    },
  ]);
  await assert.rejects(
    harness.executor.execute(sql`
      UPDATE reconciliation_run_candidates
      SET processing_outcome = 'applied'
      WHERE id = ${CANDIDATE_A_ID}::uuid
    `),
    /unexpected_dml_target/,
  );
});

test("Phase 20K strict harness: exact relation cannot hide a wrong DML operation", async () => {
  const harness = createScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "insert",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [],
      },
    },
  ]);
  await assert.rejects(
    harness.executor.execute(sql`
      UPDATE reconciliation_runs SET status = 'failed'
      WHERE id = ${RUN_ID}::uuid
    `),
    /unexpected_dml_target/,
  );
});

test("Phase 20K strict harness: candidate and run UPDATE identities come from exact WHERE id predicates", async () => {
  const candidateHarness = createScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_run_candidates/i,
      dml: {
        operation: "update",
        relation: "reconciliation_run_candidates",
        primaryKey: CANDIDATE_A_ID,
        affectedRows: 1,
        returnedRows: [],
      },
    },
  ]);
  await assert.rejects(
    candidateHarness.executor.execute(sql`
      UPDATE reconciliation_run_candidates
      SET processing_outcome = 'applied'
      WHERE id = ${CANDIDATE_B_ID}::uuid
    `),
    /unexpected_dml_primary_key/,
  );

  const runHarness = createScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [],
      },
    },
  ]);
  await assert.rejects(
    runHarness.executor.execute(sql`
      UPDATE reconciliation_runs SET status = 'failed'
      WHERE id = ${CONVERSION_B_ID}::uuid
    `),
    /unexpected_dml_primary_key/,
  );
});

test("Phase 20K strict harness: audit INSERT identity comes from the id column mapping", async () => {
  const harness = createScriptedReconciliationHarness([
    {
      match: /^\s*INSERT INTO reconciliation_audit_events/i,
      dml: {
        operation: "insert",
        relation: "reconciliation_audit_events",
        primaryKey: AUDIT_A_ID,
        affectedRows: 1,
        returnedRows: [{ id: AUDIT_A_ID }],
      },
    },
  ]);
  await assert.rejects(
    harness.executor.execute(sql`
      INSERT INTO reconciliation_audit_events (id, run_candidate_id)
      VALUES (${AUDIT_B_ID}::uuid, ${CANDIDATE_A_ID}::uuid)
      RETURNING id
    `),
    /unexpected_dml_primary_key/,
  );
});

test("Phase 20K strict harness: affected and RETURNING row counts must agree", async () => {
  const harness = createScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKeys: [RUN_ID, CONVERSION_B_ID],
        affectedRows: 2,
        returnedRows: [{ id: RUN_ID }],
        model: false,
      },
    },
  ]);
  await assert.rejects(
    harness.executor.execute(sql`
      UPDATE reconciliation_runs SET status = 'failed'
      WHERE id = ${RUN_ID}::uuid
      RETURNING id
    `),
    /returning_affected_rows_mismatch/,
  );
});

test("Phase 20K strict harness: RETURNING identity must match the declared primary key", async () => {
  const harness = createScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [{ id: AUDIT_A_ID }],
      },
    },
  ]);
  await assert.rejects(
    harness.executor.execute(sql`
      UPDATE reconciliation_runs SET status = 'failed'
      WHERE id = ${RUN_ID}::uuid
      RETURNING id
    `),
    /returning_identity_mismatch/,
  );
});

test("Phase 20K strict harness: modeled non-returning DML requires affected-row evidence", async () => {
  const harness = createScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: undefined as never,
        returnedRows: [],
      },
    },
  ]);
  await assert.rejects(
    harness.executor.execute(sql`
      UPDATE reconciliation_runs SET status = 'failed'
      WHERE id = ${RUN_ID}::uuid
    `),
    /invalid_affected_rows_expectation/,
  );
});

test("Phase 20K strict harness: zero-row DML never creates durable state", async () => {
  const harness = createScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 0,
        returnedRows: [],
      },
    },
  ]);
  await harness.executor.execute(sql`
    UPDATE reconciliation_runs SET status = 'failed'
    WHERE id = ${RUN_ID}::uuid
  `);
  assertFullRowEqual(
    harness.readCommittedRow("reconciliation_runs", RUN_ID),
    BASE_RUN_SEED,
  );
  assert.equal(
    harness.countCommittedMutations("reconciliation_runs", RUN_ID, "update"),
    0,
  );
  harness.assertComplete();
});

test("Phase 20K strict harness: a final UUID parameter is never a primary-key fallback", async () => {
  const harness = createScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [],
        expectedParameterValues: [RUN_ID],
      },
    },
  ]);
  await assert.rejects(
    harness.executor.execute(sql`
      UPDATE reconciliation_runs SET status = 'failed'
      WHERE status = 'committing' AND failed_reason = ${RUN_ID}::text
    `),
    /unexpected_dml_primary_key/,
  );
});

test("Phase 20K strict harness: state SELECT identity is bound to actual parameters", async () => {
  const harness = createScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT status FROM reconciliation_runs/i,
      kind: "run_status",
      identity: RUN_ID,
      expectedKeys: [RUN_ID],
    }),
  ]);
  await assert.rejects(
    harness.executor.execute(sql`
      SELECT status FROM reconciliation_runs WHERE id = ${CANDIDATE_A_ID}::uuid
    `),
    /state_select_parameter_mismatch/,
  );
});

test("Phase 20K strict harness: DML without a strict expectation fails immediately", async () => {
  const harness = createScriptedReconciliationHarness([
    { match: /^\s*UPDATE reconciliation_runs/i },
  ]);
  await assert.rejects(
    harness.executor.execute(sql`
      UPDATE reconciliation_runs SET status = 'failed'
      WHERE id = ${RUN_ID}::uuid
    `),
    /missing_dml_expectation/,
  );
});

test("Phase 20K strict harness: unused and unexpected SQL are independently rejected", async () => {
  const unusedHarness = createUncheckedScriptedReconciliationHarness([
    { match: /^\s*SELECT status FROM reconciliation_runs/i, rows: [] },
  ]);
  assert.throws(
    () => unusedHarness.assertComplete(),
    /unused_scripted_sql_steps:1/,
  );

  const unexpectedHarness = createScriptedReconciliationHarness([]);
  await assert.rejects(
    unexpectedHarness.executor.execute(sql`
      SELECT status FROM reconciliation_runs WHERE id = ${RUN_ID}::uuid
    `),
    /unexpected_sql:select/,
  );
});

test("Phase 20K strict harness: inspection snapshots cannot mutate durable state", async () => {
  const harness = createScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [],
        expectedFields: { status: "failed" },
      },
    },
  ]);
  await harness.executor.execute(sql`
    UPDATE reconciliation_runs SET status = 'failed'
    WHERE id = ${RUN_ID}::uuid
  `);
  const mutations = harness.listCommittedOperations();
  assert.throws(() => {
    (mutations as unknown as unknown[]).push("mutated");
  }, TypeError);
  assert.throws(() => {
    (mutations[0]!.fields as Record<string, unknown>).status = "committed";
  }, TypeError);
  assert.equal(
    harness.readCommittedRow("reconciliation_runs", RUN_ID)?.status,
    "failed",
  );
  harness.assertComplete();
});

test("Phase 20K seeded state: defensive copy, immutable inspection, and zero mutation history", () => {
  const mutableRun = JSON.parse(JSON.stringify(BASE_RUN_SEED)) as Record<string, unknown>;
  const harness = createUncheckedScriptedReconciliationHarness([], {
    seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: mutableRun }],
  });
  (mutableRun.scope as { sourceConversionKeys: string[] }).sourceConversionKeys[0] = SOURCE_B;
  mutableRun.status = "committed";
  assert.equal(harness.readCommittedRow("reconciliation_runs", RUN_ID)?.status, "draft");
  assert.deepEqual(
    (harness.readCommittedRow("reconciliation_runs", RUN_ID)?.scope as {
      sourceConversionKeys: readonly string[];
    }).sourceConversionKeys,
    [SOURCE_A],
  );
  assert.equal(harness.listCommittedOperations().length, 0);
  assert.equal(harness.listSeededRows().length, 1);
  assert.throws(() => {
    (harness.listSeededRows()[0]!.row as Record<string, unknown>).status = "failed";
  }, TypeError);
  assert.equal(harness.readCommittedRow("reconciliation_runs", RUN_ID)?.status, "draft");
  harness.assertComplete();
});

test("Phase 20K seeded state: returned current, rollback, and external snapshots are deeply immutable", async () => {
  const rollbackScope = Object.freeze({ sourceConversionKeys: Object.freeze([SOURCE_B]) });
  const externalScope = Object.freeze({
    sourceConversionKeys: Object.freeze([SOURCE_A, SOURCE_B]),
  });
  const harness = createUncheckedScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [],
        expectedFields: { scope: rollbackScope },
      },
    },
    stateProjectionStep({
      match: /^\s*SELECT status FROM reconciliation_runs/i,
      kind: "run_status",
      identity: RUN_ID,
      expectedKeys: [RUN_ID],
      externalMutationsBefore: [{
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        fields: { scope: externalScope },
      }],
    }),
  ], { seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED }] });

  await assert.rejects(
    harness.executor.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE reconciliation_runs SET scope = ${rollbackScope}::jsonb
        WHERE id = ${RUN_ID}::uuid
      `);
      throw new Error("rollback_nested_scope");
    }),
    /rollback_nested_scope/,
  );
  await harness.executor.execute(sql`
    SELECT status FROM reconciliation_runs WHERE id = ${RUN_ID}::uuid
  `);

  const current = harness.readCommittedRow("reconciliation_runs", RUN_ID)!;
  assert.throws(() => {
    (current as Record<string, unknown>).status = "failed";
  }, TypeError);
  assert.throws(() => {
    ((current.scope as { sourceConversionKeys: string[] }).sourceConversionKeys)[0] = SOURCE_B;
  }, TypeError);
  const rolledBack = harness.listRolledBackOperations();
  assert.throws(() => {
    ((rolledBack[0]!.fields.scope as { sourceConversionKeys: string[] })
      .sourceConversionKeys)[0] = SOURCE_A;
  }, TypeError);
  const external = harness.listExternalOperations();
  assert.throws(() => {
    ((external[0]!.fields.scope as { sourceConversionKeys: string[] })
      .sourceConversionKeys)[0] = SOURCE_A;
  }, TypeError);
  assert.deepEqual(
    (harness.readCommittedRow("reconciliation_runs", RUN_ID)!.scope as {
      sourceConversionKeys: readonly string[];
    }).sourceConversionKeys,
    [SOURCE_A, SOURCE_B],
  );
  harness.assertComplete();
});

test("Phase 20K seeded state: malformed, missing, mismatched, and duplicate seed keys reject", () => {
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [{ relation: "reconciliation_runs", primaryKey: "bad", row: BASE_RUN_SEED }],
    }),
    /invalid_seed_primary_key/,
  );
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [{
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        row: { ...BASE_RUN_SEED, committed_at: undefined },
      }],
    }),
    /invalid_seed_timestamp:committed_at/,
  );
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [{
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        row: { ...BASE_RUN_SEED, id: CANDIDATE_A_ID },
      }],
    }),
    /seed_primary_key_mismatch/,
  );
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [
        { relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED },
        { relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED },
      ],
    }),
    /duplicate_seed_primary_key/,
  );
  const { committed_at: _omitted, ...missingFieldRun } = BASE_RUN_SEED;
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: missingFieldRun }],
    }),
    /missing_seed_field:committed_at/,
  );
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [{
        relation: "unsupported" as never,
        primaryKey: RUN_ID,
        row: BASE_RUN_SEED,
      }],
    }),
    /unsupported_seed_relation/,
  );
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [{
        relation: "reconciliation_run_candidates",
        primaryKey: CANDIDATE_A_ID,
        row: { ...candidateSeed(BASE_COMMIT_CANDIDATE), run_id: null },
      }],
    }),
    /invalid_seed_uuid:run_id/,
  );
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [{
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        row: { ...BASE_RUN_SEED, status: 7 },
      }],
    }),
    /invalid_seed_status:status/,
  );
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [{
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        row: { ...BASE_RUN_SEED, created_at: new Date(Number.NaN) },
      }],
    }),
    /invalid_seed_timestamp:created_at/,
  );
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [{
        relation: "reconciliation_run_candidates",
        primaryKey: CANDIDATE_A_ID,
        row: {
          ...candidateSeed(BASE_COMMIT_CANDIDATE),
          planned_idempotency_key: "not-a-sha",
        },
      }],
    }),
    /invalid_seed_sha256:planned_idempotency_key/,
  );
  assert.throws(
    () => createUncheckedScriptedReconciliationHarness([], {
      seedRows: [{
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        row: { ...BASE_RUN_SEED, scope: { unknown: true } },
      }],
    }),
    /invalid_seed_scope_field:unknown/,
  );
});

test("Phase 20K seeded state: committed updates merge proven fields and preserve complete rows", async () => {
  const harness = createUncheckedScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [],
        expectedFields: { status: "committing", failed_at: null, failed_reason: null },
      },
    },
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [],
        expectedFields: { status: "committed" },
        expectedFieldPredicates: { committed_at: isTimestamp },
      },
    },
  ], { seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED }] });
  await harness.executor.execute(sql`
    UPDATE reconciliation_runs
    SET status = 'committing', failed_at = NULL, failed_reason = NULL
    WHERE id = ${RUN_ID}::uuid
  `);
  await harness.executor.execute(sql`
    UPDATE reconciliation_runs
    SET status = 'committed', committed_at = ${CONCURRENT_AT}::timestamptz
    WHERE id = ${RUN_ID}::uuid
  `);
  assertFullRowEqual(harness.readCommittedRow("reconciliation_runs", RUN_ID), {
    ...BASE_RUN_SEED,
    status: "committed",
    committed_at: CONCURRENT_AT,
  });
  assert.equal(harness.countCommittedMutations("reconciliation_runs", RUN_ID), 2);
  harness.assertComplete();
});

test("Phase 20K seeded state: rollback and zero-row updates preserve the full seed", async () => {
  const harness = createUncheckedScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [],
        expectedFields: { status: "failed" },
      },
    },
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 0,
        returnedRows: [],
      },
    },
  ], { seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED }] });
  await assert.rejects(
    harness.executor.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE reconciliation_runs SET status = 'failed'
        WHERE id = ${RUN_ID}::uuid
      `);
      throw new Error("rollback_seeded_update");
    }),
    /rollback_seeded_update/,
  );
  await harness.executor.execute(sql`
    UPDATE reconciliation_runs SET status = 'committed'
    WHERE id = ${RUN_ID}::uuid
  `);
  assertFullRowEqual(harness.readCommittedRow("reconciliation_runs", RUN_ID), BASE_RUN_SEED);
  assert.equal(harness.listRolledBackOperations().length, 1);
  assert.equal(harness.listCommittedOperations().length, 0);
  harness.assertComplete();
});

test("Phase 20K seeded state: successful UPDATE against a missing current row rejects", async () => {
  const harness = createUncheckedScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [],
        expectedFields: { status: "failed" },
      },
    },
  ]);
  await assert.rejects(
    harness.executor.execute(sql`
      UPDATE reconciliation_runs SET status = 'failed'
      WHERE id = ${RUN_ID}::uuid
    `),
    /update_missing_current_row/,
  );
  assert.equal(harness.listCommittedOperations().length, 0);
  harness.assertComplete();
});

test("Phase 20K state projection: missing, duplicate, extra, and substituted keys fail closed", async () => {
  const missing = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "run_load",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID],
    }),
  ], { seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED }] });
  await assert.rejects(
    missing.executor.execute(sql`
      SELECT id, network, status, policy_version
      FROM reconciliation_runs WHERE id = ${RUN_ID}::uuid
    `),
    /state_projection_order_mismatch/,
  );

  const duplicate = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "run_load",
      identity: RUN_ID,
      expectedKeys: [RUN_ID, RUN_ID],
    }),
  ], { seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED }] });
  await assert.rejects(
    duplicate.executor.execute(sql`
      SELECT id, network, status, policy_version
      FROM reconciliation_runs WHERE id = ${RUN_ID}::uuid
    `),
    /duplicate_state_projection_key/,
  );

  const extra = createUncheckedScriptedReconciliationHarness([
    {
      match: /^\s*SELECT/i,
      stateSelect: {
        kind: "run_load",
        identity: RUN_ID,
        expectedKeys: [RUN_ID, CANDIDATE_A_ID],
      },
    },
  ], { seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED }] });
  await assert.rejects(
    extra.executor.execute(sql`
      SELECT id, network, status, policy_version
      FROM reconciliation_runs WHERE id = ${RUN_ID}::uuid
    `),
    /state_projection_order_mismatch/,
  );

  const substituted = createUncheckedScriptedReconciliationHarness([
    {
      match: /^\s*SELECT/i,
      stateSelect: {
        kind: "run_load",
        identity: RUN_ID,
        expectedKeys: [CANDIDATE_A_ID],
      },
    },
  ], { seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED }] });
  await assert.rejects(
    substituted.executor.execute(sql`
      SELECT id, network, status, policy_version
      FROM reconciliation_runs WHERE id = ${RUN_ID}::uuid
    `),
    /state_projection_order_mismatch/,
  );
});

test("Phase 20K state projection: continuity fields cannot map to another seeded field", async () => {
  const harness = createUncheckedScriptedReconciliationHarness([
    {
      match: /^\s*SELECT/i,
      stateSelect: {
        kind: "candidate_load",
        identity: RUN_ID,
        expectedKeys: [CANDIDATE_A_ID],
      },
    },
  ], { seedRows: [{
    relation: "reconciliation_run_candidates",
    primaryKey: CANDIDATE_A_ID,
    row: candidateSeed(BASE_COMMIT_CANDIDATE),
  }] });
  await assert.rejects(
    harness.executor.execute(sql`
      SELECT id, conversion_id
      FROM reconciliation_run_candidates
      WHERE run_id = ${RUN_ID}::uuid
      ORDER BY created_at ASC, id ASC
    `),
    /state_select_projection_count_mismatch/,
  );

  const omitted = createUncheckedScriptedReconciliationHarness([
    {
      match: /^\s*SELECT/i,
      stateSelect: {
        kind: "candidate_load",
        identity: RUN_ID,
        expectedKeys: [CANDIDATE_A_ID],
      },
    },
  ], { seedRows: [{
    relation: "reconciliation_run_candidates",
    primaryKey: CANDIDATE_A_ID,
    row: candidateSeed(BASE_COMMIT_CANDIDATE),
  }] });
  await assert.rejects(
    omitted.executor.execute(sql`
      SELECT id
      FROM reconciliation_run_candidates
      WHERE run_id = ${RUN_ID}::uuid
      ORDER BY created_at ASC, id ASC
    `),
    /state_select_projection_count_mismatch/,
  );
});

test("Phase 20K state projection: hard-coded continuity contradictions fail for every persisted identity", async () => {
  const wrongRunSeed = {
    ...candidateSeed(BASE_COMMIT_CANDIDATE),
    run_id: CANDIDATE_B_ID,
  };
  const harness = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "candidate_load",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID],
    }),
  ], { seedRows: [{
    relation: "reconciliation_run_candidates",
    primaryKey: CANDIDATE_A_ID,
    row: wrongRunSeed,
  }] });
  await assert.rejects(
    harness.executor.execute(sql`
      SELECT id, conversion_id, network, source_conversion_key,
             expected_previous_status, intended_next_status, planned_reason_code,
             planned_money_network_commission::text AS planned_money_network_commission,
             planned_cashback_share_bps,
             planned_money_user_cashback::text AS planned_money_user_cashback,
             planned_money_platform_profit::text AS planned_money_platform_profit,
             planned_idempotency_key, provenance_fingerprint
      FROM reconciliation_run_candidates
      WHERE run_id = ${RUN_ID}::uuid
      ORDER BY created_at ASC, id ASC
    `),
    /state_projection_order_mismatch/,
  );
  const runHarness = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "run_load",
      identity: RUN_ID,
      expectedKeys: [RUN_ID],
    }),
  ], { seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED }] });
  await assert.rejects(
    runHarness.executor.execute(sql`
      SELECT id, network, status, scope
      FROM reconciliation_runs WHERE id = ${RUN_ID}::uuid
    `),
    /state_select_projection_mismatch:policy_version/,
  );
});

test("Phase 20K state projection: rolled-back values are never projected as current state", async () => {
  const harness = createUncheckedScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_runs/i,
      dml: {
        operation: "update",
        relation: "reconciliation_runs",
        primaryKey: RUN_ID,
        affectedRows: 1,
        returnedRows: [],
        expectedFields: { status: "failed" },
      },
    },
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "run_status",
      identity: RUN_ID,
      expectedKeys: [RUN_ID],
    }),
  ], { seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED }] });
  await assert.rejects(
    harness.executor.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE reconciliation_runs SET status = 'failed'
        WHERE id = ${RUN_ID}::uuid
      `);
      throw new Error("rollback_projection_value");
    }),
    /rollback_projection_value/,
  );
  const rows = await harness.executor.execute(sql`
    SELECT status FROM reconciliation_runs WHERE id = ${RUN_ID}::uuid
  `) as Array<Record<string, unknown>>;
  assert.equal(rows[0]?.status, "draft");
  assert.equal(harness.listRolledBackOperations()[0]?.fields.status, "failed");
  harness.assertComplete();
});

test("Phase 20K state projection: relation, identity, projection, and PostgreSQL casts are SQL-bound", async () => {
  const wrongRelation = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "run_load",
      identity: RUN_ID,
      expectedKeys: [RUN_ID],
    }),
  ], { seedRows: [{ relation: "reconciliation_runs", primaryKey: RUN_ID, row: BASE_RUN_SEED }] });
  await assert.rejects(
    wrongRelation.executor.execute(sql`
      SELECT id, network, status, policy_version
      FROM conversions WHERE id = ${RUN_ID}::uuid
    `),
    /state_select_relation_mismatch/,
  );

  const wrongConversion = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "conversion_lock",
      identity: CONVERSION_A_ID,
      expectedKeys: [CONVERSION_A_ID],
    }),
  ], { seedRows: [{
    relation: "conversions",
    primaryKey: CONVERSION_A_ID,
    row: conversionSeed(BASE_LOCKED_CONVERSION, "order-a"),
  }] });
  await assert.rejects(
    wrongConversion.executor.execute(sql`
      SELECT id, status, network, network_commission::text AS network_commission,
             cashback_share_bps_snapshot,
             user_cashback::text AS user_cashback,
             platform_profit::text AS platform_profit,
             validation_status, settlement_status, source_conversion_key,
             ingestion_event_id, publisher_id, tracking_link_id, occurred_at
      FROM conversions WHERE id = ${CONVERSION_B_ID}::uuid FOR UPDATE
    `),
    /state_select_parameter_mismatch/,
  );

  const candidateRows = [{
    relation: "reconciliation_run_candidates" as const,
    primaryKey: CANDIDATE_A_ID,
    row: candidateSeed(BASE_COMMIT_CANDIDATE),
  }];
  const wrongCast = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "candidate_load",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID],
    }),
  ], { seedRows: candidateRows });
  await assert.rejects(
    wrongCast.executor.execute(sql`
      SELECT id, conversion_id, network, source_conversion_key,
             expected_previous_status, intended_next_status, planned_reason_code,
           planned_money_network_commission AS planned_money_network_commission,
           planned_cashback_share_bps,
           planned_money_user_cashback::text AS planned_money_user_cashback,
             planned_money_platform_profit::text AS planned_money_platform_profit,
             planned_idempotency_key, provenance_fingerprint
      FROM reconciliation_run_candidates
      WHERE run_id = ${RUN_ID}::uuid
      ORDER BY created_at ASC, id ASC
    `),
    /state_select_projection_mismatch:planned_money_network_commission/,
  );

  const correctCast = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "candidate_load",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID],
    }),
  ], { seedRows: candidateRows });
  const projected = await correctCast.executor.execute(sql`
    SELECT id, conversion_id, network, source_conversion_key,
           expected_previous_status, intended_next_status, planned_reason_code,
           planned_money_network_commission::text AS planned_money_network_commission,
           planned_cashback_share_bps,
           planned_money_user_cashback::text AS planned_money_user_cashback,
           planned_money_platform_profit::text AS planned_money_platform_profit,
           planned_idempotency_key, provenance_fingerprint
    FROM reconciliation_run_candidates
    WHERE run_id = ${RUN_ID}::uuid
    ORDER BY created_at ASC, id ASC
  `) as Array<Record<string, unknown>>;
  assert.equal(projected[0]?.planned_money_network_commission, "1000");
  assert.equal(typeof projected[0]?.planned_money_network_commission, "string");
});

test("Phase 20K state projection: candidate ordering enforces created_at then id", async () => {
  const seedRows = [
    {
      relation: "reconciliation_run_candidates" as const,
      primaryKey: CANDIDATE_A_ID,
      row: candidateSeed(BASE_COMMIT_CANDIDATE),
    },
    {
      relation: "reconciliation_run_candidates" as const,
      primaryKey: CANDIDATE_B_ID,
      row: candidateSeed(BASE_COMMIT_CANDIDATE_B),
    },
  ];
  const selectCandidates = sql`
    SELECT id, conversion_id, network, source_conversion_key,
           expected_previous_status, intended_next_status, planned_reason_code,
           planned_money_network_commission::text AS planned_money_network_commission,
           planned_cashback_share_bps,
           planned_money_user_cashback::text AS planned_money_user_cashback,
           planned_money_platform_profit::text AS planned_money_platform_profit,
           planned_idempotency_key, provenance_fingerprint
    FROM reconciliation_run_candidates
    WHERE run_id = ${RUN_ID}::uuid
    ORDER BY created_at ASC, id ASC
  `;
  const reversed = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "candidate_load",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_B_ID, CANDIDATE_A_ID],
    }),
  ], { seedRows });
  await assert.rejects(reversed.executor.execute(selectCandidates), /state_projection_order_mismatch/);

  for (const order of ["created_at ASC", "created_at DESC, id ASC", "created_at ASC, id DESC"]) {
    const harness = createUncheckedScriptedReconciliationHarness([
      stateProjectionStep({
        match: /^\s*SELECT/i,
        kind: "candidate_load",
        identity: RUN_ID,
        expectedKeys: [CANDIDATE_A_ID, CANDIDATE_B_ID],
      }),
    ], { seedRows });
    await assert.rejects(
      harness.executor.execute(sql`
        SELECT id, conversion_id, network, source_conversion_key,
               expected_previous_status, intended_next_status, planned_reason_code,
               planned_money_network_commission::text AS planned_money_network_commission,
               planned_cashback_share_bps,
               planned_money_user_cashback::text AS planned_money_user_cashback,
               planned_money_platform_profit::text AS planned_money_platform_profit,
               planned_idempotency_key, provenance_fingerprint
        FROM reconciliation_run_candidates
        WHERE run_id = ${RUN_ID}::uuid
        ORDER BY ${sql.raw(order)}
      `),
      /state_select_order_mismatch/,
    );
  }
  const correct = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "candidate_load",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID, CANDIDATE_B_ID],
    }),
  ], { seedRows });
  const rows = await correct.executor.execute(selectCandidates) as Array<Record<string, unknown>>;
  assert.deepEqual(rows.map((row) => row.id), [CANDIDATE_A_ID, CANDIDATE_B_ID]);
});

test("Phase 20K state projection: audit claims and pending counts derive from current rows", async () => {
  const falseAbsence = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "audit_claim",
      identity: CANDIDATE_A_ID,
      expectedKeys: [],
    }),
  ], { seedRows: [{
    relation: "reconciliation_audit_events",
    primaryKey: AUDIT_A_ID,
    row: auditSeed({ id: AUDIT_A_ID }),
  }] });
  await assert.rejects(
    falseAbsence.executor.execute(sql`
      SELECT id FROM reconciliation_audit_events
      WHERE run_candidate_id = ${CANDIDATE_A_ID}::uuid LIMIT 1
    `),
    /state_projection_order_mismatch/,
  );

  const wrongClaimIdentity = createUncheckedScriptedReconciliationHarness([
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "audit_claim",
      identity: CANDIDATE_A_ID,
      expectedKeys: [AUDIT_A_ID],
    }),
  ], { seedRows: [{
    relation: "reconciliation_audit_events",
    primaryKey: AUDIT_A_ID,
    row: auditSeed({ id: AUDIT_A_ID }),
  }] });
  await assert.rejects(
    wrongClaimIdentity.executor.execute(sql`
      SELECT id FROM reconciliation_audit_events
      WHERE run_candidate_id = ${CANDIDATE_B_ID}::uuid LIMIT 1
    `),
    /state_select_parameter_mismatch/,
  );

  const scriptedCount = createUncheckedScriptedReconciliationHarness([{
    match: /^\s*SELECT/i,
    rows: [{ pending: 99 }],
    stateSelect: { kind: "pending_count", identity: RUN_ID },
  }], { seedRows: [{
    relation: "reconciliation_run_candidates",
    primaryKey: CANDIDATE_B_ID,
    row: candidateSeed(BASE_COMMIT_CANDIDATE_B),
  }] });
  await assert.rejects(
    scriptedCount.executor.execute(sql`
      SELECT count(*)::int AS pending FROM reconciliation_run_candidates
      WHERE run_id = ${RUN_ID}::uuid AND processing_outcome = 'pending'
    `),
    /state_select_static_rows_forbidden/,
  );

  const appliedA = {
    ...candidateSeed(BASE_COMMIT_CANDIDATE),
    processing_outcome: "applied",
    processing_completed_at: INITIAL_AT,
    processing_reason_code: "approved_eligible_by_match",
  };
  const otherCandidate = {
    ...candidateSeed(BASE_COMMIT_CANDIDATE_B),
    id: AUDIT_B_ID,
    run_id: AUDIT_A_ID,
  };
  const countHarness = createUncheckedScriptedReconciliationHarness([
    candidateOutcomeStep({
      candidateId: CANDIDATE_B_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
    }),
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "pending_count",
      identity: RUN_ID,
    }),
    candidateOutcomeStep({
      candidateId: CANDIDATE_B_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
    }),
    stateProjectionStep({
      match: /^\s*SELECT/i,
      kind: "pending_count",
      identity: RUN_ID,
    }),
  ], { seedRows: [
    { relation: "reconciliation_run_candidates", primaryKey: CANDIDATE_A_ID, row: appliedA },
    { relation: "reconciliation_run_candidates", primaryKey: CANDIDATE_B_ID, row: candidateSeed(BASE_COMMIT_CANDIDATE_B) },
    { relation: "reconciliation_run_candidates", primaryKey: AUDIT_B_ID, row: otherCandidate },
  ] });
  await assert.rejects(
    countHarness.executor.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE reconciliation_run_candidates
        SET processing_outcome = 'applied',
            processing_completed_at = ${CONCURRENT_AT}::timestamptz,
            processing_reason_code = 'approved_eligible_by_match'::text
        WHERE id = ${CANDIDATE_B_ID}::uuid
          AND processing_outcome = 'pending'
      `);
      throw new Error("rollback_pending_count");
    }),
    /rollback_pending_count/,
  );
  const afterRollback = await countHarness.executor.execute(sql`
    SELECT count(*)::int AS pending FROM reconciliation_run_candidates
    WHERE run_id = ${RUN_ID}::uuid AND processing_outcome = 'pending'
  `) as Array<Record<string, unknown>>;
  assert.equal(afterRollback[0]?.pending, 1);
  await countHarness.executor.execute(sql`
    UPDATE reconciliation_run_candidates
    SET processing_outcome = 'applied',
        processing_completed_at = ${CONCURRENT_AT}::timestamptz,
        processing_reason_code = 'approved_eligible_by_match'::text
    WHERE id = ${CANDIDATE_B_ID}::uuid
      AND processing_outcome = 'pending'
  `);
  const afterCommit = await countHarness.executor.execute(sql`
    SELECT count(*)::int AS pending FROM reconciliation_run_candidates
    WHERE run_id = ${RUN_ID}::uuid AND processing_outcome = 'pending'
  `) as Array<Record<string, unknown>>;
  assert.equal(afterCommit[0]?.pending, 0);
});

test("Phase 20K complete payload contract models the production COALESCE candidate update", async () => {
  const harness = createUncheckedScriptedReconciliationHarness([
    {
      match: /^\s*UPDATE reconciliation_run_candidates/i,
      dml: {
        operation: "update",
        relation: "reconciliation_run_candidates",
        primaryKey: CANDIDATE_A_ID,
        affectedRows: 1,
        returnedRows: [],
        expectedFields: {
          processing_outcome: "skipped/idempotent",
          processing_completed_at: CONCURRENT_AT,
          processing_reason_code: "rejected_duplicate_conversion",
        },
      },
    },
  ], { seedRows: [{
    relation: "reconciliation_run_candidates",
    primaryKey: CANDIDATE_A_ID,
    row: candidateSeed(BASE_COMMIT_CANDIDATE),
  }] });
  await harness.executor.execute(sql`
    UPDATE reconciliation_run_candidates
    SET processing_outcome = COALESCE(
      NULLIF(processing_outcome, 'pending'),
      'skipped/idempotent'
    ),
    processing_completed_at = COALESCE(
      processing_completed_at,
      ${CONCURRENT_AT}::timestamptz
    ),
    processing_reason_code = COALESCE(
      NULLIF(processing_reason_code, ''),
      'rejected_duplicate_conversion'
    )
    WHERE id = ${CANDIDATE_A_ID}::uuid
  `);
  assertFullRowEqual(
    harness.readCommittedRow("reconciliation_run_candidates", CANDIDATE_A_ID),
    {
      ...candidateSeed(BASE_COMMIT_CANDIDATE),
      processing_outcome: "skipped/idempotent",
      processing_completed_at: CONCURRENT_AT,
      processing_reason_code: "rejected_duplicate_conversion",
    },
  );
});

test("Phase 20K complete payload contract rejects unasserted lifecycle, candidate, and conversion fields", async () => {
  const cases = [
    {
      seedRows: [{ relation: "reconciliation_runs" as const, primaryKey: RUN_ID, row: BASE_RUN_SEED }],
      step: {
        match: /^\s*UPDATE reconciliation_runs/i,
        dml: {
          operation: "update" as const,
          relation: "reconciliation_runs" as const,
          primaryKey: RUN_ID,
          affectedRows: 1,
          returnedRows: [],
          expectedFields: { status: "failed" },
        },
      },
      query: sql`UPDATE reconciliation_runs SET status = 'failed', failed_at = ${CONCURRENT_AT}::timestamptz WHERE id = ${RUN_ID}::uuid`,
      field: "failed_at",
    },
    {
      seedRows: [{ relation: "reconciliation_run_candidates" as const, primaryKey: CANDIDATE_A_ID, row: candidateSeed(BASE_COMMIT_CANDIDATE) }],
      step: {
        match: /^\s*UPDATE reconciliation_run_candidates/i,
        dml: {
          operation: "update" as const,
          relation: "reconciliation_run_candidates" as const,
          primaryKey: CANDIDATE_A_ID,
          affectedRows: 1,
          returnedRows: [],
          expectedFields: { processing_outcome: "applied" },
        },
      },
      query: sql`UPDATE reconciliation_run_candidates SET processing_outcome = 'applied', processing_completed_at = ${CONCURRENT_AT}::timestamptz WHERE id = ${CANDIDATE_A_ID}::uuid`,
      field: "processing_completed_at",
    },
    {
      seedRows: [{ relation: "conversions" as const, primaryKey: CONVERSION_A_ID, row: conversionSeed(BASE_LOCKED_CONVERSION, "order-a") }],
      step: {
        match: /^\s*UPDATE conversions/i,
        dml: {
          operation: "update" as const,
          relation: "conversions" as const,
          primaryKey: CONVERSION_A_ID,
          affectedRows: 1,
          returnedRows: [],
          expectedFields: { status: "approved" },
        },
      },
      query: sql`UPDATE conversions SET status = 'approved', updated_at = ${CONCURRENT_AT}::timestamptz, approved_at = ${CONCURRENT_AT}::timestamptz WHERE id = ${CONVERSION_A_ID}::uuid`,
      field: "updated_at",
    },
    {
      seedRows: [{ relation: "conversions" as const, primaryKey: CONVERSION_A_ID, row: conversionSeed(BASE_LOCKED_CONVERSION, "order-a") }],
      step: {
        match: /^\s*UPDATE conversions/i,
        dml: {
          operation: "update" as const,
          relation: "conversions" as const,
          primaryKey: CONVERSION_A_ID,
          affectedRows: 1,
          returnedRows: [],
          expectedFields: { status: "rejected" },
          expectedFieldPredicates: { updated_at: isTimestamp },
        },
      },
      query: sql`UPDATE conversions SET status = 'rejected', updated_at = ${CONCURRENT_AT}::timestamptz, rejected_at = ${CONCURRENT_AT}::timestamptz, rejected_reason = 'reason' WHERE id = ${CONVERSION_A_ID}::uuid`,
      field: "rejected_at",
    },
  ];
  for (const item of cases) {
    const harness = createUncheckedScriptedReconciliationHarness([item.step], {
      seedRows: item.seedRows,
    });
    await assert.rejects(harness.executor.execute(item.query), new RegExp("unasserted_dml_field:" + item.field));
  }
});

test("Phase 20K identifier plan: omission preserves repository generation mode", () => {
  assert.equal(validateDryRunReconciliationIdentifierPlan(undefined), undefined);
  assert.equal(validateCommitReconciliationIdentifierPlan(undefined), undefined);
});

test("Phase 20K identifier plan: explicit run and candidate IDs resolve exactly", () => {
  const validated = validateDryRunReconciliationIdentifierPlan({
    reconciliationRunId: RUN_ID,
    candidates: [
      {
        conversionId: CONVERSION_B_ID,
        sourceConversionKey: SOURCE_B,
        candidateId: CANDIDATE_B_ID,
      },
      {
        conversionId: CONVERSION_A_ID,
        sourceConversionKey: SOURCE_A,
        candidateId: CANDIDATE_A_ID,
      },
    ],
  })!;
  assert.equal(validated.reconciliationRunId, RUN_ID);

  const resolved = resolveDryRunReconciliationIdentifierPlan(validated, [
    { conversionId: CONVERSION_A_ID, sourceConversionKey: SOURCE_A },
    { conversionId: CONVERSION_B_ID, sourceConversionKey: SOURCE_B },
  ])!;
  assert.deepEqual(
    resolved.map((item) => [item.conversionId, item.candidateId]),
    [
      [CONVERSION_A_ID, CANDIDATE_A_ID],
      [CONVERSION_B_ID, CANDIDATE_B_ID],
    ],
  );
  assertReconciliationIdentifierResult(RUN_ID, RUN_ID);
  assertCandidateIdentifierResults(resolved, [...resolved].reverse());
});

test("Phase 20K identifier plan: candidate order cannot change ID ownership", () => {
  const validated = validateDryRunReconciliationIdentifierPlan({
    reconciliationRunId: RUN_ID,
    candidates: [
      {
        conversionId: CONVERSION_A_ID,
        sourceConversionKey: SOURCE_A,
        candidateId: CANDIDATE_A_ID,
      },
      {
        conversionId: CONVERSION_B_ID,
        sourceConversionKey: SOURCE_B,
        candidateId: CANDIDATE_B_ID,
      },
    ],
  })!;
  const forward = resolveDryRunReconciliationIdentifierPlan(validated, [
    { conversionId: CONVERSION_A_ID, sourceConversionKey: SOURCE_A },
    { conversionId: CONVERSION_B_ID, sourceConversionKey: SOURCE_B },
  ])!;
  const reversed = resolveDryRunReconciliationIdentifierPlan(validated, [
    { conversionId: CONVERSION_B_ID, sourceConversionKey: SOURCE_B },
    { conversionId: CONVERSION_A_ID, sourceConversionKey: SOURCE_A },
  ])!;
  assert.deepEqual(forward, reversed);
});

test("Phase 20K identifier plan: audit IDs map exactly by run candidate", () => {
  const validated = validateCommitReconciliationIdentifierPlan({
    auditEvents: [
      { runCandidateId: CANDIDATE_B_ID, auditEventId: AUDIT_B_ID },
      { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
    ],
  })!;
  const resolved = resolveCommitReconciliationIdentifierPlan(validated, [
    CANDIDATE_A_ID,
    CANDIDATE_B_ID,
  ])!;
  assert.deepEqual(resolved, [
    { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
    { runCandidateId: CANDIDATE_B_ID, auditEventId: AUDIT_B_ID },
  ]);
  assertAuditIdentifierResults(resolved, [...resolved].reverse());
});

test("Phase 20K identifier plan: invalid and duplicate identifiers fail closed", () => {
  assert.throws(
    () =>
      validateDryRunReconciliationIdentifierPlan({
        reconciliationRunId: "",
        candidates: [],
      }),
    hasIdentifierError("invalid_run_identifier"),
  );
  assert.throws(
    () =>
      validateDryRunReconciliationIdentifierPlan({
        reconciliationRunId: RUN_ID,
        candidates: [
          {
            conversionId: CONVERSION_A_ID,
            sourceConversionKey: SOURCE_A,
            candidateId: RUN_ID,
          },
        ],
      }),
    hasIdentifierError("duplicate_identifier"),
  );
  assert.throws(
    () =>
      validateCommitReconciliationIdentifierPlan({
        auditEvents: [
          { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
          { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_B_ID },
        ],
      }),
    hasIdentifierError("duplicate_audit_candidate"),
  );
});

test("Phase 20K identifier plan: missing and excess mappings fail before use", () => {
  const dryRun = validateDryRunReconciliationIdentifierPlan({
    reconciliationRunId: RUN_ID,
    candidates: [
      {
        conversionId: CONVERSION_A_ID,
        sourceConversionKey: SOURCE_A,
        candidateId: CANDIDATE_A_ID,
      },
    ],
  })!;
  assert.throws(
    () =>
      resolveDryRunReconciliationIdentifierPlan(dryRun, [
        { conversionId: CONVERSION_B_ID, sourceConversionKey: SOURCE_B },
      ]),
    hasIdentifierError("missing_candidate_identifier"),
  );
  assert.throws(
    () => resolveDryRunReconciliationIdentifierPlan(dryRun, []),
    hasIdentifierError("excess_candidate_identifier"),
  );

  const commit = validateCommitReconciliationIdentifierPlan({
    auditEvents: [
      { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
    ],
  })!;
  assert.throws(
    () =>
      resolveCommitReconciliationIdentifierPlan(commit, [CANDIDATE_B_ID]),
    hasIdentifierError("missing_audit_identifier"),
  );
  assert.throws(
    () => resolveCommitReconciliationIdentifierPlan(commit, []),
    hasIdentifierError("excess_audit_identifier"),
  );
});

test("Phase 20K identifier plan: validation never partially consumes input", () => {
  const plan = Object.freeze({
    reconciliationRunId: RUN_ID,
    candidates: Object.freeze([
      Object.freeze({
        conversionId: CONVERSION_A_ID,
        sourceConversionKey: SOURCE_A,
        candidateId: CANDIDATE_A_ID,
      }),
      Object.freeze({
        conversionId: CONVERSION_A_ID,
        sourceConversionKey: SOURCE_A,
        candidateId: CANDIDATE_B_ID,
      }),
    ]),
  });
  const before = JSON.stringify(plan);
  assert.throws(
    () => validateDryRunReconciliationIdentifierPlan(plan),
    hasIdentifierError("duplicate_candidate_identity"),
  );
  assert.equal(JSON.stringify(plan), before);
});

test("Phase 20K identifier plan: returned identifier mismatches fail deterministically", () => {
  assert.throws(
    () => assertReconciliationIdentifierResult(RUN_ID, CANDIDATE_A_ID),
    hasIdentifierError("identifier_result_mismatch"),
  );
  assert.throws(
    () =>
      assertCandidateIdentifierResults(
        [
          {
            conversionId: CONVERSION_A_ID,
            sourceConversionKey: SOURCE_A,
            candidateId: CANDIDATE_A_ID,
          },
        ],
        [],
      ),
    hasIdentifierError("identifier_result_mismatch"),
  );
});

test("Phase 20K identifier plan: replay mapping is stable and paid remains forbidden", () => {
  const validated = validateCommitReconciliationIdentifierPlan({
    auditEvents: [
      { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
    ],
  })!;
  const first = resolveCommitReconciliationIdentifierPlan(validated, [
    CANDIDATE_A_ID,
  ]);
  const replay = resolveCommitReconciliationIdentifierPlan(validated, [
    CANDIDATE_A_ID,
  ]);
  assert.deepEqual(replay, first);

  const source = readFileSync(
    new URL("./reconciliation.repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /No `nextStatus = paid`/);
  assert.match(source, /if \(intendedNext === "payable"\)/);
  assert.match(source, /rejected_unverified_settlement_evidence/);
});

test("Phase 20K direct dry-run: omitted plan preserves default SQL and public result shape", async () => {
  const harness = createScriptedReconciliationHarness([
    { match: /FROM conversions[\s\S]*ORDER BY occurred_at/i, rows: [] },
    {
      match: /SELECT gen_random_uuid\(\)::text AS run_id/i,
      rows: [{ run_id: RUN_ID }],
    },
    unmodeledInsertStep({
      relation: "reconciliation_runs",
      primaryKeys: [RUN_ID],
    }),
  ]);
  const result = await dryRunReconciliationAsync(
    {
      network: "shopee",
      actor: buildReconciliationAdminActor({
        actorUserId: ACTOR_ID,
        actorRole: "admin",
      }),
      sourceScope: { sourceConversionKeys: [SOURCE_A] },
    },
    { database: harness.database as never },
  );

  assert.equal(result.reconciliationRunId, RUN_ID);
  assert.equal("candidateIdentifiers" in result, false);
  assert.deepEqual(harness.transactionEvents, ["begin", "commit"]);
  assert.equal(harness.remainingSteps(), 0);
  const insert = harness.operations.find(
    (operation) => operation.kind === "insert",
  )!;
  assert.doesNotMatch(insert.sql, /returning\s+"id"/i);
});

test("Phase 20K direct dry-run: explicit run and candidate IDs reach actual INSERTs", async () => {
  const conversionRow = {
    ...BASE_LOCKED_CONVERSION,
    advertiser_id: "adv-a",
    campaign_id: "cmp-a",
    offer_id: "off-a",
  };
  const harness = createScriptedReconciliationHarness([
    {
      match: /FROM conversions[\s\S]*ORDER BY occurred_at/i,
      rows: [conversionRow],
    },
    {
      match: /FROM conversions c[\s\S]*shopee_ingestion_events/i,
      rows: [BASE_SOURCE_EVIDENCE],
    },
    unmodeledInsertStep({
      relation: "reconciliation_runs",
      primaryKeys: [RUN_ID],
      returnedRows: [[RUN_ID]],
    }),
    unmodeledInsertStep({
      relation: "reconciliation_run_candidates",
      primaryKeys: [CANDIDATE_A_ID],
      returnedRows: [[CANDIDATE_A_ID, CONVERSION_A_ID, SOURCE_A]],
    }),
  ]);
  const result = await dryRunReconciliationAsync(
    {
      network: "shopee",
      actor: buildReconciliationAdminActor({
        actorUserId: ACTOR_ID,
        actorRole: "admin",
      }),
      sourceScope: { sourceConversionKeys: [SOURCE_A] },
      identifierPlan: {
        reconciliationRunId: RUN_ID,
        candidates: [
          {
            conversionId: CONVERSION_A_ID,
            sourceConversionKey: SOURCE_A,
            candidateId: CANDIDATE_A_ID,
          },
        ],
      },
    },
    { database: harness.database as never },
  );

  assert.equal(result.reconciliationRunId, RUN_ID);
  assert.equal("candidateIdentifiers" in result, false);
  assert.equal(harness.remainingSteps(), 0);
  const runInsert = harness.operations.find(
    (operation) =>
      operation.kind === "insert" &&
      /reconciliation_runs/.test(operation.sql),
  )!;
  const candidateInsert = harness.operations.find(
    (operation) =>
      operation.kind === "insert" &&
      /reconciliation_run_candidates/.test(operation.sql),
  )!;
  assert.ok(runInsert.params.includes(RUN_ID));
  assert.ok(candidateInsert.params.includes(CANDIDATE_A_ID));
  assert.ok(candidateInsert.params.includes(CONVERSION_A_ID));
});

test("Phase 20K direct dry-run: policy 7000 persists the exact bps and 700 / 300 plan", async () => {
  const conversionRow = {
    ...BASE_LOCKED_CONVERSION,
    advertiser_id: "adv-a",
    campaign_id: "cmp-a",
    offer_id: "off-a",
    cashback_share_bps_snapshot: 7000,
    user_cashback: "700",
    platform_profit: "300",
  };
  const harness = createScriptedReconciliationHarness([
    {
      match: /FROM conversions[\s\S]*ORDER BY occurred_at/i,
      rows: [conversionRow],
    },
    {
      match: /FROM conversions c[\s\S]*shopee_ingestion_events/i,
      rows: [BASE_SOURCE_EVIDENCE],
    },
    unmodeledInsertStep({
      relation: "reconciliation_runs",
      primaryKeys: [RUN_ID],
      returnedRows: [[RUN_ID]],
    }),
    unmodeledInsertStep({
      relation: "reconciliation_run_candidates",
      primaryKeys: [CANDIDATE_A_ID],
      returnedRows: [[CANDIDATE_A_ID, CONVERSION_A_ID, SOURCE_A]],
    }),
  ]);
  const result = await dryRunReconciliationAsync(
    {
      network: "shopee",
      actor: buildReconciliationAdminActor({
        actorUserId: ACTOR_ID,
        actorRole: "admin",
      }),
      sourceScope: { sourceConversionKeys: [SOURCE_A] },
      identifierPlan: {
        reconciliationRunId: RUN_ID,
        candidates: [
          {
            conversionId: CONVERSION_A_ID,
            sourceConversionKey: SOURCE_A,
            candidateId: CANDIDATE_A_ID,
          },
        ],
      },
    },
    { database: harness.database as never },
  );

  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0]?.plannedCashbackShareBps, 7000);
  assert.equal(result.decisions[0]?.plannedMoneyUserCashback, 700);
  assert.equal(result.decisions[0]?.plannedMoneyPlatformProfit, 300);
  const candidateInsert = harness.operations.find(
    (operation) =>
      operation.kind === "insert" &&
      /reconciliation_run_candidates/.test(operation.sql),
  )!;
  assert.ok(candidateInsert.params.includes(7000));
  assert.ok(candidateInsert.params.includes(700));
  assert.ok(candidateInsert.params.includes(300));
});

test("Phase 20K direct dry-run: missing policy snapshot creates no run candidate or money mutation", async () => {
  const conversionRow = {
    ...BASE_LOCKED_CONVERSION,
    advertiser_id: "adv-a",
    campaign_id: "cmp-a",
    offer_id: "off-a",
    cashback_share_bps_snapshot: null,
  };
  const harness = createScriptedReconciliationHarness([
    {
      match: /FROM conversions[\s\S]*ORDER BY occurred_at/i,
      rows: [conversionRow],
    },
    {
      match: /FROM conversions c[\s\S]*shopee_ingestion_events/i,
      rows: [BASE_SOURCE_EVIDENCE],
    },
    {
      match: /SELECT gen_random_uuid\(\)::text AS run_id/i,
      rows: [{ run_id: RUN_ID }],
    },
    unmodeledInsertStep({
      relation: "reconciliation_runs",
      primaryKeys: [RUN_ID],
    }),
  ]);
  const result = await dryRunReconciliationAsync(
    {
      network: "shopee",
      actor: buildReconciliationAdminActor({
        actorUserId: ACTOR_ID,
        actorRole: "admin",
      }),
      sourceScope: { sourceConversionKeys: [SOURCE_A] },
    },
    { database: harness.database as never },
  );

  assert.deepEqual(result.skipped, [
    {
      conversionId: CONVERSION_A_ID,
      reasonCode: "rejected_missing_cashback_policy",
    },
  ]);
  assert.equal(result.decisions.length, 0);
  assert.equal(
    harness.operations.some(
      (operation) =>
        operation.kind === "insert" &&
        /reconciliation_run_candidates|reconciliation_audit_events/i.test(
          operation.sql,
        ),
    ),
    false,
  );
  assert.equal(
    harness.operations.some(
      (operation) =>
        operation.kind === "update" && /conversions/i.test(operation.sql),
    ),
    false,
  );
});

test("Phase 20K direct dry-run: database ordering cannot swap candidate IDs", async () => {
  const conversionA = {
    ...BASE_LOCKED_CONVERSION,
    advertiser_id: "adv-a",
    campaign_id: "cmp-a",
    offer_id: "off-a",
  };
  const conversionB = {
    ...conversionA,
    id: CONVERSION_B_ID,
    source_conversion_key: SOURCE_B,
  };
  const evidenceB = {
    ...BASE_SOURCE_EVIDENCE,
    conversion_id: CONVERSION_B_ID,
    external_order_id: "order-b",
    source_conversion_key: SOURCE_B,
  };
  const harness = createScriptedReconciliationHarness([
    {
      match: /FROM conversions[\s\S]*ORDER BY occurred_at/i,
      rows: [conversionB, conversionA],
    },
    {
      match: /FROM conversions c[\s\S]*shopee_ingestion_events/i,
      rows: [evidenceB, BASE_SOURCE_EVIDENCE],
    },
    unmodeledInsertStep({
      relation: "reconciliation_runs",
      primaryKeys: [RUN_ID],
      returnedRows: [[RUN_ID]],
    }),
    unmodeledInsertStep({
      relation: "reconciliation_run_candidates",
      primaryKeys: [CANDIDATE_A_ID, CANDIDATE_B_ID],
      returnedRows: [
        [CANDIDATE_A_ID, CONVERSION_A_ID, SOURCE_A],
        [CANDIDATE_B_ID, CONVERSION_B_ID, SOURCE_B],
      ],
    }),
  ]);
  await dryRunReconciliationAsync(
    {
      network: "shopee",
      actor: buildReconciliationAdminActor({
        actorUserId: ACTOR_ID,
        actorRole: "admin",
      }),
      sourceScope: { sourceConversionKeys: [SOURCE_A, SOURCE_B] },
      identifierPlan: {
        reconciliationRunId: RUN_ID,
        candidates: [
          {
            conversionId: CONVERSION_A_ID,
            sourceConversionKey: SOURCE_A,
            candidateId: CANDIDATE_A_ID,
          },
          {
            conversionId: CONVERSION_B_ID,
            sourceConversionKey: SOURCE_B,
            candidateId: CANDIDATE_B_ID,
          },
        ],
      },
    },
    { database: harness.database as never },
  );
  const insert = harness.operations.find(
    (operation) =>
      operation.kind === "insert" &&
      /reconciliation_run_candidates/.test(operation.sql),
  )!;
  const params = [...insert.params];
  assert.equal(
    params.indexOf(CONVERSION_A_ID),
    params.indexOf(CANDIDATE_A_ID) + 2,
  );
  assert.equal(
    params.indexOf(CONVERSION_B_ID),
    params.indexOf(CANDIDATE_B_ID) + 2,
  );
});

test("Phase 20K direct dry-run: invalid mappings fail before transaction and DML", async () => {
  for (const identifierPlan of [
    {
      reconciliationRunId: RUN_ID,
      candidates: [
        {
          conversionId: CONVERSION_A_ID,
          sourceConversionKey: SOURCE_A,
          candidateId: CANDIDATE_A_ID,
        },
        {
          conversionId: CONVERSION_A_ID,
          sourceConversionKey: SOURCE_A,
          candidateId: CANDIDATE_B_ID,
        },
      ],
    },
    {
      reconciliationRunId: RUN_ID,
      candidates: [
        {
          conversionId: CONVERSION_A_ID,
          sourceConversionKey: SOURCE_A,
          candidateId: "",
        },
      ],
    },
  ]) {
    const harness = createScriptedReconciliationHarness([]);
    await assert.rejects(
      dryRunReconciliationAsync(
        {
          network: "shopee",
          actor: buildReconciliationAdminActor({
            actorUserId: ACTOR_ID,
            actorRole: "admin",
          }),
          sourceScope: { sourceConversionKeys: [SOURCE_A] },
          identifierPlan,
        },
        { database: harness.database as never },
      ),
      (error) => error instanceof ReconciliationIdentifierPlanError,
    );
    assert.equal(harness.dmlCount(), 0);
    assert.deepEqual(harness.transactionEvents, []);
  }
});

test("Phase 20K direct dry-run: missing and excess mappings reject before DML", async () => {
  const conversionRow = {
    ...BASE_LOCKED_CONVERSION,
    advertiser_id: "adv-a",
    campaign_id: "cmp-a",
    offer_id: "off-a",
  };
  for (const candidates of [
    [],
    [
      {
        conversionId: CONVERSION_B_ID,
        sourceConversionKey: SOURCE_B,
        candidateId: CANDIDATE_B_ID,
      },
    ],
  ]) {
    const harness = createScriptedReconciliationHarness([
      {
        match: /FROM conversions[\s\S]*ORDER BY occurred_at/i,
        rows: [conversionRow],
      },
      {
        match: /FROM conversions c[\s\S]*shopee_ingestion_events/i,
        rows: [BASE_SOURCE_EVIDENCE],
      },
    ]);
    await assert.rejects(
      dryRunReconciliationAsync(
        {
          network: "shopee",
          actor: buildReconciliationAdminActor({
            actorUserId: ACTOR_ID,
            actorRole: "admin",
          }),
          sourceScope: { sourceConversionKeys: [SOURCE_A] },
          identifierPlan: { reconciliationRunId: RUN_ID, candidates },
        },
        { database: harness.database as never },
      ),
      (error) => error instanceof ReconciliationIdentifierPlanError,
    );
    assert.equal(harness.dmlCount(), 0);
    assert.deepEqual(harness.transactionEvents, []);
  }
});

test("Phase 20K direct commit: payable hard-block accepts an empty audit plan and inserts no audit", async () => {
  const candidate = {
    ...BASE_COMMIT_CANDIDATE,
    expected_previous_status: "approved",
    intended_next_status: "payable",
  };
  const harness = createScriptedReconciliationHarness([
    ...commitReadSteps({
      candidate,
      conversionRows: [{ ...BASE_LOCKED_CONVERSION, status: "approved" }],
    }),
    ...plannedNoAuditExecutionSteps({
      candidate,
      conversionRows: [{ ...BASE_LOCKED_CONVERSION, status: "approved" }],
    }),
  ]);
  const result = await commitReconciliationAsync(
    commitInput([]),
    harness.executor as ReconciliationExecutor,
  );

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0]?.reasonCode, "rejected_unverified_settlement_evidence");
  assert.equal("auditEventIdentifiers" in result, false);
  assert.equal(
    harness.operations.some(
      (operation) =>
        operation.kind === "insert" &&
        /reconciliation_audit_events/i.test(operation.sql),
    ),
    false,
  );
  assert.equal(harness.remainingSteps(), 0);
});

test("Phase 20K direct commit: audit IDs for hard-block and committed replay reject as excess before DML", async () => {
  const cases = [
    {
      steps: commitReadSteps({
        candidate: {
          ...BASE_COMMIT_CANDIDATE,
          expected_previous_status: "approved",
          intended_next_status: "payable",
        },
        conversionRows: [{ ...BASE_LOCKED_CONVERSION, status: "approved" }],
      }),
    },
    { steps: commitReadSteps({ runStatus: "committed" }) },
  ];
  for (const item of cases) {
    const harness = createScriptedReconciliationHarness(item.steps);
    await assert.rejects(
      commitReconciliationAsync(
        commitInput([
          { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
        ]),
        harness.executor as ReconciliationExecutor,
      ),
      hasIdentifierError("excess_audit_identifier"),
    );
    assert.equal(harness.dmlCount(), 0);
    assert.deepEqual(harness.transactionEvents, ["begin", "rollback"]);
  }
});

test("Phase 20K direct commit: committed replay needs no audit ID and is deterministic", async () => {
  const runOnce = async () => {
    const harness = createScriptedReconciliationHarness(
      [
        ...commitReadSteps({ runStatus: "committed" }),
        ...legacyCommitReadSteps({ runStatus: "committed" }),
      ],
    );
    const result = await commitReconciliationAsync(
      commitInput([]),
      harness.executor as ReconciliationExecutor,
    );
    assert.equal(harness.dmlCount(), 0);
    return result;
  };
  const first = await runOnce();
  const second = await runOnce();
  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(first.applied, []);
  assert.equal(first.skipped[0]?.idempotentReplay, true);
});

test("Phase 20K direct commit: paid, terminal, and missing-conversion outcomes need no audit ID", async () => {
  const cases = [
    {
      candidate: { ...BASE_COMMIT_CANDIDATE, intended_next_status: "paid" },
      expectedReason: "rejected_paid_out_of_phase_20k_scope",
    },
    {
      candidate: {
        ...BASE_COMMIT_CANDIDATE,
        expected_previous_status: "rejected",
        intended_next_status: "approved",
      },
      expectedReason: "rejected_terminal_state",
    },
    {
      candidate: BASE_COMMIT_CANDIDATE,
      conversionRows: [] as readonly Record<string, unknown>[],
      expectedReason: "rejected_source_not_ready",
    },
  ];
  for (const item of cases) {
    const harness = createScriptedReconciliationHarness([
      ...commitReadSteps({
        candidate: item.candidate,
        ...(item.conversionRows ? { conversionRows: item.conversionRows } : {}),
      }),
      ...plannedNoAuditExecutionSteps({
        candidate: item.candidate,
        ...(item.conversionRows ? { conversionRows: item.conversionRows } : {}),
      }),
    ]);
    const result = await commitReconciliationAsync(
      commitInput([]),
      harness.executor as ReconciliationExecutor,
    );
    assert.equal(result.applied.length, 0);
    assert.equal(result.skipped[0]?.reasonCode, item.expectedReason);
    assert.equal(
      harness.operations.some(
        (operation) =>
          operation.kind === "insert" &&
          /reconciliation_audit_events/i.test(operation.sql),
      ),
      false,
    );
  }
});

test("Phase 20K direct commit: existing audit claim needs no ID and creates no new audit", async () => {
  const harness = createScriptedReconciliationHarness([
    ...plannedPreflightSteps({
      runStatus: "draft",
      candidates: [BASE_COMMIT_CANDIDATE],
      stateBacked: true,
      candidateReads: [runtimeCandidateReadSteps({
        claimRows: [{ id: AUDIT_A_ID }],
        stateBacked: true,
      })],
    }),
    ...legacyMultiCandidateReadSteps({
      runStatus: "draft",
      candidates: [BASE_COMMIT_CANDIDATE],
      stateBacked: true,
    }),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps({
      claimRows: [{ id: AUDIT_A_ID }],
      stateBacked: true,
    }),
    candidateOutcomeStep({
      candidateId: CANDIDATE_A_ID,
      outcome: "skipped/idempotent",
      reason: "rejected_duplicate_conversion",
    }),
    ...completedRunWriteSteps(),
  ], {
    seedRows: [
      ...baseSeedRows(),
      {
        relation: "reconciliation_audit_events",
        primaryKey: AUDIT_A_ID,
        row: auditSeed({ id: AUDIT_A_ID }),
      },
    ],
  });
  const result = await commitReconciliationAsync(
    commitInput([]),
    harness.executor as ReconciliationExecutor,
  );
  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0]?.idempotentReplay, true);
  assert.equal(
    harness.operations.filter(
      (operation) =>
        operation.kind === "insert" &&
        /reconciliation_audit_events/i.test(operation.sql),
    ).length,
    0,
  );
});

test("Phase 20K direct commit: stale evidence needs no ID and creates no audit", async () => {
  const harness = createScriptedReconciliationHarness([
    ...commitReadSteps({
      conversionRows: [{ ...BASE_LOCKED_CONVERSION, status: "approved" }],
    }),
    ...plannedNoAuditExecutionSteps({
      conversionRows: [{ ...BASE_LOCKED_CONVERSION, status: "approved" }],
    }),
  ]);
  const result = await commitReconciliationAsync(
    commitInput([]),
    harness.executor as ReconciliationExecutor,
  );
  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0]?.reasonCode, "rejected_stale_source_evidence");
  assert.equal(harness.operations.some((operation) => operation.kind === "insert"), false);
});

test("Phase 20K direct commit: planned bps drift creates no audit apply or conversion update", async () => {
  const live7000 = {
    ...BASE_LOCKED_CONVERSION,
    cashback_share_bps_snapshot: 7000,
    user_cashback: "700",
    platform_profit: "300",
  };
  const harness = createScriptedReconciliationHarness([
    ...commitReadSteps({ conversionRows: [live7000] }),
    ...plannedNoAuditExecutionSteps({ conversionRows: [live7000] }),
  ]);
  const result = await commitReconciliationAsync(
    commitInput([]),
    harness.executor as ReconciliationExecutor,
  );

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0]?.reasonCode, "rejected_stale_source_evidence");
  assert.equal(
    harness.operations.some(
      (operation) =>
        operation.kind === "insert" &&
        /reconciliation_audit_events/i.test(operation.sql),
    ),
    false,
  );
  assert.equal(
    harness.operations.some(
      (operation) =>
        operation.kind === "update" && /conversions/i.test(operation.sql),
    ),
    false,
  );
});

test("Phase 20K direct commit: planned money with the right total but wrong policy split creates no apply", async () => {
  const live7000 = {
    ...BASE_LOCKED_CONVERSION,
    cashback_share_bps_snapshot: 7000,
    user_cashback: "700",
    platform_profit: "300",
  };
  const wrongMoneyCandidate = {
    ...BASE_COMMIT_CANDIDATE,
    planned_cashback_share_bps: 7000,
    provenance_fingerprint: buildProvenanceFingerprint(
      {
        network: "shopee",
        currentStatus: "pending",
        validationStatus: "approved",
        settlementStatus: "not_payable",
        sourceConversionKey: SOURCE_A,
        ingestionEventId: INGESTION_ID,
        persistedLinkKind: "unique",
        sourceStatus: "confirmed_eligible",
      },
      IDEMPOTENCY_A,
      7000,
    ),
  };
  const harness = createScriptedReconciliationHarness([
    ...commitReadSteps({
      candidate: wrongMoneyCandidate,
      conversionRows: [live7000],
    }),
    ...plannedNoAuditExecutionSteps({
      candidate: wrongMoneyCandidate,
      conversionRows: [live7000],
    }),
  ]);
  const result = await commitReconciliationAsync(
    commitInput([]),
    harness.executor as ReconciliationExecutor,
  );

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0]?.reasonCode, "rejected_stale_source_evidence");
  assert.equal(
    harness.operations.some(
      (operation) =>
        operation.kind === "insert" &&
        /reconciliation_audit_events/i.test(operation.sql),
    ),
    false,
  );
  assert.equal(
    harness.operations.some(
      (operation) =>
        operation.kind === "update" && /conversions/i.test(operation.sql),
    ),
    false,
  );
});

test("Phase 20K direct commit: genuine apply requires and uses the exact audit ID", async () => {
  const harness = createScriptedReconciliationHarness([
    ...commitReadSteps(),
    ...legacyCommitReadSteps(),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps(),
    auditInsertStep({ auditId: AUDIT_A_ID }),
    conversionUpdateStep({}),
    candidateOutcomeStep({
      candidateId: CANDIDATE_A_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
    }),
    ...completedRunWriteSteps(),
  ]);
  const result = await commitReconciliationAsync(
    commitInput([
      { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
    ]),
    harness.executor as ReconciliationExecutor,
  );

  assert.equal(result.applied.length, 1);
  assert.equal(result.summary.applied, 1);
  assert.equal("auditEventIdentifiers" in result, false);
  assert.deepEqual(harness.transactionEvents, [
    "begin",
    "commit",
    "begin",
    "commit",
  ]);
  const firstDml = harness.operations.find(
    (operation) => operation.kind !== "select",
  )!;
  assert.match(firstDml.sql, /UPDATE reconciliation_runs[\s\S]*committing/i);
  assert.equal(firstDml.transactionId, null);
  const auditInsert = harness.operations.find(
    (operation) =>
      operation.kind === "insert" &&
      /reconciliation_audit_events/i.test(operation.sql),
  )!;
  assert.ok(auditInsert.params.includes(AUDIT_A_ID));
  assert.ok(auditInsert.params.includes(CANDIDATE_A_ID));
  assert.equal(auditInsert.transactionId, 2);
  assert.equal(harness.remainingSteps(), 0);
});

test("Phase 20K direct commit: planned audit lookup is unreachable through mutable caller references", async () => {
  const mutableAuditEvents = [
    { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
  ];
  const preflightTail = commitReadSteps().slice(1);
  const harness = createScriptedReconciliationHarness([
    {
      match: /FROM reconciliation_runs[\s\S]*FOR UPDATE/i,
      rows: [{ id: RUN_ID, network: "shopee", status: "draft", policy_version: 1 }],
      onMatch: () => {
        mutableAuditEvents[0]!.auditEventId = AUDIT_B_ID;
        mutableAuditEvents.push({
          runCandidateId: CANDIDATE_B_ID,
          auditEventId: AUDIT_B_RETRY_ID,
        });
      },
    },
    ...preflightTail,
    ...legacyCommitReadSteps(),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps(),
    auditInsertStep({ auditId: AUDIT_A_ID }),
    conversionUpdateStep({}),
    candidateOutcomeStep({
      candidateId: CANDIDATE_A_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
    }),
    ...completedRunWriteSteps(),
  ]);

  await commitReconciliationAsync(
    {
      actorUserId: ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: RUN_ID,
      identifierPlan: { auditEvents: mutableAuditEvents },
    },
    harness.executor as ReconciliationExecutor,
  );

  assert.equal(mutableAuditEvents.length, 2);
  assert.equal(
    harness.readCommittedRow("reconciliation_audit_events", AUDIT_A_ID)?.id,
    AUDIT_A_ID,
  );
  const committedAuditA = harness.readCommittedRow(
    "reconciliation_audit_events",
    AUDIT_A_ID,
  )!;
  assert.equal(committedAuditA.reconciliation_run_id, RUN_ID);
  assert.equal(committedAuditA.run_candidate_id, CANDIDATE_A_ID);
  assert.equal(committedAuditA.conversion_id, CONVERSION_A_ID);
  assert.equal(committedAuditA.previous_status, "pending");
  assert.equal(committedAuditA.next_status, "approved");
  assert.equal(committedAuditA.decision, "approve");
  assert.equal(committedAuditA.reason_code, "approved_eligible_by_match");
  assert.equal(committedAuditA.network_commission, 1000);
  assert.equal(committedAuditA.user_cashback, 600);
  assert.equal(committedAuditA.platform_profit, 400);
  assert.equal(
    harness.readCommittedRow("reconciliation_audit_events", AUDIT_B_ID),
    undefined,
  );
  const committedSnapshot = harness.listCommittedOperations();
  assert.throws(() =>
    (committedSnapshot as unknown as Array<unknown>).push("mutation"),
  );
  const auditSnapshot = committedSnapshot.find(
    (mutation) => mutation.relation === "reconciliation_audit_events",
  )!;
  assert.throws(() => {
    (auditSnapshot.fields as Record<string, unknown>).id = AUDIT_B_ID;
  });
  assert.equal(
    harness.readCommittedRow("reconciliation_audit_events", AUDIT_A_ID)?.id,
    AUDIT_A_ID,
  );
});

test("Phase 20K direct commit: audit-producing preflight drifting to paid commits no audit or conversion", async () => {
  await runAuditToNoAuditDriftScenario({
    externalMutations: [{
      operation: "update",
      relation: "conversions",
      primaryKey: CONVERSION_A_ID,
      fields: {
        status: "paid",
        settlement_status: "paid",
        approved_at: CONCURRENT_AT,
        payable_at: CONCURRENT_AT,
        paid_at: CONCURRENT_AT,
        updated_at: CONCURRENT_AT,
      },
    }],
    expectedConversion: {
      ...conversionSeed(BASE_LOCKED_CONVERSION, "order-a"),
      status: "paid",
      settlement_status: "paid",
      approved_at: CONCURRENT_AT,
      payable_at: CONCURRENT_AT,
      paid_at: CONCURRENT_AT,
      updated_at: CONCURRENT_AT,
    },
    expectedReason: "rejected_stale_source_evidence",
    expectedOutcome: "skipped/stale",
  });
});

test("Phase 20K direct commit: audit-producing preflight drifting to terminal commits no audit or conversion", async () => {
  await runAuditToNoAuditDriftScenario({
    externalMutations: [{
      operation: "update",
      relation: "conversions",
      primaryKey: CONVERSION_A_ID,
      fields: {
        status: "rejected",
        rejected_at: CONCURRENT_AT,
        rejected_reason: "external_terminal_rejection",
        updated_at: CONCURRENT_AT,
      },
    }],
    expectedConversion: {
      ...conversionSeed(BASE_LOCKED_CONVERSION, "order-a"),
      status: "rejected",
      rejected_at: CONCURRENT_AT,
      rejected_reason: "external_terminal_rejection",
      updated_at: CONCURRENT_AT,
    },
    expectedReason: "rejected_stale_source_evidence",
    expectedOutcome: "skipped/stale",
  });
});

test("Phase 20K direct commit: audit-producing preflight drifting to payable hard-block leaves its ID unused", async () => {
  await runAuditToNoAuditDriftScenario({
    runtimeCandidate: {
      ...BASE_COMMIT_CANDIDATE,
      expected_previous_status: "approved",
      intended_next_status: "payable",
    },
    externalMutations: [
      {
        operation: "update",
        relation: "reconciliation_run_candidates",
        primaryKey: CANDIDATE_A_ID,
        fields: {
          expected_previous_status: "approved",
          intended_next_status: "payable",
        },
      },
      {
        operation: "update",
        relation: "conversions",
        primaryKey: CONVERSION_A_ID,
        fields: {
          status: "approved",
          approved_at: CONCURRENT_AT,
          updated_at: CONCURRENT_AT,
        },
      },
    ],
    expectedConversion: {
      ...conversionSeed(BASE_LOCKED_CONVERSION, "order-a"),
      status: "approved",
      approved_at: CONCURRENT_AT,
      updated_at: CONCURRENT_AT,
    },
    expectedReason: "rejected_unverified_settlement_evidence",
    expectedOutcome: "skipped/blocked",
  });
});

test("Phase 20K direct commit: audit-producing preflight drifting to stale evidence leaves its ID unused", async () => {
  await runAuditToNoAuditDriftScenario({
    externalMutations: [{
      operation: "update",
      relation: "source_evidence",
      primaryKey: CONVERSION_A_ID,
      fields: { csv_order_status: "CANCELLED" },
    }],
    expectedConversion: conversionSeed(BASE_LOCKED_CONVERSION, "order-a"),
    expectedReason: "rejected_stale_source_evidence",
    expectedOutcome: "skipped/stale",
  });
});

test("Phase 20K direct commit: audit-producing preflight drifting to missing conversion leaves its ID unused", async () => {
  await runAuditToNoAuditDriftScenario({
    externalMutations: [{
      operation: "delete",
      relation: "conversions",
      primaryKey: CONVERSION_A_ID,
    }],
    conversionPresent: false,
    expectedReason: "rejected_source_not_ready",
    expectedOutcome: "failed",
  });
});

test("Phase 20K direct commit: durable A/B failure state drives the connected failed-run retry", async () => {
  const candidateA = { ...BASE_COMMIT_CANDIDATE };
  const candidateB = { ...BASE_COMMIT_CANDIDATE_B };
  const harness = createScriptedReconciliationHarness([
    ...plannedPreflightSteps({
      runStatus: "draft",
      candidates: [candidateA, candidateB],
      stateBacked: true,
      candidateReads: [
        runtimeCandidateReadSteps({ candidate: candidateA, stateBacked: true }),
        runtimeCandidateReadSteps({
          candidate: candidateB,
          conversionRows: [BASE_LOCKED_CONVERSION_B],
          evidenceRows: [BASE_SOURCE_EVIDENCE_B],
          stateBacked: true,
        }),
      ],
    }),
    ...legacyMultiCandidateReadSteps({
      runStatus: "draft",
      candidates: [candidateA, candidateB],
      stateBacked: true,
    }),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps({ candidate: candidateA, stateBacked: true }),
    auditInsertStep({ auditId: AUDIT_A_ID, candidate: candidateA }),
    conversionUpdateStep({ candidate: candidateA }),
    candidateOutcomeStep({
      candidateId: CANDIDATE_A_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
    }),
    stateProjectionStep({
      match: /FROM conversions[\s\S]*FOR UPDATE/i,
      kind: "conversion_lock",
      identity: CONVERSION_B_ID,
      expectedKeys: [CONVERSION_B_ID],
    }),
    stateProjectionStep({
      match: /FROM reconciliation_audit_events/i,
      kind: "audit_claim",
      identity: CANDIDATE_B_ID,
      expectedKeys: [],
    }),
    stateProjectionStep({
      match: /FROM conversions c[\s\S]*shopee_ingestion_events/i,
      kind: "source_evidence",
      identity: [CONVERSION_B_ID],
      expectedKeys: [CONVERSION_B_ID],
    }),
    auditInsertStep({ auditId: AUDIT_B_ID, candidate: candidateB }),
    conversionUpdateStep({ candidate: candidateB }),
    candidateOutcomeStep({
      candidateId: CANDIDATE_B_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
      error: new Error("forced_candidate_b_failure"),
    }),
    runNonReturningUpdateStep({ status: "failed" }),
    stateProjectionStep({
      match: /FROM reconciliation_runs[\s\S]*FOR UPDATE/i,
      kind: "run_lock",
      identity: RUN_ID,
      expectedKeys: [RUN_ID],
    }),
    stateProjectionStep({
      match: /FROM reconciliation_run_candidates[\s\S]*FOR UPDATE/i,
      kind: "candidate_lock",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID, CANDIDATE_B_ID],
    }),
    stateProjectionStep({
      match: /FROM conversions[\s\S]*FOR UPDATE/i,
      kind: "conversion_lock",
      identity: CONVERSION_B_ID,
      expectedKeys: [CONVERSION_B_ID],
    }),
    stateProjectionStep({
      match: /FROM reconciliation_audit_events/i,
      kind: "audit_claim",
      identity: CANDIDATE_B_ID,
      expectedKeys: [],
    }),
    stateProjectionStep({
      match: /FROM conversions c[\s\S]*shopee_ingestion_events/i,
      kind: "source_evidence",
      identity: [CONVERSION_B_ID],
      expectedKeys: [CONVERSION_B_ID],
    }),
    stateProjectionStep({
      match: /FROM reconciliation_runs/i,
      kind: "run_load",
      identity: RUN_ID,
      expectedKeys: [RUN_ID],
    }),
    stateProjectionStep({
      match: /FROM reconciliation_run_candidates[\s\S]*ORDER BY/i,
      kind: "candidate_load",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID, CANDIDATE_B_ID],
    }),
    stateProjectionStep({
      match: /SELECT id::text AS id, processing_outcome/i,
      kind: "candidate_outcomes",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID, CANDIDATE_B_ID],
    }),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps({
      candidate: candidateB,
      conversionRows: [BASE_LOCKED_CONVERSION_B],
      evidenceRows: [BASE_SOURCE_EVIDENCE_B],
      stateBacked: true,
    }),
    auditInsertStep({ auditId: AUDIT_B_RETRY_ID, candidate: candidateB }),
    conversionUpdateStep({ candidate: candidateB }),
    candidateOutcomeStep({
      candidateId: CANDIDATE_B_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
    }),
    stateProjectionStep({
      match: /SELECT count\(\*\)::int AS pending/i,
      kind: "pending_count",
      identity: RUN_ID,
    }),
    runUpdateStep({ status: "committed" }),
  ], { seedRows: twoCandidateSeedRows() });

  await assert.rejects(
    commitReconciliationAsync(
      commitInput([
        { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
        { runCandidateId: CANDIDATE_B_ID, auditEventId: AUDIT_B_ID },
      ]),
      harness.executor as ReconciliationExecutor,
    ),
    /forced_candidate_b_failure/,
  );

  assert.equal(
    harness.readCommittedRow("reconciliation_audit_events", AUDIT_A_ID)?.id,
    AUDIT_A_ID,
  );
  const durableAuditA = harness.readCommittedRow(
    "reconciliation_audit_events",
    AUDIT_A_ID,
  )!;
  assertFullRowEqual(durableAuditA, auditSeed({ id: AUDIT_A_ID, candidate: candidateA }));
  assert.equal(durableAuditA.reconciliation_run_id, RUN_ID);
  assert.equal(durableAuditA.run_candidate_id, CANDIDATE_A_ID);
  assert.equal(durableAuditA.conversion_id, CONVERSION_A_ID);
  assert.equal(durableAuditA.previous_status, "pending");
  assert.equal(durableAuditA.next_status, "approved");
  assert.equal(durableAuditA.decision, "approve");
  assert.equal(durableAuditA.reason_code, "approved_eligible_by_match");
  assert.equal(durableAuditA.human_reason, "approved_eligible_by_match");
  assert.equal(durableAuditA.network, "shopee");
  assert.equal(durableAuditA.network_commission, 1000);
  assert.equal(durableAuditA.user_cashback, 600);
  assert.equal(durableAuditA.platform_profit, 400);
  assert.equal(durableAuditA.actor_kind, "admin");
  assert.equal(durableAuditA.actor_user_id, ACTOR_ID);
  assert.equal(durableAuditA.actor_role, "admin");
  assert.equal(
    harness.readCommittedRow("conversions", CONVERSION_A_ID)?.status,
    "approved",
  );
  assert.equal(
    harness.readCommittedRow(
      "reconciliation_run_candidates",
      CANDIDATE_A_ID,
    )?.processing_outcome,
    "applied",
  );
  const candidateAAfterFailure = harness.readCommittedRow(
    "reconciliation_run_candidates",
    CANDIDATE_A_ID,
  )!;
  assert.equal(isTimestamp(candidateAAfterFailure.processing_completed_at), true);
  assertFullRowEqual(candidateAAfterFailure, {
    ...candidateSeed(BASE_COMMIT_CANDIDATE),
    processing_outcome: "applied",
    processing_completed_at: candidateAAfterFailure.processing_completed_at,
    processing_reason_code: "approved_eligible_by_match",
  });
  const conversionAAfterFailure = harness.readCommittedRow(
    "conversions",
    CONVERSION_A_ID,
  )!;
  assert.equal(isTimestamp(conversionAAfterFailure.updated_at), true);
  assert.equal(conversionAAfterFailure.approved_at, conversionAAfterFailure.updated_at);
  assertFullRowEqual(conversionAAfterFailure, {
    ...conversionSeed(BASE_LOCKED_CONVERSION, "order-a"),
    status: "approved",
    approved_at: conversionAAfterFailure.approved_at,
    updated_at: conversionAAfterFailure.updated_at,
  });
  assert.equal(
    harness.readCommittedRow("reconciliation_audit_events", AUDIT_B_ID),
    undefined,
  );
  assertFullRowEqual(
    harness.readCommittedRow("conversions", CONVERSION_B_ID),
    conversionSeed(BASE_LOCKED_CONVERSION_B, "order-b"),
  );
  assertFullRowEqual(
    harness.readCommittedRow(
      "reconciliation_run_candidates",
      CANDIDATE_B_ID,
    ),
    candidateSeed(BASE_COMMIT_CANDIDATE_B),
  );
  assert.equal(
    harness.readCommittedRow("reconciliation_runs", RUN_ID)?.status,
    "failed",
  );
  const runAfterFailure = harness.readCommittedRow("reconciliation_runs", RUN_ID)!;
  assert.equal(isTimestamp(runAfterFailure.failed_at), true);
  assertFullRowEqual(runAfterFailure, {
    ...TWO_CANDIDATE_RUN_SEED,
    status: "failed",
    failed_at: runAfterFailure.failed_at,
    failed_reason: "forced_candidate_b_failure",
  });
  assert.equal(harness.getTransactionOutcome(2), "committed");
  assert.equal(harness.getTransactionOutcome(3), "rolled_back");
  assert.ok(
    harness
      .listRolledBackOperations()
      .some((mutation) => mutation.identities.includes(CANDIDATE_B_ID)),
  );
  const rolledBackB = harness
    .listRolledBackOperations()
    .filter((mutation) => mutation.transactionId === 3);
  assert.deepEqual(
    new Set(rolledBackB.map((mutation) => mutation.relation)),
    new Set([
      "reconciliation_audit_events",
      "conversions",
      "reconciliation_run_candidates",
    ]),
  );
  assert.equal(
    rolledBackB.every((mutation) => mutation.disposition === "rolled_back"),
    true,
  );

  const result = await commitReconciliationAsync(
    commitInput([
      { runCandidateId: CANDIDATE_B_ID, auditEventId: AUDIT_B_RETRY_ID },
    ]),
    harness.executor as ReconciliationExecutor,
  );

  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0]?.conversionId, CONVERSION_B_ID);
  assert.equal(result.scannedRowCount, 2);
  assert.equal(harness.getTransactionOutcome(4), "committed");
  assert.equal(harness.getTransactionOutcome(5), "committed");
  const auditInserts = harness.operations.filter(
    (operation) =>
      operation.kind === "insert" &&
      /reconciliation_audit_events/i.test(operation.sql),
  );
  assert.equal(auditInserts.length, 3);
  assert.ok(auditInserts[2]!.params.includes(AUDIT_B_RETRY_ID));
  assert.equal(
    harness.countCommittedMutations(
      "reconciliation_audit_events",
      AUDIT_A_ID,
      "insert",
    ),
    1,
  );
  assert.equal(
    harness.countCommittedMutations(
      "reconciliation_audit_events",
      AUDIT_B_RETRY_ID,
      "insert",
    ),
    1,
  );
  const committedAuditB = harness.readCommittedRow(
    "reconciliation_audit_events",
    AUDIT_B_RETRY_ID,
  )!;
  assertFullRowEqual(
    committedAuditB,
    auditSeed({ id: AUDIT_B_RETRY_ID, candidate: candidateB }),
  );
  assert.equal(committedAuditB.reconciliation_run_id, RUN_ID);
  assert.equal(committedAuditB.run_candidate_id, CANDIDATE_B_ID);
  assert.equal(committedAuditB.conversion_id, CONVERSION_B_ID);
  assert.equal(committedAuditB.previous_status, "pending");
  assert.equal(committedAuditB.next_status, "approved");
  assert.equal(committedAuditB.reason_code, "approved_eligible_by_match");
  assert.equal(committedAuditB.human_reason, "approved_eligible_by_match");
  assert.equal(committedAuditB.decision, "approve");
  assert.equal(committedAuditB.network_commission, 1000);
  assert.equal(committedAuditB.user_cashback, 600);
  assert.equal(committedAuditB.platform_profit, 400);
  assert.equal(committedAuditB.actor_user_id, ACTOR_ID);
  assert.equal(
    harness.countCommittedMutations(
      "reconciliation_audit_events",
      AUDIT_B_ID,
      "insert",
    ),
    0,
  );
  assert.equal(
    harness.countCommittedMutations("conversions", CONVERSION_A_ID, "update"),
    1,
  );
  assert.equal(
    harness.countCommittedMutations("conversions", CONVERSION_B_ID, "update"),
    1,
  );
  assert.equal(
    harness.countCommittedMutations(
      "reconciliation_run_candidates",
      CANDIDATE_A_ID,
      "update",
    ),
    1,
  );
  assert.equal(
    harness.countCommittedMutations(
      "reconciliation_run_candidates",
      CANDIDATE_B_ID,
      "update",
    ),
    1,
  );
  assert.ok(
    harness
      .listRolledBackOperations()
      .some(
        (mutation) =>
          mutation.relation === "reconciliation_audit_events" &&
          mutation.identities.includes(AUDIT_B_ID) &&
          mutation.transactionId === 3,
      ),
  );
  assert.equal(
    harness.readCommittedRow("reconciliation_runs", RUN_ID)?.status,
    "committed",
  );
  assert.equal(
    JSON.stringify(harness.readCommittedRow("reconciliation_run_candidates", CANDIDATE_A_ID)),
    JSON.stringify(candidateAAfterFailure),
  );
  assert.equal(
    JSON.stringify(harness.readCommittedRow("conversions", CONVERSION_A_ID)),
    JSON.stringify(conversionAAfterFailure),
  );
  const candidateBAfterRetry = harness.readCommittedRow(
    "reconciliation_run_candidates",
    CANDIDATE_B_ID,
  )!;
  assert.equal(isTimestamp(candidateBAfterRetry.processing_completed_at), true);
  assertFullRowEqual(candidateBAfterRetry, {
    ...candidateSeed(BASE_COMMIT_CANDIDATE_B),
    processing_outcome: "applied",
    processing_completed_at: candidateBAfterRetry.processing_completed_at,
    processing_reason_code: "approved_eligible_by_match",
  });
  const conversionBAfterRetry = harness.readCommittedRow("conversions", CONVERSION_B_ID)!;
  assert.equal(isTimestamp(conversionBAfterRetry.updated_at), true);
  assertFullRowEqual(conversionBAfterRetry, {
    ...conversionSeed(BASE_LOCKED_CONVERSION_B, "order-b"),
    status: "approved",
    approved_at: conversionBAfterRetry.approved_at,
    updated_at: conversionBAfterRetry.updated_at,
  });
  const runAfterRetry = harness.readCommittedRow("reconciliation_runs", RUN_ID)!;
  assert.equal(isTimestamp(runAfterRetry.committed_at), true);
  assertFullRowEqual(runAfterRetry, {
    ...TWO_CANDIDATE_RUN_SEED,
    status: "committed",
    failed_at: null,
    failed_reason: null,
    committed_at: runAfterRetry.committed_at,
  });
  assert.equal(harness.remainingSteps(), 0);
});

test("Phase 20K direct commit: audit-producing preflight drifting to an existing claim leaves its ID unused", async () => {
  const unusedHarness = createScriptedReconciliationHarness([
    ...plannedPreflightSteps({
      runStatus: "draft",
      candidates: [BASE_COMMIT_CANDIDATE],
      candidateReads: [runtimeCandidateReadSteps({ stateBacked: true })],
      stateBacked: true,
    }),
    ...legacyMultiCandidateReadSteps({
      runStatus: "draft",
      candidates: [BASE_COMMIT_CANDIDATE],
      stateBacked: true,
      externalMutationsBefore: [{
        operation: "insert",
        relation: "reconciliation_audit_events",
        primaryKey: AUDIT_B_ID,
        fields: auditSeed({ id: AUDIT_B_ID }),
      }],
    }),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps({
      claimRows: [{ id: AUDIT_B_ID }],
      stateBacked: true,
    }),
    candidateOutcomeStep({
      candidateId: CANDIDATE_A_ID,
      outcome: "skipped/idempotent",
      reason: "rejected_duplicate_conversion",
    }),
    ...completedRunWriteSteps(),
  ]);
  const unused = await commitReconciliationAsync(
    commitInput([
      { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
    ]),
    unusedHarness.executor as ReconciliationExecutor,
  );
  assert.equal(unused.applied.length, 0);
  assert.equal(unused.skipped[0]?.idempotentReplay, true);
  assert.equal(
    unusedHarness.operations.some(
      (operation) =>
        operation.kind === "insert" &&
        /reconciliation_audit_events/i.test(operation.sql),
    ),
    false,
  );
  assert.equal(
    unusedHarness.readCommittedRow(
      "reconciliation_audit_events",
      AUDIT_A_ID,
    ),
    undefined,
  );
  assertFullRowEqual(
    unusedHarness.readCommittedRow("reconciliation_audit_events", AUDIT_B_ID),
    auditSeed({ id: AUDIT_B_ID }),
  );
  assert.equal(
    unusedHarness.readCommittedRow(
      "reconciliation_run_candidates",
      CANDIDATE_A_ID,
    )?.processing_outcome,
    "skipped/idempotent",
  );
});

test("Phase 20K direct commit: no-audit to audit drift preserves earlier committed work and commits no B mutation", async () => {
  const candidateA = { ...BASE_COMMIT_CANDIDATE };
  const candidateB = { ...BASE_COMMIT_CANDIDATE_B };
  const unexpectedHarness = createScriptedReconciliationHarness([
    ...plannedPreflightSteps({
      runStatus: "draft",
      candidates: [candidateA, candidateB],
      stateBacked: true,
      candidateReads: [
        runtimeCandidateReadSteps({ candidate: candidateA, stateBacked: true }),
        runtimeCandidateReadSteps({ candidate: candidateB, conversionRows: [], stateBacked: true }),
      ],
    }),
    ...legacyMultiCandidateReadSteps({
      runStatus: "draft",
      candidates: [candidateA, candidateB],
      stateBacked: true,
      externalMutationsBefore: [
        {
          operation: "insert",
          relation: "conversions",
          primaryKey: CONVERSION_B_ID,
          fields: conversionSeed(BASE_LOCKED_CONVERSION_B, "order-b"),
        },
        {
          operation: "insert",
          relation: "source_evidence",
          primaryKey: CONVERSION_B_ID,
          fields: sourceEvidenceSeed(BASE_SOURCE_EVIDENCE_B),
        },
      ],
    }),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps({ candidate: candidateA, stateBacked: true }),
    auditInsertStep({ auditId: AUDIT_A_ID, candidate: candidateA }),
    conversionUpdateStep({ candidate: candidateA }),
    candidateOutcomeStep({
      candidateId: CANDIDATE_A_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
    }),
    ...runtimeCandidateReadSteps({
      candidate: candidateB,
      conversionRows: [BASE_LOCKED_CONVERSION_B],
      evidenceRows: [BASE_SOURCE_EVIDENCE_B],
      stateBacked: true,
    }),
    runNonReturningUpdateStep({ status: "failed" }),
    stateProjectionStep({
      match: /FROM reconciliation_runs[\s\S]*FOR UPDATE/i,
      kind: "run_lock",
      identity: RUN_ID,
      expectedKeys: [RUN_ID],
    }),
    stateProjectionStep({
      match: /FROM reconciliation_run_candidates[\s\S]*FOR UPDATE/i,
      kind: "candidate_lock",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID, CANDIDATE_B_ID],
    }),
    ...runtimeCandidateReadSteps({
      candidate: candidateB,
      conversionRows: [BASE_LOCKED_CONVERSION_B],
      evidenceRows: [BASE_SOURCE_EVIDENCE_B],
      stateBacked: true,
    }),
    stateProjectionStep({
      match: /FROM reconciliation_runs/i,
      kind: "run_load",
      identity: RUN_ID,
      expectedKeys: [RUN_ID],
    }),
    stateProjectionStep({
      match: /FROM reconciliation_run_candidates[\s\S]*ORDER BY/i,
      kind: "candidate_load",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID, CANDIDATE_B_ID],
    }),
    stateProjectionStep({
      match: /SELECT id::text AS id, processing_outcome/i,
      kind: "candidate_outcomes",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID, CANDIDATE_B_ID],
    }),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps({
      candidate: candidateB,
      conversionRows: [BASE_LOCKED_CONVERSION_B],
      evidenceRows: [BASE_SOURCE_EVIDENCE_B],
      stateBacked: true,
    }),
    auditInsertStep({ auditId: AUDIT_B_RETRY_ID, candidate: candidateB }),
    conversionUpdateStep({ candidate: candidateB }),
    candidateOutcomeStep({
      candidateId: CANDIDATE_B_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
    }),
    ...completedRunWriteSteps(),
  ], {
    seedRows: twoCandidateSeedRows().filter(
      (seed) => !(
        seed.primaryKey === CONVERSION_B_ID &&
        (seed.relation === "conversions" || seed.relation === "source_evidence")
      ),
    ),
  });
  await assert.rejects(
    commitReconciliationAsync(
      commitInput([
        { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
      ]),
      unexpectedHarness.executor as ReconciliationExecutor,
    ),
    hasIdentifierError("missing_audit_identifier"),
  );
  assert.deepEqual(unexpectedHarness.transactionEvents, [
    "begin",
    "commit",
    "begin",
    "commit",
    "begin",
    "rollback",
  ]);
  const unexpectedAuditInserts = unexpectedHarness.operations.filter(
    (operation) =>
      operation.kind === "insert" &&
      /reconciliation_audit_events/i.test(operation.sql),
  );
  assert.equal(unexpectedAuditInserts.length, 1);
  assert.ok(unexpectedAuditInserts[0]!.params.includes(AUDIT_A_ID));
  assert.equal(
    unexpectedHarness.operations.some((operation) =>
      operation.params.includes(CANDIDATE_B_ID) && operation.kind !== "select"
    ),
    false,
  );
  assert.equal(
    unexpectedHarness.readCommittedRow(
      "reconciliation_audit_events",
      AUDIT_A_ID,
    )?.id,
    AUDIT_A_ID,
  );
  assert.equal(
    unexpectedHarness.readCommittedRow("conversions", CONVERSION_A_ID)?.status,
    "approved",
  );
  assert.equal(
    unexpectedHarness.readCommittedRow(
      "reconciliation_run_candidates",
      CANDIDATE_A_ID,
    )?.processing_outcome,
    "applied",
  );
  assert.equal(
    unexpectedHarness.readCommittedRow(
      "reconciliation_audit_events",
      AUDIT_B_ID,
    ),
    undefined,
  );
  assertFullRowEqual(
    unexpectedHarness.readCommittedRow("conversions", CONVERSION_B_ID),
    conversionSeed(BASE_LOCKED_CONVERSION_B, "order-b"),
  );
  assertFullRowEqual(
    unexpectedHarness.readCommittedRow(
      "reconciliation_run_candidates",
      CANDIDATE_B_ID,
    ),
    candidateSeed(BASE_COMMIT_CANDIDATE_B),
  );
  assert.equal(unexpectedHarness.getTransactionOutcome(2), "committed");
  assert.equal(unexpectedHarness.getTransactionOutcome(3), "rolled_back");
  assert.equal(
    unexpectedHarness
      .listRolledBackOperations()
      .filter((mutation) => mutation.transactionId === 3).length,
    0,
  );
  assert.equal(
    unexpectedHarness.readCommittedRow("reconciliation_runs", RUN_ID)?.status,
    "failed",
  );
  const driftAComplete = unexpectedHarness.readCommittedRow(
    "reconciliation_run_candidates",
    CANDIDATE_A_ID,
  )!;
  const driftAConversion = unexpectedHarness.readCommittedRow(
    "conversions",
    CONVERSION_A_ID,
  )!;

  const retry = await commitReconciliationAsync(
    commitInput([
      { runCandidateId: CANDIDATE_B_ID, auditEventId: AUDIT_B_RETRY_ID },
    ]),
    unexpectedHarness.executor as ReconciliationExecutor,
  );
  assert.equal(retry.applied.length, 1);
  assert.equal(retry.applied[0]?.conversionId, CONVERSION_B_ID);
  assert.equal(
    unexpectedHarness.countCommittedMutations(
      "reconciliation_audit_events",
      AUDIT_A_ID,
      "insert",
    ),
    1,
  );
  assert.equal(
    unexpectedHarness.countCommittedMutations(
      "reconciliation_audit_events",
      AUDIT_B_RETRY_ID,
      "insert",
    ),
    1,
  );
  assert.equal(
    unexpectedHarness.readCommittedRow("reconciliation_runs", RUN_ID)?.status,
    "committed",
  );
  assert.equal(
    JSON.stringify(unexpectedHarness.readCommittedRow(
      "reconciliation_run_candidates",
      CANDIDATE_A_ID,
    )),
    JSON.stringify(driftAComplete),
  );
  assert.equal(
    JSON.stringify(unexpectedHarness.readCommittedRow("conversions", CONVERSION_A_ID)),
    JSON.stringify(driftAConversion),
  );
  const driftBComplete = unexpectedHarness.readCommittedRow(
    "reconciliation_run_candidates",
    CANDIDATE_B_ID,
  )!;
  assert.equal(isTimestamp(driftBComplete.processing_completed_at), true);
  assertFullRowEqual(driftBComplete, {
    ...candidateSeed(BASE_COMMIT_CANDIDATE_B),
    processing_outcome: "applied",
    processing_completed_at: driftBComplete.processing_completed_at,
    processing_reason_code: "approved_eligible_by_match",
  });
  assert.equal(unexpectedHarness.remainingSteps(), 0);
});

function appliedCandidateSteps(): readonly ScriptedSqlStep[] {
  return [
    ...plannedPreflightSteps({
      runStatus: "draft",
      candidates: [BASE_COMMIT_CANDIDATE],
      candidateReads: [runtimeCandidateReadSteps({ stateBacked: true })],
      stateBacked: true,
    }),
    ...legacyMultiCandidateReadSteps({
      runStatus: "draft",
      candidates: [BASE_COMMIT_CANDIDATE],
      stateBacked: true,
    }),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps({ stateBacked: true }),
    auditInsertStep({ auditId: AUDIT_A_ID }),
    conversionUpdateStep({}),
    candidateOutcomeStep({
      candidateId: CANDIDATE_A_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
    }),
    stateProjectionStep({
      match: /SELECT count\(\*\)::int AS pending/i,
      kind: "pending_count",
      identity: RUN_ID,
    }),
  ];
}

function exactRunStateStep(args: {
  readonly match: RegExp;
  readonly status: "committing" | "failed" | "committed";
  readonly includeRunFields?: boolean;
}): ScriptedSqlStep {
  return stateProjectionStep({
    match: args.match,
    kind: args.includeRunFields === false
      ? "run_status"
      : /FOR UPDATE/i.test(args.match.source)
        ? "run_lock"
        : "run_load",
    identity: RUN_ID,
    expectedKeys: [RUN_ID],
  });
}

function completedCandidateStateSteps(runStatus: "failed" | "committed") {
  return [
    exactRunStateStep({
      match: /FROM reconciliation_runs[\s\S]*FOR UPDATE/i,
      status: runStatus,
    }),
    stateProjectionStep({
      match: /FROM reconciliation_run_candidates[\s\S]*FOR UPDATE/i,
      kind: "candidate_lock",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID],
    }),
    exactRunStateStep({ match: /FROM reconciliation_runs/i, status: runStatus }),
    stateProjectionStep({
      match: /FROM reconciliation_run_candidates[\s\S]*ORDER BY/i,
      kind: "candidate_load",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID],
    }),
    stateProjectionStep({
      match: /SELECT id::text AS id, processing_outcome/i,
      kind: "candidate_outcomes",
      identity: RUN_ID,
      expectedKeys: [CANDIDATE_A_ID],
    }),
  ] as const;
}

test("Phase 20K direct commit: failed finalization recovers to failed and retry finalizes without duplicate work", async () => {
  const harness = createScriptedReconciliationHarness([
    ...appliedCandidateSteps(),
    runUpdateStep({
      status: "committed",
      affectedRows: 0,
      error: new Error("forced_finalization_failure"),
    }),
    exactRunStateStep({
      match: /SELECT status FROM reconciliation_runs/i,
      status: "committing",
      includeRunFields: false,
    }),
    runUpdateStep({
      status: "failed",
      expectedReason: "reconciliation_finalization_failed",
    }),
    ...completedCandidateStateSteps("failed"),
    runUpdateStep({ status: "committing" }),
    stateProjectionStep({
      match: /SELECT count\(\*\)::int AS pending/i,
      kind: "pending_count",
      identity: RUN_ID,
    }),
    runUpdateStep({ status: "committed" }),
  ]);

  await assert.rejects(
    commitReconciliationAsync(
      commitInput([
        { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
      ]),
      harness.executor as ReconciliationExecutor,
    ),
    /forced_finalization_failure/,
  );

  assert.equal(
    harness.readCommittedRow("reconciliation_audit_events", AUDIT_A_ID)?.id,
    AUDIT_A_ID,
  );
  const committedAudit = harness.readCommittedRow(
    "reconciliation_audit_events",
    AUDIT_A_ID,
  )!;
  assertFullRowEqual(committedAudit, auditSeed({ id: AUDIT_A_ID }));
  assert.equal(committedAudit.reconciliation_run_id, RUN_ID);
  assert.equal(committedAudit.run_candidate_id, CANDIDATE_A_ID);
  assert.equal(committedAudit.conversion_id, CONVERSION_A_ID);
  assert.equal(committedAudit.previous_status, "pending");
  assert.equal(committedAudit.next_status, "approved");
  assert.equal(committedAudit.decision, "approve");
  assert.equal(committedAudit.reason_code, "approved_eligible_by_match");
  assert.equal(committedAudit.network_commission, 1000);
  assert.equal(committedAudit.user_cashback, 600);
  assert.equal(committedAudit.platform_profit, 400);
  assert.equal(
    harness.readCommittedRow("conversions", CONVERSION_A_ID)?.status,
    "approved",
  );
  assert.equal(
    harness.readCommittedRow(
      "reconciliation_run_candidates",
      CANDIDATE_A_ID,
    )?.processing_outcome,
    "applied",
  );
  assert.equal(
    harness.readCommittedRow("reconciliation_runs", RUN_ID)?.status,
    "failed",
  );
  const recoveredFailedRun = harness.readCommittedRow("reconciliation_runs", RUN_ID)!;
  assert.equal(isTimestamp(recoveredFailedRun.failed_at), true);
  assertFullRowEqual(recoveredFailedRun, {
    ...BASE_RUN_SEED,
    status: "failed",
    failed_at: recoveredFailedRun.failed_at,
    failed_reason: "reconciliation_finalization_failed",
  });

  const retry = await commitReconciliationAsync(
    commitInput([]),
    harness.executor as ReconciliationExecutor,
  );
  assert.equal(retry.applied.length, 0);
  assert.equal(
    harness.countCommittedMutations(
      "reconciliation_audit_events",
      AUDIT_A_ID,
      "insert",
    ),
    1,
  );
  const finalizedRetryRun = harness.readCommittedRow("reconciliation_runs", RUN_ID)!;
  assert.equal(isTimestamp(finalizedRetryRun.committed_at), true);
  assertFullRowEqual(finalizedRetryRun, {
    ...BASE_RUN_SEED,
    status: "committed",
    failed_at: null,
    failed_reason: null,
    committed_at: finalizedRetryRun.committed_at,
  });
  assert.equal(harness.getTransactionOutcome(3), "committed");
  assert.equal(harness.remainingSteps(), 0);
});

test("Phase 20K direct commit: committed finalization with response failure is accepted without failed recovery", async () => {
  const harness = createScriptedReconciliationHarness([
    ...appliedCandidateSteps(),
    runUpdateStep({
      status: "committed",
      errorAfterMutation: new Error("forced_finalization_response_failure"),
    }),
    exactRunStateStep({
      match: /SELECT status FROM reconciliation_runs/i,
      status: "committed",
      includeRunFields: false,
    }),
    ...completedCandidateStateSteps("committed"),
  ]);

  const result = await commitReconciliationAsync(
    commitInput([{ runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID }]),
    harness.executor as ReconciliationExecutor,
  );
  assert.equal(result.applied.length, 1);
  const ambiguousCommittedRun = harness.readCommittedRow("reconciliation_runs", RUN_ID)!;
  assert.equal(isTimestamp(ambiguousCommittedRun.committed_at), true);
  assertFullRowEqual(ambiguousCommittedRun, {
    ...BASE_RUN_SEED,
    status: "committed",
    committed_at: ambiguousCommittedRun.committed_at,
  });
  assert.equal(
    harness.operations.some(
      (operation) =>
        operation.kind === "update" && /SET status = 'failed'/i.test(operation.sql),
    ),
    false,
  );

  const replay = await commitReconciliationAsync(
    commitInput([]),
    harness.executor as ReconciliationExecutor,
  );
  assert.equal(replay.applied.length, 0);
  assert.equal(replay.skipped[0]?.idempotentReplay, true);
  assert.equal(
    harness.countCommittedMutations("reconciliation_audit_events", AUDIT_A_ID, "insert"),
    1,
  );
  assert.equal(harness.remainingSteps(), 0);
});

test("Phase 20K direct commit: zero-row recovery CAS re-reads and accepts a concurrent committed state", async () => {
  const harness = createScriptedReconciliationHarness([
    ...appliedCandidateSteps(),
    runUpdateStep({
      status: "committed",
      affectedRows: 0,
    }),
    exactRunStateStep({
      match: /SELECT status FROM reconciliation_runs/i,
      status: "committing",
      includeRunFields: false,
    }),
    runUpdateStep({
      status: "failed",
      affectedRows: 0,
      expectedReason: "reconciliation_finalization_failed",
      concurrentStatus: "committed",
    }),
    exactRunStateStep({
      match: /SELECT status FROM reconciliation_runs/i,
      status: "committed",
      includeRunFields: false,
    }),
  ]);

  const result = await commitReconciliationAsync(
    commitInput([{ runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID }]),
    harness.executor as ReconciliationExecutor,
  );
  assert.equal(result.applied.length, 1);
  assertFullRowEqual(harness.readCommittedRow("reconciliation_runs", RUN_ID), {
    ...BASE_RUN_SEED,
    status: "committed",
    committed_at: CONCURRENT_AT,
  });
  assert.ok(
    harness
      .listExternalOperations()
      .some(
        (mutation) =>
          mutation.source === "external" &&
          mutation.relation === "reconciliation_runs" &&
          mutation.fields.status === "committed",
      ),
  );
  assert.equal(harness.remainingSteps(), 0);
});

test("Phase 20K direct commit: zero-row recovery CAS re-reads and preserves a concurrent failed state", async () => {
  const finalizationError = new Error("forced_concurrent_failed_finalization");
  const harness = createScriptedReconciliationHarness([
    ...appliedCandidateSteps(),
    runUpdateStep({
      status: "committed",
      affectedRows: 0,
      error: finalizationError,
    }),
    exactRunStateStep({
      match: /SELECT status FROM reconciliation_runs/i,
      status: "committing",
      includeRunFields: false,
    }),
    runUpdateStep({
      status: "failed",
      affectedRows: 0,
      expectedReason: "reconciliation_finalization_failed",
      concurrentStatus: "failed",
    }),
    exactRunStateStep({
      match: /SELECT status FROM reconciliation_runs/i,
      status: "failed",
      includeRunFields: false,
    }),
  ]);

  await assert.rejects(
    commitReconciliationAsync(
      commitInput([{ runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID }]),
      harness.executor as ReconciliationExecutor,
    ),
    (error) => error === finalizationError,
  );
  assertFullRowEqual(harness.readCommittedRow("reconciliation_runs", RUN_ID), {
    ...BASE_RUN_SEED,
    status: "failed",
    failed_at: CONCURRENT_AT,
    failed_reason: "concurrent_finalization_failure",
  });
  assert.equal(
    harness.countCommittedMutations("reconciliation_audit_events", AUDIT_A_ID, "insert"),
    1,
  );
  assert.equal(harness.remainingSteps(), 0);
});

test("Phase 20K direct commit: finalization and recovery-read failures produce a sanitized combined error", async () => {
  const harness = createScriptedReconciliationHarness([
    ...appliedCandidateSteps(),
    runUpdateStep({
      status: "committed",
      affectedRows: 0,
      error: new Error("raw_finalization_detail"),
    }),
    {
      match: /SELECT status FROM reconciliation_runs/i,
      error: new Error("raw_recovery_detail"),
    },
  ]);

  await assert.rejects(
    commitReconciliationAsync(
      commitInput([{ runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID }]),
      harness.executor as ReconciliationExecutor,
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.message, "reconciliation.repository: finalization recovery failed");
      assert.equal(error.errors.length, 2);
      assert.equal(String(error).includes("raw_finalization_detail"), false);
      assert.equal(String(error).includes("raw_recovery_detail"), false);
      return true;
    },
  );
  assert.equal(harness.readCommittedRow("conversions", CONVERSION_A_ID)?.status, "approved");
  assert.equal(
    harness.countCommittedMutations("reconciliation_audit_events", AUDIT_A_ID, "insert"),
    1,
  );
  assertFullRowEqual(harness.readCommittedRow("reconciliation_runs", RUN_ID), {
    ...BASE_RUN_SEED,
    status: "committing",
    failed_at: null,
    failed_reason: null,
  });
  assert.equal(harness.remainingSteps(), 0);
});

test("Phase 20K direct commit: finalization and recovery-CAS failures preserve durable candidate work", async () => {
  const harness = createScriptedReconciliationHarness([
    ...appliedCandidateSteps(),
    runUpdateStep({
      status: "committed",
      affectedRows: 0,
      error: new Error("raw_finalization_cas_detail"),
    }),
    exactRunStateStep({
      match: /SELECT status FROM reconciliation_runs/i,
      status: "committing",
      includeRunFields: false,
    }),
    runUpdateStep({
      status: "failed",
      affectedRows: 0,
      error: new Error("raw_recovery_cas_detail"),
      expectedReason: "reconciliation_finalization_failed",
    }),
  ]);

  await assert.rejects(
    commitReconciliationAsync(
      commitInput([{ runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID }]),
      harness.executor as ReconciliationExecutor,
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.message, "reconciliation.repository: finalization recovery failed");
      assert.equal(error.errors.length, 2);
      assert.equal(String(error).includes("raw_finalization_cas_detail"), false);
      assert.equal(String(error).includes("raw_recovery_cas_detail"), false);
      return true;
    },
  );
  assertFullRowEqual(
    harness.readCommittedRow("reconciliation_audit_events", AUDIT_A_ID),
    auditSeed({ id: AUDIT_A_ID }),
  );
  assert.equal(harness.readCommittedRow("conversions", CONVERSION_A_ID)?.status, "approved");
  assert.equal(
    harness.readCommittedRow("reconciliation_run_candidates", CANDIDATE_A_ID)
      ?.processing_outcome,
    "applied",
  );
  assertFullRowEqual(harness.readCommittedRow("reconciliation_runs", RUN_ID), {
    ...BASE_RUN_SEED,
    status: "committing",
    failed_at: null,
    failed_reason: null,
  });
  assert.equal(
    harness.countCommittedMutations("reconciliation_audit_events", AUDIT_A_ID, "insert"),
    1,
  );
  assert.equal(harness.remainingSteps(), 0);
});

test("Phase 20K direct commit: missing, excess, duplicate, and nonexistent audit mappings execute zero DML", async () => {
  const cases = [
    {
      plan: [] as const,
      steps: commitReadSteps(),
      code: "missing_audit_identifier",
    },
    {
      plan: [
        { runCandidateId: CANDIDATE_B_ID, auditEventId: AUDIT_B_ID },
      ],
      steps: commitReadSteps(),
      code: "missing_audit_identifier",
    },
    {
      plan: [
        { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
        { runCandidateId: CANDIDATE_B_ID, auditEventId: AUDIT_B_ID },
      ],
      steps: commitReadSteps(),
      code: "excess_audit_identifier",
    },
    {
      plan: [
        { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
        { runCandidateId: CANDIDATE_B_ID, auditEventId: AUDIT_A_ID },
      ],
      steps: [],
      code: "duplicate_identifier",
    },
    {
      plan: [
        { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_A_ID },
        { runCandidateId: CANDIDATE_A_ID, auditEventId: AUDIT_B_ID },
      ],
      steps: [],
      code: "duplicate_audit_candidate",
    },
  ];
  for (const item of cases) {
    const harness = createScriptedReconciliationHarness(item.steps);
    await assert.rejects(
      commitReconciliationAsync(
        commitInput(item.plan),
        harness.executor as ReconciliationExecutor,
      ),
      hasIdentifierError(item.code),
    );
    assert.equal(harness.dmlCount(), 0);
  }
});

test("Phase 20K direct commit: omitted plan keeps database-default audit ID insertion", async () => {
  const harness = createScriptedReconciliationHarness([
    ...legacyMultiCandidateReadSteps({
      runStatus: "draft",
      candidates: [BASE_COMMIT_CANDIDATE],
      stateBacked: true,
    }),
    runUpdateStep({ status: "committing" }),
    ...runtimeCandidateReadSteps({ stateBacked: true }),
    auditInsertStep({ auditId: AUDIT_A_ID, explicitId: false }),
    conversionUpdateStep({}),
    candidateOutcomeStep({
      candidateId: CANDIDATE_A_ID,
      outcome: "applied",
      reason: "approved_eligible_by_match",
    }),
    stateProjectionStep({
      match: /SELECT count\(\*\)::int AS pending/i,
      kind: "pending_count",
      identity: RUN_ID,
    }),
    runUpdateStep({ status: "committed" }),
  ]);
  const result = await commitReconciliationAsync(
    {
      actorUserId: ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: RUN_ID,
    },
    harness.executor as ReconciliationExecutor,
  );
  assert.equal(result.applied.length, 1);
  assert.equal("auditEventIdentifiers" in result, false);
  assert.deepEqual(harness.transactionEvents, ["begin", "commit"]);
  const auditInsert = harness.operations.find(
    (operation) =>
      operation.kind === "insert" &&
      /reconciliation_audit_events/i.test(operation.sql),
  )!;
  assert.doesNotMatch(
    auditInsert.sql,
    /reconciliation_audit_events\s*\(\s*id\s*,/i,
  );
  assert.equal(
    harness.readCommittedRow("reconciliation_audit_events", AUDIT_A_ID)?.id,
    AUDIT_A_ID,
  );
  const defaultIdAudit = harness.readCommittedRow(
    "reconciliation_audit_events",
    AUDIT_A_ID,
  )!;
  assertFullRowEqual(defaultIdAudit, auditSeed({ id: AUDIT_A_ID }));
  assert.equal(defaultIdAudit.reconciliation_run_id, RUN_ID);
  assert.equal(defaultIdAudit.run_candidate_id, CANDIDATE_A_ID);
  assert.equal(defaultIdAudit.conversion_id, CONVERSION_A_ID);
  assert.equal(defaultIdAudit.previous_status, "pending");
  assert.equal(defaultIdAudit.next_status, "approved");
  assert.equal(defaultIdAudit.decision, "approve");
  assert.equal(defaultIdAudit.reason_code, "approved_eligible_by_match");
  assert.equal(defaultIdAudit.network_commission, 1000);
  assert.equal(defaultIdAudit.user_cashback, 600);
  assert.equal(defaultIdAudit.platform_profit, 400);
  assert.equal(
    harness.readCommittedRow("conversions", CONVERSION_A_ID)?.status,
    "approved",
  );
  assert.equal(
    harness.readCommittedRow(
      "reconciliation_run_candidates",
      CANDIDATE_A_ID,
    )?.processing_outcome,
    "applied",
  );
  const omittedCandidate = harness.readCommittedRow(
    "reconciliation_run_candidates",
    CANDIDATE_A_ID,
  )!;
  assert.equal(isTimestamp(omittedCandidate.processing_completed_at), true);
  assertFullRowEqual(omittedCandidate, {
    ...candidateSeed(BASE_COMMIT_CANDIDATE),
    processing_outcome: "applied",
    processing_completed_at: omittedCandidate.processing_completed_at,
    processing_reason_code: "approved_eligible_by_match",
  });
  const omittedConversion = harness.readCommittedRow("conversions", CONVERSION_A_ID)!;
  assert.equal(isTimestamp(omittedConversion.updated_at), true);
  assertFullRowEqual(omittedConversion, {
    ...conversionSeed(BASE_LOCKED_CONVERSION, "order-a"),
    status: "approved",
    approved_at: omittedConversion.approved_at,
    updated_at: omittedConversion.updated_at,
  });
  assert.equal(harness.getTransactionOutcome(1), "committed");
  const candidateTransactionMutations = harness
    .listCommittedOperations()
    .filter((mutation) => mutation.transactionId === 1);
  assert.deepEqual(
    new Set(candidateTransactionMutations.map((mutation) => mutation.relation)),
    new Set([
      "reconciliation_audit_events",
      "conversions",
      "reconciliation_run_candidates",
    ]),
  );
  assert.equal(
    harness.operations.some(
      (operation) =>
        operation.transactionId === 1 &&
        /FROM reconciliation_runs[\s\S]*FOR UPDATE/i.test(operation.sql),
    ),
    false,
  );
  const omittedRun = harness.readCommittedRow("reconciliation_runs", RUN_ID)!;
  assert.equal(isTimestamp(omittedRun.committed_at), true);
  assertFullRowEqual(omittedRun, {
    ...BASE_RUN_SEED,
    status: "committed",
    committed_at: omittedRun.committed_at,
  });
  assert.equal(harness.remainingSteps(), 0);
});
