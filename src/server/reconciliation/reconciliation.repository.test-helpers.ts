/**
 * Phase 20K -- pure helpers exported from the reconciliation
 * repository for unit testing.
 *
 * This module keeps the pure identifier helpers and the
 * deterministic SQL harness used by the repository unit tests. The harness
 * records actual Drizzle SQL without opening a database connection.
 */

import type { ConversionStatus } from "@/types/affiliate";

import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle as proxyDrizzle } from "drizzle-orm/pg-proxy";
import type { SQL } from "drizzle-orm";

import { conversions } from "@/db/schema";
import { __testOnlyHelpers } from "./reconciliation.repository";

export function classifySourceEvidence(
  rows: ReadonlyArray<Record<string, unknown>>,
) {
  return __testOnlyHelpers.classifySourceEvidence(rows);
}
export type SourceEvidenceDbFields = ReturnType<
  typeof classifySourceEvidence
> extends Map<string, infer Row> ? Row : never;

export function parseStatus(value: string): ConversionStatus {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "payable" ||
    value === "paid" ||
    value === "rejected"
  ) {
    return value;
  }
  throw new Error(
    "reconciliation.repository: unknown status '" + value + "'",
  );
}

export function parseCommission(value: string | number | null): number {
  if (value === null) return 0;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(
        "reconciliation.repository: commission is not an integer VND amount",
      );
    }
    return value;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(
      "reconciliation.repository: commission is not an integer VND amount",
    );
  }
  return parsed;
}

const IDENTIFIER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_UUID_PATTERN_GLOBAL =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export type ReconciliationIdentifierPlanErrorCode =
  | "invalid_identifier_plan"
  | "invalid_run_identifier"
  | "invalid_candidate_identifier"
  | "invalid_candidate_identity"
  | "invalid_audit_identifier"
  | "duplicate_identifier"
  | "duplicate_candidate_identity"
  | "duplicate_audit_candidate"
  | "missing_candidate_identifier"
  | "excess_candidate_identifier"
  | "missing_audit_identifier"
  | "excess_audit_identifier"
  | "identifier_result_mismatch";

export class ReconciliationIdentifierPlanError extends Error {
  readonly code: ReconciliationIdentifierPlanErrorCode;

  constructor(code: ReconciliationIdentifierPlanErrorCode) {
    super(code);
    this.name = "ReconciliationIdentifierPlanError";
    this.code = code;
  }
}

export interface ReconciliationCandidateIdentity {
  readonly conversionId: string;
  readonly sourceConversionKey: string;
}

export interface ReconciliationCandidateIdentifier
  extends ReconciliationCandidateIdentity {
  readonly candidateId: string;
}

export interface DryRunReconciliationIdentifierPlan {
  readonly reconciliationRunId: string;
  readonly candidates: readonly ReconciliationCandidateIdentifier[];
}

export interface CommitReconciliationAuditIdentifier {
  readonly runCandidateId: string;
  readonly auditEventId: string;
}

export interface CommitReconciliationIdentifierPlan {
  readonly auditEvents: readonly CommitReconciliationAuditIdentifier[];
}

export interface ValidatedDryRunReconciliationIdentifierPlan {
  readonly reconciliationRunId: string;
  readonly candidates: readonly ReconciliationCandidateIdentifier[];
}

export interface ValidatedCommitReconciliationIdentifierPlan {
  readonly auditEvents: readonly CommitReconciliationAuditIdentifier[];
}

function normalizedUuid(
  value: unknown,
  code:
    | "invalid_run_identifier"
    | "invalid_candidate_identifier"
    | "invalid_candidate_identity"
    | "invalid_audit_identifier",
): string {
  if (typeof value !== "string" || !IDENTIFIER_UUID_PATTERN.test(value)) {
    throw new ReconciliationIdentifierPlanError(code);
  }
  return value.toLowerCase();
}

function normalizedCandidateIdentity(
  value: ReconciliationCandidateIdentity,
): ReconciliationCandidateIdentity {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof value.sourceConversionKey !== "string" ||
    value.sourceConversionKey.trim().length === 0
  ) {
    throw new ReconciliationIdentifierPlanError("invalid_candidate_identity");
  }
  return Object.freeze({
    conversionId: normalizedUuid(
      value.conversionId,
      "invalid_candidate_identity",
    ),
    sourceConversionKey: value.sourceConversionKey,
  });
}

function candidateIdentityKey(value: ReconciliationCandidateIdentity): string {
  return JSON.stringify([value.conversionId, value.sourceConversionKey]);
}

export function validateDryRunReconciliationIdentifierPlan(
  plan: DryRunReconciliationIdentifierPlan | undefined,
): ValidatedDryRunReconciliationIdentifierPlan | undefined {
  if (plan === undefined) return undefined;
  if (
    typeof plan !== "object" ||
    plan === null ||
    !Array.isArray(plan.candidates)
  ) {
    throw new ReconciliationIdentifierPlanError("invalid_identifier_plan");
  }

  const reconciliationRunId = normalizedUuid(
    plan.reconciliationRunId,
    "invalid_run_identifier",
  );
  const usedIds = new Set<string>([reconciliationRunId]);
  const usedIdentities = new Set<string>();
  const candidates: ReconciliationCandidateIdentifier[] = [];

  for (const candidate of plan.candidates) {
    const identity = normalizedCandidateIdentity(candidate);
    const candidateId = normalizedUuid(
      candidate?.candidateId,
      "invalid_candidate_identifier",
    );
    const identityKey = candidateIdentityKey(identity);
    if (usedIdentities.has(identityKey)) {
      throw new ReconciliationIdentifierPlanError(
        "duplicate_candidate_identity",
      );
    }
    if (usedIds.has(candidateId)) {
      throw new ReconciliationIdentifierPlanError("duplicate_identifier");
    }
    usedIdentities.add(identityKey);
    usedIds.add(candidateId);
    candidates.push(
      Object.freeze({
        ...identity,
        candidateId,
      }),
    );
  }

  candidates.sort((a, b) =>
    candidateIdentityKey(a).localeCompare(candidateIdentityKey(b)),
  );
  return Object.freeze({
    reconciliationRunId,
    candidates: Object.freeze(candidates),
  });
}

export function resolveDryRunReconciliationIdentifierPlan(
  plan: ValidatedDryRunReconciliationIdentifierPlan | undefined,
  candidates: readonly ReconciliationCandidateIdentity[],
): readonly ReconciliationCandidateIdentifier[] | undefined {
  if (plan === undefined) return undefined;

  const suppliedByIdentity = new Map(
    plan.candidates.map((candidate) => [candidateIdentityKey(candidate), candidate]),
  );
  const actualIdentities = new Set<string>();
  const resolved: ReconciliationCandidateIdentifier[] = [];

  for (const candidate of candidates) {
    const identity = normalizedCandidateIdentity(candidate);
    const identityKey = candidateIdentityKey(identity);
    if (actualIdentities.has(identityKey)) {
      throw new ReconciliationIdentifierPlanError(
        "duplicate_candidate_identity",
      );
    }
    actualIdentities.add(identityKey);
    const supplied = suppliedByIdentity.get(identityKey);
    if (!supplied) {
      throw new ReconciliationIdentifierPlanError(
        "missing_candidate_identifier",
      );
    }
    resolved.push(supplied);
  }

  if (actualIdentities.size !== suppliedByIdentity.size) {
    throw new ReconciliationIdentifierPlanError(
      "excess_candidate_identifier",
    );
  }
  return Object.freeze(
    [...resolved].sort((a, b) =>
      candidateIdentityKey(a).localeCompare(candidateIdentityKey(b)),
    ),
  );
}

export function validateCommitReconciliationIdentifierPlan(
  plan: CommitReconciliationIdentifierPlan | undefined,
): ValidatedCommitReconciliationIdentifierPlan | undefined {
  if (plan === undefined) return undefined;
  if (
    typeof plan !== "object" ||
    plan === null ||
    !Array.isArray(plan.auditEvents)
  ) {
    throw new ReconciliationIdentifierPlanError("invalid_identifier_plan");
  }

  const usedCandidateIds = new Set<string>();
  const usedIds = new Set<string>();
  const auditEvents: CommitReconciliationAuditIdentifier[] = [];
  for (const auditEvent of plan.auditEvents) {
    const runCandidateId = normalizedUuid(
      auditEvent?.runCandidateId,
      "invalid_candidate_identifier",
    );
    const auditEventId = normalizedUuid(
      auditEvent?.auditEventId,
      "invalid_audit_identifier",
    );
    if (usedCandidateIds.has(runCandidateId)) {
      throw new ReconciliationIdentifierPlanError("duplicate_audit_candidate");
    }
    if (runCandidateId === auditEventId || usedIds.has(auditEventId)) {
      throw new ReconciliationIdentifierPlanError("duplicate_identifier");
    }
    usedCandidateIds.add(runCandidateId);
    usedIds.add(auditEventId);
    auditEvents.push(Object.freeze({ runCandidateId, auditEventId }));
  }

  auditEvents.sort((a, b) => a.runCandidateId.localeCompare(b.runCandidateId));
  return Object.freeze({ auditEvents: Object.freeze(auditEvents) });
}

export function resolveCommitReconciliationIdentifierPlan(
  plan: ValidatedCommitReconciliationIdentifierPlan | undefined,
  runCandidateIds: readonly string[],
): readonly CommitReconciliationAuditIdentifier[] | undefined {
  if (plan === undefined) return undefined;

  const suppliedByCandidateId = new Map(
    plan.auditEvents.map((item) => [item.runCandidateId, item]),
  );
  const actualCandidateIds = new Set<string>();
  const resolved: CommitReconciliationAuditIdentifier[] = [];
  for (const candidateIdValue of runCandidateIds) {
    const candidateId = normalizedUuid(
      candidateIdValue,
      "invalid_candidate_identifier",
    );
    if (actualCandidateIds.has(candidateId)) {
      throw new ReconciliationIdentifierPlanError("duplicate_audit_candidate");
    }
    actualCandidateIds.add(candidateId);
    const supplied = suppliedByCandidateId.get(candidateId);
    if (!supplied) {
      throw new ReconciliationIdentifierPlanError("missing_audit_identifier");
    }
    resolved.push(supplied);
  }

  if (actualCandidateIds.size !== suppliedByCandidateId.size) {
    throw new ReconciliationIdentifierPlanError("excess_audit_identifier");
  }
  return Object.freeze(
    [...resolved].sort((a, b) =>
      a.runCandidateId.localeCompare(b.runCandidateId),
    ),
  );
}

export function assertReconciliationIdentifierResult(
  expected: string,
  actual: unknown,
): void {
  if (
    typeof actual !== "string" ||
    !IDENTIFIER_UUID_PATTERN.test(actual) ||
    expected.toLowerCase() !== actual.toLowerCase()
  ) {
    throw new ReconciliationIdentifierPlanError("identifier_result_mismatch");
  }
}

export function assertCandidateIdentifierResults(
  expected: readonly ReconciliationCandidateIdentifier[],
  actual: readonly ReconciliationCandidateIdentifier[],
): void {
  const expectedRows = expected.map((row) => JSON.stringify(row)).sort();
  const actualRows = actual.map((row) => JSON.stringify(row)).sort();
  if (
    expectedRows.length !== actualRows.length ||
    expectedRows.some((row, index) => row !== actualRows[index])
  ) {
    throw new ReconciliationIdentifierPlanError("identifier_result_mismatch");
  }
}

export function assertAuditIdentifierResults(
  expected: readonly CommitReconciliationAuditIdentifier[],
  actual: readonly CommitReconciliationAuditIdentifier[],
): void {
  const expectedRows = expected.map((row) => JSON.stringify(row)).sort();
  const actualRows = actual.map((row) => JSON.stringify(row)).sort();
  if (
    expectedRows.length !== actualRows.length ||
    expectedRows.some((row, index) => row !== actualRows[index])
  ) {
    throw new ReconciliationIdentifierPlanError("identifier_result_mismatch");
  }
}

export type ModeledRelation =
  | "conversions"
  | "reconciliation_audit_events"
  | "reconciliation_runs"
  | "reconciliation_run_candidates";

export type ModeledStateRelation = ModeledRelation | "source_evidence";

type DmlOperation = "insert" | "update" | "delete";

export interface ScriptedDmlExpectation {
  readonly operation: DmlOperation;
  readonly relation: ModeledRelation;
  readonly primaryKey?: string;
  readonly primaryKeys?: readonly string[];
  readonly affectedRows: number;
  readonly returnedRows?: readonly unknown[];
  readonly expectedFields?: Readonly<Record<string, unknown>>;
  readonly expectedFieldPredicates?: Readonly<
    Record<string, (value: unknown) => boolean>
  >;
  readonly expectedParameterValues?: readonly unknown[];
  readonly model?: boolean;
}

export type StateBackedSelectKind =
  | "run_lock"
  | "run_load"
  | "run_status"
  | "candidate_lock"
  | "candidate_load"
  | "candidate_outcomes"
  | "conversion_lock"
  | "audit_claim"
  | "source_evidence"
  | "pending_count";

export interface StateBackedSelectContract {
  readonly kind: StateBackedSelectKind;
  readonly identity: string | readonly string[];
  readonly expectedKeys?: readonly string[];
}

export interface ExternalCommittedMutationInput {
  readonly operation: "insert" | "update" | "delete";
  readonly relation: ModeledStateRelation;
  readonly primaryKey: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

export interface ScriptedSeedRow {
  readonly relation: ModeledStateRelation;
  readonly primaryKey: string;
  readonly row: Readonly<Record<string, unknown>>;
}

export interface ScriptedHarnessOptions {
  readonly seedRows?: readonly ScriptedSeedRow[];
  readonly databaseClockIso?: string;
}

export interface ScriptedSqlStep {
  readonly match: RegExp;
  readonly rows?: readonly unknown[];
  readonly stateSelect?: StateBackedSelectContract;
  readonly dml?: ScriptedDmlExpectation;
  readonly method?: "all" | "execute";
  readonly error?: Error;
  readonly errorAfterMutation?: Error;
  readonly onMatch?: () => void;
  readonly externalMutationsBefore?: readonly ExternalCommittedMutationInput[];
  readonly externalMutationsAfter?: readonly ExternalCommittedMutationInput[];
}

export interface CapturedSqlOperation {
  readonly operationId: number;
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly method: "all" | "execute";
  readonly kind: "select" | "insert" | "update" | "delete" | "other";
  readonly relation: ModeledRelation | null;
  readonly transactionId: number | null;
}

export interface ModeledMutation {
  readonly operationId: number;
  readonly operation: "insert" | "update" | "delete";
  readonly relation: ModeledStateRelation;
  readonly primaryKey: string | null;
  readonly identities: readonly string[];
  readonly fields: Readonly<Record<string, unknown>>;
  readonly defaultFields: Readonly<Record<string, unknown>>;
  readonly transactionId: number | null;
  readonly succeeded: boolean;
  readonly source: "repository" | "external";
  readonly disposition: "committed" | "rolled_back" | "failed";
}

export interface ScriptedStateView {
  readonly currentTransactionId: number | null;
  listCommittedOperations(): readonly ModeledMutation[];
  listRolledBackOperations(): readonly ModeledMutation[];
  listFailedOperations(): readonly ModeledMutation[];
  listExternalOperations(): readonly ModeledMutation[];
  readCommittedRow(
    relation: ModeledStateRelation,
    key: string,
  ): Readonly<Record<string, unknown>> | undefined;
  readCurrentRow(
    relation: ModeledStateRelation,
    key: string,
  ): Readonly<Record<string, unknown>> | undefined;
  countCommittedMutations(
    relation: ModeledRelation,
    key: string,
    operation?: ModeledMutation["operation"],
  ): number;
  getTransactionOutcome(
    transactionId: number,
  ): "active" | "committed" | "rolled_back" | undefined;
}

export interface ScriptedReconciliationHarness {
  readonly database: unknown;
  readonly executor: {
    transaction<T>(fn: (tx: {
      execute(query: SQL): Promise<unknown>;
      updateConversions(
        payload: Record<string, unknown>,
        where: SQL<unknown> | undefined,
      ): Promise<unknown>;
    }) => Promise<T>): Promise<T>;
    execute(query: SQL): Promise<unknown>;
  };
  readonly operations: readonly CapturedSqlOperation[];
  readonly transactionEvents: readonly ("begin" | "commit" | "rollback")[];
  readonly remainingSteps: () => number;
  readonly assertComplete: () => void;
  readonly dmlCount: () => number;
  readonly listCommittedOperations: () => readonly ModeledMutation[];
  readonly listRolledBackOperations: () => readonly ModeledMutation[];
  readonly listFailedOperations: () => readonly ModeledMutation[];
  readonly listExternalOperations: () => readonly ModeledMutation[];
  readonly listSeededRows: () => readonly ScriptedSeedRow[];
  readonly readCommittedRow: ScriptedStateView["readCommittedRow"];
  readonly countCommittedMutations: ScriptedStateView["countCommittedMutations"];
  readonly getTransactionOutcome: ScriptedStateView["getTransactionOutcome"];
}

interface PendingMutation {
  readonly operationId: number;
  readonly operation: ModeledMutation["operation"];
  readonly relation: ModeledStateRelation;
  readonly primaryKey: string | null;
  readonly identities: readonly string[];
  readonly fields: Readonly<Record<string, unknown>>;
  readonly defaultFields: Readonly<Record<string, unknown>>;
  readonly transactionId: number | null;
  readonly succeeded: boolean;
  readonly source: "repository" | "external";
}

function immutableSnapshot(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => immutableSnapshot(item)));
  }
  if (typeof value === "object") {
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const [key, item] of Object.entries(value)) {
      snapshot[key] = immutableSnapshot(item);
    }
    return Object.freeze(snapshot);
  }
  return String(value);
}

function frozenRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return immutableSnapshot(value) as Readonly<Record<string, unknown>>;
}

const MODELED_RELATIONS: readonly ModeledRelation[] = Object.freeze([
  "conversions",
  "reconciliation_audit_events",
  "reconciliation_runs",
  "reconciliation_run_candidates",
]);

const MODELED_STATE_RELATIONS: readonly ModeledStateRelation[] = Object.freeze([
  ...MODELED_RELATIONS,
  "source_evidence",
]);

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATABASE_DEFAULT_CLOCK_ISO = "2025-01-01T00:00:00.000Z";

function normalizeIdentifier(value: string): string {
  return value.replaceAll('"', "").split(".").at(-1)!.toLowerCase();
}

function parseDmlTarget(sqlText: string): Readonly<{
  operation: DmlOperation;
  relation: ModeledRelation;
}> | undefined {
  const match = /^\s*(insert\s+into|update|delete\s+from)\s+((?:"?[a-z_][a-z0-9_]*"?\.)?"?[a-z_][a-z0-9_]*"?)/i.exec(
    sqlText,
  );
  if (!match) return undefined;
  const operation = match[1]!.toLowerCase().startsWith("insert")
    ? "insert"
    : match[1]!.toLowerCase().startsWith("delete")
      ? "delete"
      : "update";
  const relation = normalizeIdentifier(match[2]!) as ModeledRelation;
  if (!MODELED_RELATIONS.includes(relation)) {
    throw new Error("unsupported_dml_relation:" + relation);
  }
  return Object.freeze({ operation, relation });
}

function splitSqlList(value: string): readonly string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (quote) {
      if (char === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return Object.freeze(parts);
}

function parameterValue(expression: string, params: readonly unknown[]): unknown {
  const trimmed = expression.trim();
  const parameter = /^\$(\d+)(?:::[a-z_][a-z0-9_]*(?:\[\])?)?$/i.exec(trimmed);
  if (parameter) {
    const index = Number(parameter[1]) - 1;
    if (index < 0 || index >= params.length) throw new Error("invalid_sql_parameter_index");
    return params[index];
  }
  const literal = /^'([^']*)'(?:::[a-z_][a-z0-9_]*)?$/i.exec(trimmed);
  if (literal) return literal[1];
  if (/^null$/i.test(trimmed)) return null;
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
  throw new Error("unsupported_sql_value_expression:" + trimmed);
}

function evaluateUpdateExpression(
  expression: string,
  params: readonly unknown[],
  currentRow: Readonly<Record<string, unknown>>,
): unknown {
  const trimmed = expression.trim();
  if (/^(null|true|false)$/i.test(trimmed) || /^'[^']*'(?:::[a-z_][a-z0-9_]*)?$/i.test(trimmed) ||
      /^\$\d+(?:::[a-z_][a-z0-9_]*(?:\[\])?)?$/i.test(trimmed)) {
    return parameterValue(trimmed, params);
  }
  const directColumn = /^(?:(?:"?[a-z_][a-z0-9_]*"?)\.)?"?([a-z_][a-z0-9_]*)"?$/i.exec(
    trimmed,
  );
  if (directColumn) return currentRow[directColumn[1]!.toLowerCase()];
  if (/^now\(\)$/i.test(trimmed)) return DATABASE_DEFAULT_CLOCK_ISO;

  const coalesceParameter = /^coalesce\(\s*((?:(?:"?[a-z_][a-z0-9_]*"?)\.)?"?[a-z_][a-z0-9_]*"?)\s*,\s*(\$\d+(?:::[a-z_][a-z0-9_]*)?)\s*\)$/i.exec(
    trimmed,
  );
  if (coalesceParameter) {
    const existing = currentRow[normalizeIdentifier(coalesceParameter[1]!)];
    return existing ?? parameterValue(coalesceParameter[2]!, params);
  }

  const coalesceNullIf = /^coalesce\(\s*nullif\(\s*((?:(?:"?[a-z_][a-z0-9_]*"?)\.)?"?[a-z_][a-z0-9_]*"?)\s*,\s*'([^']*)'\s*\)\s*,\s*'([^']*)'(?:::[a-z_][a-z0-9_]*)?\s*\)$/i.exec(
    trimmed,
  );
  if (coalesceNullIf) {
    const existing = currentRow[normalizeIdentifier(coalesceNullIf[1]!)];
    const retained = existing === coalesceNullIf[2] ? null : existing;
    return retained ?? coalesceNullIf[3]!;
  }

  return parameterValue(trimmed, params);
}

function extractInsertFields(
  sqlText: string,
  params: readonly unknown[],
): Readonly<Record<string, unknown>> {
  const match = /\(([^()]*)\)\s*values\s*\(([^()]*)\)/i.exec(sqlText);
  if (!match) return Object.freeze(Object.create(null));
  const columns = splitSqlList(match[1]!).map(normalizeIdentifier);
  const values = splitSqlList(match[2]!);
  if (columns.length !== values.length) throw new Error("invalid_insert_shape");
  const fields = Object.create(null) as Record<string, unknown>;
  for (let index = 0; index < columns.length; index += 1) {
    fields[columns[index]!] = parameterValue(values[index]!, params);
  }
  return frozenRecord(fields);
}

function extractUpdateFields(
  sqlText: string,
  params: readonly unknown[],
  currentRow: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const match = /\bset\b([\s\S]*?)\bwhere\b/i.exec(sqlText);
  if (!match) throw new Error("invalid_update_shape");
  const fields = Object.create(null) as Record<string, unknown>;
  for (const assignment of splitSqlList(match[1]!)) {
    const assignmentMatch = /^((?:"?[a-z_][a-z0-9_]*"?\.)?"?[a-z_][a-z0-9_]*"?)\s*=\s*([\s\S]+)$/i.exec(
      assignment,
    );
    if (!assignmentMatch) throw new Error("unsupported_update_assignment:" + assignment);
    fields[normalizeIdentifier(assignmentMatch[1]!)] = evaluateUpdateExpression(
      assignmentMatch[2]!,
      params,
      currentRow,
    );
  }
  return frozenRecord(fields);
}

function extractWherePrimaryKey(
  sqlText: string,
  params: readonly unknown[],
): string | undefined {
  const where = /\bwhere\b([\s\S]*?)(?:\breturning\b|$)/i.exec(sqlText)?.[1];
  if (!where) return undefined;
  const matches = [
    ...where.matchAll(
      /(?:(?:"?[a-z_][a-z0-9_]*"?)\.)?"?id"?\s*=\s*\$(\d+)/gi,
    ),
  ];
  if (matches.length !== 1) return undefined;
  const value = params[Number(matches[0]![1]) - 1];
  return typeof value === "string" ? value.toLowerCase() : undefined;
}

function returnedIdentity(row: unknown): string | undefined {
  if (Array.isArray(row)) {
    const id = row[0];
    return typeof id === "string" ? id.toLowerCase() : undefined;
  }
  if (typeof row === "object" && row !== null && "id" in row) {
    const id = (row as { id?: unknown }).id;
    return typeof id === "string" ? id.toLowerCase() : undefined;
  }
  return undefined;
}

function sameValue(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(immutableSnapshot(actual)) === JSON.stringify(immutableSnapshot(expected));
}

interface ProjectionDescriptor {
  readonly alias: string;
  readonly sourceField?: string;
  readonly source: "row" | "conversion" | "evidence" | "aggregate";
  readonly transform: "identity" | "text" | "count";
  readonly pattern: RegExp;
}

function projection(
  alias: string,
  options: Partial<Omit<ProjectionDescriptor, "alias">> = {},
): ProjectionDescriptor {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Object.freeze({
    alias,
    sourceField: options.sourceField ?? alias,
    source: options.source ?? "row",
    transform: options.transform ?? "identity",
    pattern: options.pattern ?? new RegExp("^" + escaped + "(?:\\s+as\\s+" + escaped + ")?$", "i"),
  });
}

const RUN_PROJECTION = Object.freeze([
  projection("id"),
  projection("network"),
  projection("status"),
  projection("policy_version"),
]);
const RUN_STATUS_PROJECTION = Object.freeze([projection("status")]);
const CANDIDATE_PROJECTION = Object.freeze([
  projection("id"),
  projection("conversion_id"),
  projection("network"),
  projection("source_conversion_key"),
  projection("expected_previous_status"),
  projection("intended_next_status"),
  projection("planned_reason_code"),
  projection("planned_money_network_commission", {
    transform: "text",
    pattern: /^planned_money_network_commission::text\s+as\s+planned_money_network_commission$/i,
  }),
  projection("planned_cashback_share_bps"),
  projection("planned_money_user_cashback", {
    transform: "text",
    pattern: /^planned_money_user_cashback::text\s+as\s+planned_money_user_cashback$/i,
  }),
  projection("planned_money_platform_profit", {
    transform: "text",
    pattern: /^planned_money_platform_profit::text\s+as\s+planned_money_platform_profit$/i,
  }),
  projection("planned_idempotency_key"),
  projection("provenance_fingerprint"),
]);
const CANDIDATE_LOCK_PROJECTION = Object.freeze([
  ...CANDIDATE_PROJECTION,
  projection("processing_outcome"),
]);
const CANDIDATE_OUTCOME_PROJECTION = Object.freeze([
  projection("id", { pattern: /^id::text\s+as\s+id$/i, transform: "text" }),
  projection("processing_outcome"),
]);
const CONVERSION_LOCK_PROJECTION = Object.freeze([
  projection("id"),
  projection("status"),
  projection("network"),
  projection("network_commission", {
    transform: "text",
    pattern: /^network_commission::text\s+as\s+network_commission$/i,
  }),
  projection("cashback_share_bps_snapshot"),
  projection("user_cashback", {
    transform: "text",
    pattern: /^user_cashback::text\s+as\s+user_cashback$/i,
  }),
  projection("platform_profit", {
    transform: "text",
    pattern: /^platform_profit::text\s+as\s+platform_profit$/i,
  }),
  projection("validation_status"),
  projection("settlement_status"),
  projection("source_conversion_key"),
  projection("ingestion_event_id"),
  projection("publisher_id"),
  projection("tracking_link_id"),
  projection("occurred_at"),
]);
const AUDIT_CLAIM_PROJECTION = Object.freeze([projection("id")]);
const PENDING_COUNT_PROJECTION = Object.freeze([
  projection("pending", {
    source: "aggregate",
    transform: "count",
    pattern: /^count\(\*\)::int\s+as\s+pending$/i,
  }),
]);
const SOURCE_EVIDENCE_PROJECTION = Object.freeze([
  projection("conversion_id", { source: "conversion", sourceField: "id", pattern: /^c\.id\s+as\s+conversion_id$/i }),
  projection("network", { source: "conversion", pattern: /^c\.network\s+as\s+network$/i }),
  projection("external_order_id", { source: "conversion", pattern: /^c\.external_order_id\s+as\s+external_order_id$/i }),
  projection("source_conversion_key", { source: "conversion", pattern: /^c\.source_conversion_key\s+as\s+source_conversion_key$/i }),
  projection("publisher_id", { source: "conversion", pattern: /^c\.publisher_id\s+as\s+publisher_id$/i }),
  projection("tracking_link_id", { source: "conversion", pattern: /^c\.tracking_link_id\s+as\s+tracking_link_id$/i }),
  projection("validation_status", { source: "conversion", pattern: /^c\.validation_status\s+as\s+validation_status$/i }),
  projection("settlement_status", { source: "conversion", pattern: /^c\.settlement_status\s+as\s+settlement_status$/i }),
  projection("processing_status", { source: "evidence", pattern: /^ev\.processing_status\s+as\s+processing_status$/i }),
  projection("csv_source", { source: "evidence", pattern: /^csv\.source\s+as\s+csv_source$/i }),
  projection("csv_order_status", { source: "evidence", pattern: /^csv\.order_status\s+as\s+csv_order_status$/i }),
  projection("publisher_exists", { source: "evidence", pattern: /^exists\s*\([\s\S]*profiles[\s\S]*\)\s+as\s+publisher_exists$/i }),
  projection("tracking_link_exists", { source: "evidence", pattern: /^exists\s*\([\s\S]*tracking_links[\s\S]*\)\s+as\s+tracking_link_exists$/i }),
  projection("tracking_link_publisher_match", { source: "evidence", pattern: /^exists\s*\([\s\S]*tracking_links[\s\S]*publisher_id[\s\S]*\)\s+as\s+tracking_link_publisher_match$/i }),
  projection("external_order_collision_count", { source: "evidence", pattern: /^\([\s\S]*count\(\*\)::int[\s\S]*external_order_id[\s\S]*\)\s+as\s+external_order_collision_count$/i }),
  projection("source_conversion_key_collision_count", { source: "evidence", pattern: /^\([\s\S]*count\(\*\)::int[\s\S]*source_conversion_key[\s\S]*\)\s+as\s+source_conversion_key_collision_count$/i }),
]);

function stripSqlComments(value: string): string {
  return value.replace(/--[^\r\n]*/g, " ");
}

function normalizedSqlFragment(value: string): string {
  return stripSqlComments(value)
    .replaceAll('"', "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function topLevelKeyword(value: string, keyword: string, start = 0): number {
  const lower = value.toLowerCase();
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = start; index <= lower.length - keyword.length; index += 1) {
    const char = lower[index]!;
    if (quote) {
      if (char === quote && lower[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      continue;
    }
    if (depth !== 0 || !lower.startsWith(keyword, index)) continue;
    const before = index === 0 ? " " : lower[index - 1]!;
    const after = lower[index + keyword.length] ?? " ";
    if (!/[a-z0-9_]/.test(before) && !/[a-z0-9_]/.test(after)) return index;
  }
  return -1;
}

function selectShape(sqlText: string): Readonly<{
  projectionExpressions: readonly string[];
  fromRelation: string;
  joins: readonly string[];
  where: string;
  orderBy: string;
  hasForUpdate: boolean;
}> {
  const sql = stripSqlComments(sqlText).trim();
  if (!/^select\b/i.test(sql)) throw new Error("state_select_requires_select");
  const fromIndex = topLevelKeyword(sql, "from", 6);
  if (fromIndex < 0) throw new Error("invalid_select_from");
  const projectionExpressions = splitSqlList(sql.slice(6, fromIndex)).map(
    normalizedSqlFragment,
  );
  const afterFrom = sql.slice(fromIndex + 4);
  const relationMatch = /^\s*((?:"?[a-z_][a-z0-9_]*"?\.)?"?[a-z_][a-z0-9_]*"?)/i.exec(afterFrom);
  if (!relationMatch) throw new Error("invalid_select_relation");
  const fromRelation = normalizeIdentifier(relationMatch[1]!);
  const whereIndex = topLevelKeyword(sql, "where", fromIndex + 4);
  const orderIndex = topLevelKeyword(sql, "order by", fromIndex + 4);
  const limitIndex = topLevelKeyword(sql, "limit", fromIndex + 4);
  const forIndex = topLevelKeyword(sql, "for update", fromIndex + 4);
  const end = sql.length;
  const clauseEnd = (...values: number[]) => Math.min(...values.filter((value) => value >= 0), end);
  const where = whereIndex < 0
    ? ""
    : normalizedSqlFragment(sql.slice(whereIndex + 5, clauseEnd(orderIndex, limitIndex, forIndex)));
  const orderBy = orderIndex < 0
    ? ""
    : normalizedSqlFragment(sql.slice(orderIndex + 8, clauseEnd(limitIndex, forIndex)));
  const joins = [...sql.slice(fromIndex, whereIndex < 0 ? end : whereIndex).matchAll(
    /\bjoin\s+((?:(?:"?[a-z_][a-z0-9_]*"?)\.)?"?[a-z_][a-z0-9_]*"?)/gi,
  )].map((match) => normalizeIdentifier(match[1]!));
  return Object.freeze({
    projectionExpressions: Object.freeze(projectionExpressions),
    fromRelation,
    joins: Object.freeze(joins),
    where,
    orderBy,
    hasForUpdate: forIndex >= 0,
  });
}

function assertExpectedFields(
  actual: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>> | undefined,
): void {
  if (!expected) return;
  for (const [key, value] of Object.entries(expected)) {
    if (!sameValue(actual[key], value)) {
      throw new Error("unexpected_dml_field:" + key);
    }
  }
}

function assertCompleteExpectedFields(
  actual: Readonly<Record<string, unknown>>,
  expectation: ScriptedDmlExpectation,
): void {
  const expected = expectation.expectedFields ?? Object.freeze({});
  const predicates = expectation.expectedFieldPredicates ?? Object.freeze({});
  for (const field of Object.keys(actual)) {
    if (!(field in expected) && !(field in predicates)) {
      throw new Error("unasserted_dml_field:" + field);
    }
  }
  assertExpectedFields(actual, expected);
  for (const [field, predicate] of Object.entries(predicates) as Array<
    [string, (value: unknown) => boolean]
  >) {
    if (!(field in actual)) throw new Error("missing_dml_field:" + field);
    if (!predicate(actual[field])) {
      throw new Error("unexpected_dml_field:" + field);
    }
  }
}

function buildPendingMutation(args: {
  readonly operation: CapturedSqlOperation;
  readonly expectation: ScriptedDmlExpectation;
  readonly returnedRows: readonly unknown[];
  readonly succeeded: boolean;
  readonly currentRow: Readonly<Record<string, unknown>>;
  readonly databaseClockIso: string;
}): PendingMutation | undefined {
  if (args.expectation.model === false || args.expectation.affectedRows === 0) {
    return undefined;
  }
  if (args.expectation.affectedRows !== 1) {
    throw new Error("unsupported_modeled_affected_rows");
  }
  const fields =
    args.expectation.operation === "insert"
      ? extractInsertFields(args.operation.sql, args.operation.params)
      : args.expectation.operation === "update"
        ? extractUpdateFields(
            args.operation.sql,
            args.operation.params,
            args.currentRow,
          )
        : Object.freeze(Object.create(null)) as Readonly<Record<string, unknown>>;
  const primaryKey =
    args.expectation.operation === "insert"
      ? typeof fields.id === "string"
        ? fields.id.toLowerCase()
        : returnedIdentity(args.returnedRows[0])
      : extractWherePrimaryKey(args.operation.sql, args.operation.params);
  if (!primaryKey || primaryKey !== args.expectation.primaryKey?.toLowerCase()) {
    throw new Error("unexpected_dml_primary_key");
  }
  assertCompleteExpectedFields(fields, args.expectation);
  const defaultFields = Object.create(null) as Record<string, unknown>;
  if (
    args.succeeded &&
    args.expectation.operation === "insert" &&
    args.expectation.relation === "reconciliation_audit_events"
  ) {
    defaultFields.created_at = args.databaseClockIso;
  }
  const completeFields = frozenRecord({
    ...fields,
    ...defaultFields,
    id: primaryKey,
  });
  if (args.succeeded && args.expectation.relation === "reconciliation_audit_events") {
    const required = [
      "id", "network", "source_conversion_key", "idempotency_key",
      "conversion_id", "previous_status", "next_status", "decision",
      "reason_code", "human_reason", "network_commission", "user_cashback",
      "platform_profit", "actor_kind", "actor_user_id", "actor_role",
      "reconciliation_run_id", "run_candidate_id", "created_at",
    ];
    for (const field of required) {
      if (!(field in completeFields)) throw new Error("incomplete_audit_current_row:" + field);
    }
  }
  return Object.freeze({
    operationId: args.operation.operationId,
    operation: args.expectation.operation,
    relation: args.expectation.relation,
    primaryKey,
    identities: Object.freeze([primaryKey]),
    fields: completeFields,
    defaultFields: frozenRecord(defaultFields),
    transactionId: args.operation.transactionId,
    succeeded: args.succeeded,
    source: "repository" as const,
  });
}

function finalizedMutation(
  mutation: PendingMutation,
  disposition: ModeledMutation["disposition"],
): ModeledMutation {
  return Object.freeze({ ...mutation, disposition });
}

function sqlOperationKind(sqlText: string): CapturedSqlOperation["kind"] {
  const keyword = sqlText.trimStart().split(/\s+/, 1)[0]?.toLowerCase();
  if (
    keyword === "select" ||
    keyword === "insert" ||
    keyword === "update" ||
    keyword === "delete"
  ) {
    return keyword;
  }
  return "other";
}

export function createScriptedReconciliationHarness(
  scriptedSteps: readonly ScriptedSqlStep[],
  options: ScriptedHarnessOptions = {},
): ScriptedReconciliationHarness {
  // This models SQL durability only. Scripted rows still drive every business
  // classification, reason code, money decision, and lifecycle branch through
  // the real repository implementation.
  const steps = [...scriptedSteps];
  const operations: CapturedSqlOperation[] = [];
  const transactionEvents: Array<"begin" | "commit" | "rollback"> = [];
  const committedMutations: ModeledMutation[] = [];
  const rolledBackMutations: ModeledMutation[] = [];
  const failedMutations: ModeledMutation[] = [];
  const externalMutations: ModeledMutation[] = [];
  const seededRows: ScriptedSeedRow[] = [];
  const committedRows: Record<ModeledStateRelation, Record<string, Record<string, unknown>>> = {
    conversions: Object.create(null) as Record<string, Record<string, unknown>>,
    reconciliation_audit_events: Object.create(null) as Record<string, Record<string, unknown>>,
    reconciliation_runs: Object.create(null) as Record<string, Record<string, unknown>>,
    reconciliation_run_candidates: Object.create(null) as Record<string, Record<string, unknown>>,
    source_evidence: Object.create(null) as Record<string, Record<string, unknown>>,
  };
  const transactionOutcomes: Record<
    number,
    "active" | "committed" | "rolled_back"
  > = Object.create(null) as Record<
    number,
    "active" | "committed" | "rolled_back"
  >;
  let nextTransactionId = 1;
  let activeTransactionId: number | null = null;
  let activeMutations: PendingMutation[] | null = null;

  const databaseClockIso = options.databaseClockIso ?? DATABASE_DEFAULT_CLOCK_ISO;
  if (Number.isNaN(Date.parse(databaseClockIso))) {
    throw new Error("invalid_database_clock");
  }

  const seedFields: Readonly<Record<ModeledStateRelation, readonly string[]>> =
    Object.freeze({
      reconciliation_runs: Object.freeze([
        "id", "network", "created_by_user_id", "created_by_role",
        "policy_version", "candidate_fingerprint", "scope",
        "scope_candidate_count", "status", "failed_at", "failed_reason",
        "created_at", "committed_at",
      ]),
      reconciliation_run_candidates: Object.freeze([
        "id", "run_id", "conversion_id", "source_conversion_key", "network",
        "expected_previous_status", "intended_next_status", "planned_reason_code",
        "planned_money_network_commission", "planned_cashback_share_bps",
        "planned_money_user_cashback",
        "planned_money_platform_profit", "planned_idempotency_key",
        "provenance_fingerprint", "processing_outcome",
        "processing_completed_at", "processing_reason_code", "created_at",
      ]),
      conversions: Object.freeze([
        "id", "network", "external_order_id", "publisher_id", "advertiser_id",
        "campaign_id", "offer_id", "tracking_link_id", "status", "order_amount",
        "network_commission", "cashback_share_bps_snapshot", "user_cashback",
        "platform_profit", "occurred_at",
        "approved_at", "payable_at", "paid_at", "rejected_at", "rejected_reason",
        "source_conversion_key", "validation_status", "settlement_status",
        "ingestion_event_id", "created_at", "updated_at",
      ]),
      reconciliation_audit_events: Object.freeze([
        "id", "network", "source_conversion_key", "idempotency_key",
        "conversion_id", "previous_status", "next_status", "decision",
        "reason_code", "human_reason", "network_commission",
        "cashback_share_bps_snapshot", "user_cashback",
        "platform_profit", "actor_kind", "actor_user_id", "actor_role",
        "reconciliation_run_id", "run_candidate_id", "created_at",
      ]),
      source_evidence: Object.freeze([
        "conversion_id", "processing_status", "csv_source", "csv_order_status",
        "publisher_exists", "tracking_link_exists",
        "tracking_link_publisher_match", "external_order_collision_count",
        "source_conversion_key_collision_count",
      ]),
    });

  function requireUuid(row: Readonly<Record<string, unknown>>, field: string, nullable = false): void {
    const value = row[field];
    if (value === null && nullable) return;
    if (typeof value !== "string" || !IDENTIFIER_UUID_PATTERN.test(value)) {
      throw new Error("invalid_seed_uuid:" + field);
    }
  }

  function requireTimestamp(row: Readonly<Record<string, unknown>>, field: string, nullable = false): void {
    const value = row[field];
    if (value === null && nullable) return;
    const time = value instanceof Date
      ? value.getTime()
      : typeof value === "string"
        ? Date.parse(value)
        : Number.NaN;
    if (Number.isNaN(time)) throw new Error("invalid_seed_timestamp:" + field);
  }

  function requireText(row: Readonly<Record<string, unknown>>, field: string, nullable = false): void {
    const value = row[field];
    if (value === null && nullable) return;
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("invalid_seed_text:" + field);
    }
  }

  function requireEnum(
    row: Readonly<Record<string, unknown>>,
    field: string,
    values: readonly string[],
    nullable = false,
  ): void {
    const value = row[field];
    if (value === null && nullable) return;
    if (typeof value !== "string" || !values.includes(value)) {
      throw new Error("invalid_seed_status:" + field);
    }
  }

  function requireInteger(
    row: Readonly<Record<string, unknown>>,
    field: string,
    options: { nullable?: boolean; positive?: boolean } = {},
  ): void {
    const value = row[field];
    if (value === null && options.nullable) return;
    if (typeof value !== "number" || !Number.isSafeInteger(value) ||
        (options.positive ? value <= 0 : value < 0)) {
      throw new Error("invalid_seed_money:" + field);
    }
  }

  function requireSha(row: Readonly<Record<string, unknown>>, field: string, nullable = false): void {
    const value = row[field];
    if (value === null && nullable) return;
    if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
      throw new Error("invalid_seed_sha256:" + field);
    }
  }

  function validateScope(value: unknown): void {
    if (value === null) return;
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid_seed_scope");
    }
    const scope = value as Record<string, unknown>;
    const allowed = [
      "ingestionEventIds", "sourceConversionKeys", "explicitConversionIds",
      "occurredAfter", "occurredBefore",
    ];
    for (const key of Object.keys(scope)) {
      if (!allowed.includes(key)) throw new Error("invalid_seed_scope_field:" + key);
    }
    for (const key of ["ingestionEventIds", "explicitConversionIds"]) {
      if (scope[key] !== undefined &&
          (!Array.isArray(scope[key]) || scope[key].some((item) =>
            typeof item !== "string" || !IDENTIFIER_UUID_PATTERN.test(item)))) {
        throw new Error("invalid_seed_scope:" + key);
      }
    }
    if (scope.sourceConversionKeys !== undefined &&
        (!Array.isArray(scope.sourceConversionKeys) ||
         scope.sourceConversionKeys.some((item) => typeof item !== "string" || !SHA256_PATTERN.test(item)))) {
      throw new Error("invalid_seed_scope:sourceConversionKeys");
    }
    for (const key of ["occurredAfter", "occurredBefore"]) {
      if (scope[key] !== undefined &&
          (typeof scope[key] !== "string" || Number.isNaN(Date.parse(scope[key] as string)))) {
        throw new Error("invalid_seed_scope:" + key);
      }
    }
  }

  function validateSeedRow(
    relation: ModeledStateRelation,
    row: Readonly<Record<string, unknown>>,
  ): void {
    if (relation === "reconciliation_runs") {
      requireUuid(row, "id");
      requireEnum(row, "network", ["shopee", "manual"]);
      requireUuid(row, "created_by_user_id");
      requireEnum(row, "created_by_role", ["admin", "super_admin"]);
      requireInteger(row, "policy_version", { positive: true });
      requireText(row, "candidate_fingerprint");
      validateScope(row.scope);
      requireInteger(row, "scope_candidate_count", { nullable: true });
      requireEnum(row, "status", ["draft", "committing", "committed", "failed", "superseded"]);
      requireTimestamp(row, "failed_at", true);
      requireText(row, "failed_reason", true);
      requireTimestamp(row, "created_at");
      requireTimestamp(row, "committed_at", true);
      return;
    }
    if (relation === "reconciliation_run_candidates") {
      requireUuid(row, "id");
      requireUuid(row, "run_id");
      requireUuid(row, "conversion_id");
      requireSha(row, "source_conversion_key", true);
      requireEnum(row, "network", ["shopee", "manual"]);
      requireEnum(row, "expected_previous_status", ["pending", "approved", "rejected", "payable", "paid"]);
      requireEnum(row, "intended_next_status", ["pending", "approved", "rejected", "payable"]);
      requireText(row, "planned_reason_code");
      requireInteger(row, "planned_money_network_commission");
      requireInteger(row, "planned_cashback_share_bps", { nullable: true });
      requireInteger(row, "planned_money_user_cashback");
      requireInteger(row, "planned_money_platform_profit");
      requireSha(row, "planned_idempotency_key");
      requireSha(row, "provenance_fingerprint");
      requireEnum(row, "processing_outcome", ["pending", "applied", "skipped/idempotent", "skipped/stale", "skipped/blocked", "failed"]);
      requireTimestamp(row, "processing_completed_at", true);
      requireText(row, "processing_reason_code", true);
      requireTimestamp(row, "created_at");
      if (row.planned_money_network_commission !==
          Number(row.planned_money_user_cashback) + Number(row.planned_money_platform_profit)) {
        throw new Error("invalid_seed_money_allocation");
      }
      return;
    }
    if (relation === "conversions") {
      requireUuid(row, "id");
      requireText(row, "network");
      requireText(row, "external_order_id");
      requireUuid(row, "publisher_id");
      for (const field of ["advertiser_id", "campaign_id", "offer_id", "tracking_link_id"]) requireText(row, field);
      requireEnum(row, "status", ["pending", "approved", "rejected", "payable", "paid"]);
      for (const field of ["order_amount", "network_commission", "user_cashback", "platform_profit"]) requireInteger(row, field);
      requireInteger(row, "cashback_share_bps_snapshot", { nullable: true });
      requireTimestamp(row, "occurred_at");
      for (const field of ["approved_at", "payable_at", "paid_at", "rejected_at"]) requireTimestamp(row, field, true);
      requireText(row, "rejected_reason", true);
      requireSha(row, "source_conversion_key", true);
      requireEnum(row, "validation_status", ["recorded", "reconciling", "approved", "rejected", "reversed"], true);
      requireEnum(row, "settlement_status", ["not_payable", "payable", "paid"], true);
      requireUuid(row, "ingestion_event_id", true);
      requireTimestamp(row, "created_at");
      requireTimestamp(row, "updated_at");
      if (row.network_commission !== Number(row.user_cashback) + Number(row.platform_profit)) {
        throw new Error("invalid_seed_money_allocation");
      }
      const status = row.status;
      if ((status === "approved" || status === "payable" || status === "paid") && row.approved_at === null) {
        throw new Error("invalid_seed_lifecycle:approved_at");
      }
      if ((status === "payable" || status === "paid") && row.payable_at === null) {
        throw new Error("invalid_seed_lifecycle:payable_at");
      }
      if (status === "paid" && row.paid_at === null) {
        throw new Error("invalid_seed_lifecycle:paid_at");
      }
      if (status === "rejected" && (row.rejected_at === null || row.rejected_reason === null)) {
        throw new Error("invalid_seed_lifecycle:rejected_at");
      }
      return;
    }
    if (relation === "reconciliation_audit_events") {
      requireUuid(row, "id");
      requireEnum(row, "network", ["shopee", "manual"]);
      requireSha(row, "source_conversion_key");
      requireSha(row, "idempotency_key");
      requireUuid(row, "conversion_id");
      requireEnum(row, "previous_status", ["pending", "approved", "rejected", "payable", "paid"]);
      requireEnum(row, "next_status", ["pending", "approved", "rejected", "payable"]);
      requireEnum(row, "decision", ["approve", "reject"]);
      requireText(row, "reason_code");
      requireText(row, "human_reason");
      for (const field of ["network_commission", "user_cashback", "platform_profit"]) requireInteger(row, field);
      requireInteger(row, "cashback_share_bps_snapshot", { nullable: true });
      requireEnum(row, "actor_kind", ["admin", "system"]);
      requireUuid(row, "actor_user_id", true);
      requireEnum(row, "actor_role", ["admin", "super_admin"], true);
      requireUuid(row, "reconciliation_run_id");
      requireUuid(row, "run_candidate_id", true);
      requireTimestamp(row, "created_at");
      if (row.network_commission !== Number(row.user_cashback) + Number(row.platform_profit)) {
        throw new Error("invalid_seed_money_allocation");
      }
      return;
    }
    requireUuid(row, "conversion_id");
    requireEnum(row, "processing_status", ["succeeded", "skipped", "failed"], true);
    requireEnum(row, "csv_source", ["manual_csv", "addlivetag_api", "official_shopee_api"], true);
    requireText(row, "csv_order_status", true);
    for (const field of ["publisher_exists", "tracking_link_exists", "tracking_link_publisher_match"]) {
      if (typeof row[field] !== "boolean") throw new Error("invalid_seed_boolean:" + field);
    }
    requireInteger(row, "external_order_collision_count");
    requireInteger(row, "source_conversion_key_collision_count");
  }

  for (const seed of options.seedRows ?? []) {
    if (!MODELED_STATE_RELATIONS.includes(seed.relation)) {
      throw new Error("unsupported_seed_relation");
    }
    const primaryKey = seed.primaryKey.toLowerCase();
    if (!IDENTIFIER_UUID_PATTERN.test(primaryKey)) {
      throw new Error("invalid_seed_primary_key");
    }
    const required = seedFields[seed.relation];
    const rawRow = seed.row;
    for (const field of required) {
      if (!(field in rawRow)) throw new Error("missing_seed_field:" + field);
    }
    for (const field of Object.keys(rawRow)) {
      if (!required.includes(field)) throw new Error("unknown_seed_field:" + field);
    }
    validateSeedRow(seed.relation, rawRow);
    const row = immutableSnapshot(rawRow) as Readonly<Record<string, unknown>>;
    const rowPrimaryKey = seed.relation === "source_evidence" ? row.conversion_id : row.id;
    if (String(rowPrimaryKey).toLowerCase() !== primaryKey) {
      throw new Error("seed_primary_key_mismatch");
    }
    if (committedRows[seed.relation][primaryKey]) {
      throw new Error("duplicate_seed_primary_key");
    }
    const copy = frozenRecord(row);
    committedRows[seed.relation][primaryKey] = { ...copy };
    seededRows.push(Object.freeze({
      relation: seed.relation,
      primaryKey,
      row: copy,
    }));
  }

  function immutableMutations(
    values: readonly ModeledMutation[],
  ): readonly ModeledMutation[] {
    return Object.freeze(
      values.map((value) =>
        Object.freeze({
          ...value,
          identities: Object.freeze([...value.identities]),
          fields: frozenRecord(value.fields),
          defaultFields: frozenRecord(value.defaultFields),
        }),
      ),
    );
  }

  function matchingMutations(
    values: readonly (ModeledMutation | PendingMutation)[],
    relation: ModeledStateRelation,
    key: string,
  ): readonly (ModeledMutation | PendingMutation)[] {
    const normalizedKey = key.toLowerCase();
    return values.filter(
      (mutation) =>
        mutation.succeeded &&
        mutation.relation === relation &&
        mutation.primaryKey === normalizedKey,
    );
  }

  function currentRow(
    relation: ModeledStateRelation,
    key: string,
  ): Readonly<Record<string, unknown>> | undefined {
    const normalizedKey = key.toLowerCase();
    const seed = committedRows[relation][normalizedKey];
    const row: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    if (seed) Object.assign(row, seed);
    const matches = activeMutations
      ? matchingMutations(activeMutations, relation, normalizedKey)
      : [];
    for (const mutation of matches) {
      if (mutation.operation === "delete") {
        for (const field of Object.keys(row)) delete row[field];
        continue;
      }
      Object.assign(row, mutation.fields);
    }
    return Object.keys(row).length === 0 ? undefined : frozenRecord(row);
  }

  function applyCommittedMutation(mutation: ModeledMutation): void {
    if (!mutation.primaryKey) return;
    const rows = committedRows[mutation.relation];
    if (mutation.operation === "delete") {
      if (!rows[mutation.primaryKey]) throw new Error("delete_missing_current_row");
      delete rows[mutation.primaryKey];
      return;
    }
    if (mutation.operation === "update" && !rows[mutation.primaryKey]) {
      throw new Error("update_missing_current_row");
    }
    if (mutation.operation === "insert" && rows[mutation.primaryKey]) {
      throw new Error("insert_existing_current_row");
    }
    rows[mutation.primaryKey] = {
      ...(rows[mutation.primaryKey] ?? {}),
      ...mutation.fields,
    };
  }

  function committedRow(
    relation: ModeledStateRelation,
    primaryKey: string,
  ): Readonly<Record<string, unknown>> | undefined {
    const row = committedRows[relation][primaryKey.toLowerCase()];
    return row ? frozenRecord(row) : undefined;
  }

  function stateView(): ScriptedStateView {
    return Object.freeze({
      currentTransactionId: activeTransactionId,
      listCommittedOperations: () => immutableMutations(committedMutations),
      listRolledBackOperations: () => immutableMutations(rolledBackMutations),
      listFailedOperations: () => immutableMutations(failedMutations),
      listExternalOperations: () => immutableMutations(externalMutations),
      readCommittedRow: (relation: ModeledStateRelation, key: string) =>
        committedRow(relation, key),
      readCurrentRow: (relation: ModeledStateRelation, key: string) =>
        currentRow(relation, key),
      countCommittedMutations: (
        relation: ModeledRelation,
        key: string,
        operation?: ModeledMutation["operation"],
      ) =>
        matchingMutations(committedMutations, relation, key).filter(
          (mutation) => operation === undefined || mutation.operation === operation,
        ).length,
      getTransactionOutcome: (transactionId: number) =>
        transactionOutcomes[transactionId],
    });
  }

  function applyExternalMutation(
    input: ExternalCommittedMutationInput,
    operationId: number,
  ): void {
    if (!MODELED_STATE_RELATIONS.includes(input.relation)) {
      throw new Error("unsupported_external_relation");
    }
    const primaryKey = input.primaryKey.toLowerCase();
    if (!IDENTIFIER_UUID_PATTERN.test(primaryKey)) {
      throw new Error("invalid_external_primary_key");
    }
    const rows = committedRows[input.relation];
    const existing = rows[primaryKey];
    const fields = frozenRecord(input.fields ?? Object.freeze({}));
    if (input.operation === "insert") {
      if (existing) throw new Error("external_insert_existing_current_row");
      const primaryField = input.relation === "source_evidence" ? "conversion_id" : "id";
      const complete = frozenRecord({ ...fields, [primaryField]: primaryKey });
      const required = seedFields[input.relation];
      if (Object.keys(complete).length !== required.length ||
          required.some((field) => !(field in complete))) {
        throw new Error("incomplete_external_insert");
      }
      validateSeedRow(input.relation, complete);
      rows[primaryKey] = { ...complete };
    } else if (input.operation === "update") {
      if (!existing) throw new Error("external_update_missing_current_row");
      for (const field of Object.keys(fields)) {
        if (!seedFields[input.relation].includes(field)) {
          throw new Error("unknown_external_field:" + field);
        }
      }
      const complete = frozenRecord({ ...existing, ...fields });
      validateSeedRow(input.relation, complete);
      rows[primaryKey] = { ...complete };
    } else {
      if (!existing) throw new Error("external_delete_missing_current_row");
      if (Object.keys(fields).length > 0) throw new Error("external_delete_has_fields");
      delete rows[primaryKey];
    }
    const primaryField = input.relation === "source_evidence" ? "conversion_id" : "id";
    externalMutations.push(Object.freeze({
      operationId,
      operation: input.operation,
      relation: input.relation,
      primaryKey,
      identities: Object.freeze([primaryKey]),
      fields: frozenRecord(
        input.operation === "delete" ? {} : { ...fields, [primaryField]: primaryKey },
      ),
      defaultFields: frozenRecord({}),
      transactionId: null,
      succeeded: true,
      source: "external",
      disposition: "committed",
    }));
  }

  function applyExternalMutations(
    inputs: readonly ExternalCommittedMutationInput[] | undefined,
    operationId: number,
  ): void {
    for (let index = 0; index < (inputs?.length ?? 0); index += 1) {
      applyExternalMutation(inputs![index]!, operationId + (index + 1) / 100);
    }
  }

  function projectionsFor(kind: StateBackedSelectKind): readonly ProjectionDescriptor[] {
    if (kind === "run_lock" || kind === "run_load") return RUN_PROJECTION;
    if (kind === "run_status") return RUN_STATUS_PROJECTION;
    if (kind === "candidate_lock") return CANDIDATE_LOCK_PROJECTION;
    if (kind === "candidate_load") return CANDIDATE_PROJECTION;
    if (kind === "candidate_outcomes") return CANDIDATE_OUTCOME_PROJECTION;
    if (kind === "conversion_lock") return CONVERSION_LOCK_PROJECTION;
    if (kind === "audit_claim") return AUDIT_CLAIM_PROJECTION;
    if (kind === "pending_count") return PENDING_COUNT_PROJECTION;
    return SOURCE_EVIDENCE_PROJECTION;
  }

  function expectedFromRelation(kind: StateBackedSelectKind): ModeledRelation {
    if (kind === "run_lock" || kind === "run_load" || kind === "run_status") {
      return "reconciliation_runs";
    }
    if (kind === "candidate_lock" || kind === "candidate_load" ||
        kind === "candidate_outcomes" || kind === "pending_count") {
      return "reconciliation_run_candidates";
    }
    if (kind === "conversion_lock" || kind === "source_evidence") return "conversions";
    return "reconciliation_audit_events";
  }

  function exactBoundValue(
    where: string,
    column: string,
    params: readonly unknown[],
  ): string {
    const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = [...where.matchAll(
      new RegExp("(?:[a-z_][a-z0-9_]*\\.)?" + escaped + "\\s*=\\s*\\$(\\d+)(?:::[a-z_][a-z0-9_]*)?", "gi"),
    )];
    if (matches.length !== 1) throw new Error("state_select_identity_predicate_mismatch:" + column);
    const value = params[Number(matches[0]![1]) - 1];
    if (typeof value !== "string") throw new Error("state_select_identity_parameter_mismatch:" + column);
    return value.toLowerCase();
  }

  function assertProjectionShape(
    expressions: readonly string[],
    descriptors: readonly ProjectionDescriptor[],
  ): void {
    if (expressions.length !== descriptors.length) {
      throw new Error("state_select_projection_count_mismatch");
    }
    for (let index = 0; index < descriptors.length; index += 1) {
      const descriptor = descriptors[index]!;
      if (!descriptor.pattern.test(expressions[index]!)) {
        throw new Error(
          "state_select_projection_mismatch:" + descriptor.alias + "=" + expressions[index],
        );
      }
    }
  }

  function transformedValue(value: unknown, transform: ProjectionDescriptor["transform"]): unknown {
    if (value === null || value === undefined) return value ?? null;
    if (transform === "text") return String(value);
    return value;
  }

  function projectRow(
    row: Readonly<Record<string, unknown>>,
    descriptors: readonly ProjectionDescriptor[],
    evidence?: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> {
    const projected = Object.create(null) as Record<string, unknown>;
    for (const descriptor of descriptors) {
      const source = descriptor.source === "evidence" ? evidence : row;
      if (!source || !(descriptor.sourceField! in source)) {
        throw new Error("state_projection_field_missing:" + descriptor.sourceField);
      }
      projected[descriptor.alias] = transformedValue(
        source[descriptor.sourceField!],
        descriptor.transform,
      );
    }
    return frozenRecord(projected);
  }

  function sortedCandidateRows(runId: string): readonly Readonly<Record<string, unknown>>[] {
    return Object.values(committedRows.reconciliation_run_candidates)
      .filter((row) => String(row.run_id).toLowerCase() === runId)
      .sort((left, right) => {
        const byCreated = String(left.created_at).localeCompare(String(right.created_at));
        return byCreated !== 0 ? byCreated : String(left.id).localeCompare(String(right.id));
      });
  }

  function assertExpectedKeys(
    actual: readonly string[],
    expected: readonly string[] | undefined,
  ): void {
    if (!expected) return;
    const normalized = expected.map((key) => key.toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      throw new Error("duplicate_state_projection_key");
    }
    if (actual.length !== normalized.length ||
        actual.some((key, index) => key !== normalized[index])) {
      throw new Error("state_projection_order_mismatch");
    }
  }

  function resolveStateSelect(
    contract: StateBackedSelectContract,
    sqlText: string,
    params: readonly unknown[],
  ): readonly unknown[] {
    const shape = selectShape(sqlText);
    if (shape.fromRelation !== expectedFromRelation(contract.kind)) {
      throw new Error("state_select_relation_mismatch");
    }
    const descriptors = projectionsFor(contract.kind);
    assertProjectionShape(shape.projectionExpressions, descriptors);
    const identityValues = typeof contract.identity === "string"
      ? [contract.identity.toLowerCase()]
      : contract.identity.map((value) => value.toLowerCase());

    if (contract.kind === "run_lock" || contract.kind === "run_load" || contract.kind === "run_status") {
      const runId = exactBoundValue(shape.where, "id", params);
      if (runId !== identityValues[0]) throw new Error("state_select_parameter_mismatch");
      if ((contract.kind === "run_lock") !== shape.hasForUpdate) {
        throw new Error("state_select_lock_mismatch");
      }
      const row = committedRow("reconciliation_runs", runId);
      if (!row) throw new Error("state_projection_row_missing");
      assertExpectedKeys([runId], contract.expectedKeys);
      return Object.freeze([projectRow(row, descriptors)]);
    }

    if (contract.kind === "candidate_lock" || contract.kind === "candidate_load" ||
        contract.kind === "candidate_outcomes") {
      const runId = exactBoundValue(shape.where, "run_id", params);
      if (runId !== identityValues[0]) throw new Error("state_select_parameter_mismatch");
      if ((contract.kind === "candidate_lock") !== shape.hasForUpdate) {
        throw new Error("state_select_lock_mismatch");
      }
      if (contract.kind === "candidate_lock" || contract.kind === "candidate_load") {
        if (shape.orderBy !== "created_at asc, id asc") {
          throw new Error("state_select_order_mismatch");
        }
      } else if (shape.orderBy !== "") {
        throw new Error("state_select_order_mismatch");
      }
      const rows = sortedCandidateRows(runId);
      const keys = rows.map((row) => String(row.id).toLowerCase());
      assertExpectedKeys(keys, contract.expectedKeys);
      return Object.freeze(rows.map((row) => projectRow(row, descriptors)));
    }

    if (contract.kind === "conversion_lock") {
      const conversionId = exactBoundValue(shape.where, "id", params);
      if (conversionId !== identityValues[0]) throw new Error("state_select_parameter_mismatch");
      if (!shape.hasForUpdate) throw new Error("state_select_lock_mismatch");
      const row = committedRow("conversions", conversionId);
      const keys = row ? [conversionId] : [];
      assertExpectedKeys(keys, contract.expectedKeys);
      return Object.freeze(row ? [projectRow(row, descriptors)] : []);
    }

    if (contract.kind === "audit_claim") {
      const candidateId = exactBoundValue(shape.where, "run_candidate_id", params);
      if (candidateId !== identityValues[0]) throw new Error("state_select_parameter_mismatch");
      const claims = Object.values(committedRows.reconciliation_audit_events)
        .filter((row) => String(row.run_candidate_id).toLowerCase() === candidateId);
      if (claims.length > 1) throw new Error("duplicate_current_audit_claim");
      const keys = claims.map((row) => String(row.id).toLowerCase());
      assertExpectedKeys(keys, contract.expectedKeys);
      return Object.freeze(claims.map((row) => projectRow(row, descriptors)));
    }

    if (contract.kind === "pending_count") {
      const runId = exactBoundValue(shape.where, "run_id", params);
      if (runId !== identityValues[0]) throw new Error("state_select_parameter_mismatch");
      if (!/processing_outcome\s*=\s*'pending'/.test(shape.where)) {
        throw new Error("state_select_pending_predicate_mismatch");
      }
      const pending = Object.values(committedRows.reconciliation_run_candidates)
        .filter((row) => String(row.run_id).toLowerCase() === runId && row.processing_outcome === "pending")
        .length;
      return Object.freeze([frozenRecord({ pending })]);
    }

    if (!shape.joins.includes("shopee_ingestion_events") ||
        !shape.joins.includes("shopee_csv_rows")) {
      throw new Error("state_select_join_mismatch");
    }
    const outerIds = [...shape.where.matchAll(IDENTIFIER_UUID_PATTERN_GLOBAL)]
      .map((match) => match[0]!.toLowerCase());
    if (outerIds.length !== identityValues.length ||
        outerIds.some((id, index) => id !== identityValues[index])) {
      throw new Error("state_select_parameter_mismatch");
    }
    const rows: Readonly<Record<string, unknown>>[] = [];
    for (const conversionId of outerIds) {
      const conversion = committedRow("conversions", conversionId);
      if (!conversion) continue;
      const evidence = committedRow("source_evidence", conversionId);
      if (!evidence) throw new Error("state_projection_row_missing");
      rows.push(projectRow(conversion, descriptors, evidence));
    }
    assertExpectedKeys(
      rows.map((row) => String(row.conversion_id).toLowerCase()),
      contract.expectedKeys,
    );
    return Object.freeze(rows);
  }

  async function dispatch(
    sqlText: string,
    params: readonly unknown[],
    method: "all" | "execute",
  ): Promise<{ rows: unknown[] }> {
    const dmlTarget = parseDmlTarget(sqlText);
    const operation: CapturedSqlOperation = Object.freeze({
      operationId: operations.length + 1,
      sql: sqlText,
      params: Object.freeze([...params]),
      method,
      kind: sqlOperationKind(sqlText),
      relation: dmlTarget?.relation ?? null,
      transactionId: activeTransactionId,
    });
    operations.push(operation);
    const step = steps.shift();
    if (!step) {
      throw new Error("unexpected_sql:" + operation.kind);
    }
    if (step.method !== undefined && step.method !== method) {
      throw new Error("unexpected_sql_method");
    }
    step.match.lastIndex = 0;
    if (!step.match.test(sqlText)) {
      throw new Error(
        "unexpected_sql_shape:" +
          operation.kind +
          ":expected=" +
          step.match.source,
      );
    }
    step.onMatch?.();
    applyExternalMutations(step.externalMutationsBefore, operation.operationId);
    if (dmlTarget) {
      const expected = step.dml;
      if (!expected) throw new Error("missing_dml_expectation");
      if (
        !Number.isInteger(expected.affectedRows) ||
        expected.affectedRows < 0
      ) {
        throw new Error("invalid_affected_rows_expectation");
      }
      if (
        expected.operation !== dmlTarget.operation ||
        expected.relation !== dmlTarget.relation ||
        operation.kind !== expected.operation
      ) {
        throw new Error("unexpected_dml_target");
      }
      for (const value of expected.expectedParameterValues ?? []) {
        if (!operation.params.some((actual) => sameValue(actual, value))) {
          throw new Error("missing_expected_dml_parameter");
        }
      }
      const returnedRows = [...(expected.returnedRows ?? [])];
      const hasReturning = /\breturning\b/i.test(sqlText);
      if (hasReturning && returnedRows.length !== expected.affectedRows) {
        throw new Error("returning_affected_rows_mismatch");
      }
      if (!hasReturning && returnedRows.length > 0) {
        throw new Error("unexpected_nonreturning_rows");
      }
      const expectedKeys = expected.primaryKeys ??
        (expected.primaryKey ? [expected.primaryKey] : []);
      if (expected.affectedRows > 0 && expectedKeys.length !== expected.affectedRows) {
        throw new Error("primary_key_affected_rows_mismatch");
      }
      for (let index = 0; index < returnedRows.length; index += 1) {
        const actualId = returnedIdentity(returnedRows[index]);
        if (!actualId || actualId !== expectedKeys[index]?.toLowerCase()) {
          throw new Error("returning_identity_mismatch");
        }
      }
      if (step.error) {
        if (expected.affectedRows !== 0) {
          throw new Error("failed_dml_cannot_affect_rows");
        }
        const failed = buildPendingMutation({
          operation,
          expectation: { ...expected, affectedRows: 1 },
          returnedRows,
          succeeded: false,
          currentRow: expected.primaryKey
            ? currentRow(expected.relation, expected.primaryKey) ?? frozenRecord({})
            : frozenRecord({}),
          databaseClockIso,
        });
        if (failed) {
          failedMutations.push(finalizedMutation(failed, "failed"));
          if (activeMutations) activeMutations.push(failed);
        }
        throw step.error;
      }
      const successfulMutation = buildPendingMutation({
        operation,
        expectation: expected,
        returnedRows,
        succeeded: true,
        currentRow: expected.primaryKey
          ? currentRow(expected.relation, expected.primaryKey) ?? frozenRecord({})
          : frozenRecord({}),
        databaseClockIso,
      });
      if (successfulMutation) {
        if (activeMutations) activeMutations.push(successfulMutation);
        else {
          const committed = finalizedMutation(successfulMutation, "committed");
          applyCommittedMutation(committed);
          committedMutations.push(committed);
        }
      }
      applyExternalMutations(step.externalMutationsAfter, operation.operationId + 0.5);
      const result = [...returnedRows] as unknown[] & { count: number };
      Object.defineProperty(result, "count", {
        value: expected.affectedRows,
        enumerable: false,
      });
      if (step.errorAfterMutation) throw step.errorAfterMutation;
      return { rows: result };
    }
    if (step.dml) throw new Error("dml_expectation_for_select");
    if (operation.kind !== "select" && step.stateSelect) {
      throw new Error("state_select_requires_select");
    }
    if (step.stateSelect && step.rows !== undefined) {
      throw new Error("state_select_static_rows_forbidden");
    }
    const resolvedRows = step.stateSelect
      ? resolveStateSelect(step.stateSelect, sqlText, params)
      : step.rows ?? [];
    if (step.error) throw step.error;
    applyExternalMutations(step.externalMutationsAfter, operation.operationId + 0.5);
    return { rows: [...resolvedRows] };
  }

  async function runTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (activeTransactionId !== null || activeMutations !== null) {
      throw new Error("unexpected_nested_transaction");
    }
    activeTransactionId = nextTransactionId;
    nextTransactionId += 1;
    activeMutations = [];
    transactionOutcomes[activeTransactionId] = "active";
    transactionEvents.push("begin");
    try {
      const result = await fn();
      if (transactionOutcomes[activeTransactionId] !== "active") {
        throw new Error("invalid_transaction_commit");
      }
      for (const mutation of activeMutations) {
        if (mutation.succeeded) {
          const committed = finalizedMutation(mutation, "committed");
          applyCommittedMutation(committed);
          committedMutations.push(committed);
        }
      }
      transactionOutcomes[activeTransactionId] = "committed";
      transactionEvents.push("commit");
      return result;
    } catch (error) {
      if (transactionOutcomes[activeTransactionId] !== "active") {
        throw new Error("invalid_transaction_rollback", { cause: error });
      }
      for (const mutation of activeMutations) {
        rolledBackMutations.push(finalizedMutation(mutation, "rolled_back"));
      }
      transactionOutcomes[activeTransactionId] = "rolled_back";
      transactionEvents.push("rollback");
      throw error;
    } finally {
      activeTransactionId = null;
      activeMutations = null;
    }
  }

  const database = proxyDrizzle((sqlText, params, method) =>
    dispatch(sqlText, params, method),
  );
  const transactionalDatabase = database as unknown as {
    transaction<T>(fn: (tx: typeof database) => Promise<T>): Promise<T>;
  };
  transactionalDatabase.transaction = async <T>(
    fn: (tx: typeof database) => Promise<T>,
  ): Promise<T> => runTransaction(() => fn(database));

  const dialect = new PgDialect();
  const executor = {
    async execute(query: SQL): Promise<unknown> {
      const compiled = dialect.sqlToQuery(query);
      return (await dispatch(compiled.sql, compiled.params, "execute")).rows;
    },
    async transaction<T>(fn: (tx: {
      execute(query: SQL): Promise<unknown>;
      updateConversions(
        payload: Record<string, unknown>,
        where: SQL<unknown> | undefined,
      ): Promise<unknown>;
    }) => Promise<T>): Promise<T> {
      return runTransaction(async () => {
        return fn({
          execute: async (query) => {
            const compiled = dialect.sqlToQuery(query);
            return (
              await dispatch(compiled.sql, compiled.params, "execute")
            ).rows;
          },
          updateConversions: async (payload, where) => {
            const query = database
              .update(conversions)
              .set(payload)
              .where(where)
              .returning({ id: conversions.id });
            const compiled = dialect.sqlToQuery(query.getSQL());
            const result = await dispatch(compiled.sql, compiled.params, "all");
            return result.rows;
          },
        });
      });
    },
  };

  return {
    database,
    executor,
    get operations() {
      return Object.freeze(
        operations.map((operation) =>
          Object.freeze({
            ...operation,
            params: Object.freeze([...operation.params]),
          }),
        ),
      );
    },
    get transactionEvents() {
      return Object.freeze([...transactionEvents]);
    },
    remainingSteps: () => steps.length,
    assertComplete: () => {
      if (steps.length !== 0) {
        throw new Error("unused_scripted_sql_steps:" + String(steps.length));
      }
    },
    dmlCount: () =>
      operations.filter(
        (operation) =>
          operation.kind === "insert" ||
          operation.kind === "update" ||
          operation.kind === "delete",
        ).length,
    listCommittedOperations: () => stateView().listCommittedOperations(),
    listRolledBackOperations: () => stateView().listRolledBackOperations(),
    listFailedOperations: () => stateView().listFailedOperations(),
    listExternalOperations: () => stateView().listExternalOperations(),
    listSeededRows: () => Object.freeze(
      seededRows.map((seed) => Object.freeze({
        ...seed,
        row: frozenRecord(seed.row),
      })),
    ),
    readCommittedRow: (relation, key) =>
      stateView().readCommittedRow(relation, key),
    countCommittedMutations: (relation, key, operation) =>
      stateView().countCommittedMutations(relation, key, operation),
    getTransactionOutcome: (transactionId) =>
      stateView().getTransactionOutcome(transactionId),
  };
}
