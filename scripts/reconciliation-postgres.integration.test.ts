/**
 * Phase 20K follow-up 2 -- PostgreSQL integration test for the
 * bounded reconciliation run + true idempotency model.
 *
 * Requires DATABASE_URL pointing at a Supabase / Postgres
 * instance where every migration through
 * drizzle/0024_phase_20k_reconciliation_audit.sql (extended with
 * reconciliation_runs + reconciliation_run_candidates tables)
 * has been applied. The fixture fails closed unless the isolated-target
 * guard approves the connection and the exact 17-relation baseline is empty.
 *
 * Tests cover the Phase 20K follow-up 2 blockers:
 *
 *   - BLK A: dry-run + commit are scoped to a server-generated
 *     reconciliationRunId; the commit never UPDATE-s every
 *     conversion whose status is in pending/approved/payable.
 *   - BLK B: same-run replay produces zero new transitions and
 *     zero new audit events.
 *   - BLK C: ON CONFLICT DO NOTHING RETURNING id is used for the
 *     audit claim; the unique constraint path is exercised.
 *   - BLK D: two independent postgres clients commit the SAME
 *     run id against the SAME candidate via settle-all concurrency;
 *     exactly one applied result, one durable audit event, one
 *     status transition; the other result is idempotent
 *     skipped.
 *   - BLK E/F: source evidence drives the transition; no
 *     fabricated provenance.
 *   - BLK G: unknown network values are refused closed.
 *   - BLK H: every possible row has a preallocated exact primary key in a
 *     sealed ownership manifest and is removed only by exact-key cleanup.
 *
 * The test uses `prepare: false` so it is compatible with the
 * Supabase transaction pooler.
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { randomUUID as createRandomUUID, createHash } from "node:crypto";
import postgres from "postgres";

import {
  PHASE20K_EMPTY_BASELINE_RELATIONS,
  validatePhase20kEmptyBaseline,
  type Phase20kBaselineRelation,
  type Phase20kBaselineSnapshot,
} from "./phase20k-empty-baseline";
import {
  addPhase20kOwnedFixtureRow,
  createPhase20kFixtureOwnershipManifest,
  planPhase20kFixtureCleanup,
  sealPhase20kFixtureOwnershipManifest,
  verifyPhase20kFixtureCleanup,
  type Phase20kFixtureCleanupPlan,
  type Phase20kFixtureOwnershipManifest,
} from "./phase20k-fixture-ownership";
import { validatePhase20kIntegrationTarget } from "./phase20k-integration-target-guard";
import type {
  CommitReconciliationIdentifierPlan,
  DryRunReconciliationIdentifierPlan,
  ReconciliationExecutor,
  ReconciliationExecutorTx,
} from "../src/server/reconciliation/reconciliation.repository";

type DryRunRepositoryDependencies = NonNullable<
  Parameters<
    typeof import("../src/server/reconciliation/reconciliation.repository").dryRunReconciliationAsync
  >[1]
>;

type FixtureRepositoryDependencies = Readonly<{
  database: DryRunRepositoryDependencies["database"];
  executor: ReconciliationExecutor;
}>;

const EMPTY_ORDERED_PROJECTION_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

class Phase20kFixtureSafetyError extends Error {
  readonly code: string;

  constructor(code: string, details: readonly string[] = []) {
    super([code, ...details].join("|"));
    this.name = "Phase20kFixtureSafetyError";
    this.code = code;
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function nonSecretError(error: unknown, fallbackCode: string): Error {
  if (error instanceof Phase20kFixtureSafetyError) return error;
  if (error instanceof AggregateError) {
    return new AggregateError(
      Array.from(error.errors, (child) => nonSecretError(child, fallbackCode)),
      fallbackCode,
    );
  }
  if (error instanceof assert.AssertionError) {
    return new Phase20kFixtureSafetyError(fallbackCode, ["assertion_failed"]);
  }
  const candidateCode = (error as { readonly code?: unknown } | null)?.code;
  const candidateConstraint = (
    error as { readonly constraint_name?: unknown } | null
  )?.constraint_name;
  const safeCode =
    typeof candidateCode === "string" && /^[A-Za-z0-9_]{1,32}$/.test(candidateCode)
      ? candidateCode
      : "unknown";
  const safeConstraint =
    typeof candidateConstraint === "string" &&
    /^[a-z0-9_]{1,63}$/.test(candidateConstraint)
      ? candidateConstraint
      : null;
  return new Phase20kFixtureSafetyError(
    fallbackCode,
    safeConstraint ? [safeCode, safeConstraint] : [safeCode],
  );
}

async function runScenario(
  context: TestContext,
  name: string,
  callback: () => Promise<void>,
): Promise<void> {
  let scenarioFailure: Error | undefined;
  await context.test(name, async () => {
    try {
      await callback();
    } catch (error) {
      scenarioFailure = nonSecretError(error, "scenario_failed");
      throw scenarioFailure;
    }
  });
  if (scenarioFailure) throw scenarioFailure;
}

function uuidFromSeed(seed: string, label: string): string {
  const hex = createHash("sha256").update(`${seed}:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function indexedUuidFromSeed(seed: string, label: string, index: number): string {
  const hex = createHash("sha256").update(`${seed}:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${index.toString(16).padStart(12, "0")}`;
}

function exactKeyValues(
  rows: Phase20kFixtureCleanupPlan["steps"][number]["rows"],
  column: string,
): readonly string[] {
  return rows.map((row) => {
    const value = row.primaryKey[column];
    if (!value) throw new Phase20kFixtureSafetyError("invalid_exact_cleanup_plan");
    return value;
  });
}

type TechnicalRelationName =
  | "conversions"
  | "reconciliation_audit_events"
  | "reconciliation_run_candidates";

type TechnicalScenarioOwner =
  | "blk5"
  | "4d1"
  | "4d2"
  | "4d2c_failure"
  | "4d2c_conversion_counter"
  | "4d2c_audit_counter";

type TechnicalObjectDescriptor =
  | Readonly<{
      kind: "function";
      schema: "public";
      name: string;
      identityArguments: "";
      scenarioOwner: TechnicalScenarioOwner;
    }>
  | Readonly<{
      kind: "trigger";
      name: string;
      owningSchema: "public";
      relationName: TechnicalRelationName;
      internal: false;
      scenarioOwner: TechnicalScenarioOwner;
    }>
  | Readonly<{
      kind: "sequence";
      schema: "public";
      name: string;
      relationKind: "S";
      scenarioOwner: TechnicalScenarioOwner;
    }>;

test("Phase 20K core reconciliation integration fixture", async (context) => {
  const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
  const targetGuard = validatePhase20kIntegrationTarget({
    databaseUrl: DATABASE_URL,
    expectedTargetProjectRefSha256:
      process.env.PHASE20K_TARGET_PROJECT_REF_SHA256,
    damagedProjectRefSha256:
      process.env.PHASE20K_DAMAGED_PROJECT_REF_SHA256,
    acknowledgement: process.env.PHASE20K_ISOLATED_TARGET_ACK,
  });
  if (!targetGuard.approved) {
    throw new Phase20kFixtureSafetyError("target_guard_rejected", [
      targetGuard.reason,
    ]);
  }

  const fixtureSeed = createRandomUUID();
  const fixtureRunId = `phase20k-ir7k-${fixtureSeed}`;
  const RUN_TAG = `20k-ir7k-${fixtureSeed.replace(/-/g, "")}`;
  const conversionIds = Object.freeze(
    Array.from({ length: 40 }, (_, index) =>
      uuidFromSeed(fixtureSeed, `conversion-${index}`),
    ),
  );
  const sourceConversionKeys = Object.freeze(
    conversionIds.map((id, index) =>
      createHash("sha256")
        .update(`${fixtureRunId}:source:${index}:${id}`)
        .digest("hex"),
    ),
  );
  const runIds = Object.freeze(
    Array.from({ length: 40 }, (_, index) =>
      uuidFromSeed(fixtureSeed, `run-${index}`),
    ),
  );
  const candidateIds = Object.freeze(
    Array.from({ length: 33 }, (_, index) =>
      indexedUuidFromSeed(fixtureSeed, "candidate", index),
    ),
  );
  const auditIds = Object.freeze(
    Array.from({ length: 21 }, (_, index) =>
      uuidFromSeed(fixtureSeed, `audit-${index}`),
    ),
  );
  const ingestionEventIds = Object.freeze(
    Array.from({ length: 38 }, (_, index) =>
      uuidFromSeed(fixtureSeed, `ingestion-${index}`),
    ),
  );
  const dryCandidateConversionIndexes = Object.freeze([
    [], [1], [2], [], [4], [], [], [], [9], [10], [11], [12], [13],
    [14], [15], [16], [17], [18], [19], [20], [21], [21], [22], [23],
    [23, 24], [25], [26, 27], [28], [], [29], [31], [32], [33], [34],
    [35], [36], [37], [], [],
  ] as const);
  let candidatePlanIndex = 0;
  const dryRunPlans = Object.freeze(
    dryCandidateConversionIndexes.map((conversionIndexes, runIndex) =>
      deepFreeze({
        reconciliationRunId: runIds[runIndex + 1]!,
        candidates: conversionIndexes.map((conversionIndex) => ({
          conversionId: conversionIds[conversionIndex]!,
          sourceConversionKey: sourceConversionKeys[conversionIndex]!,
          candidateId: candidateIds[candidatePlanIndex++]!,
        })),
      }) as DryRunReconciliationIdentifierPlan,
    ),
  );
  if (candidatePlanIndex !== candidateIds.length) {
    throw new Phase20kFixtureSafetyError("candidate_inventory_mismatch");
  }
  const auditPlan = (
    entries: readonly (readonly [number, number])[],
  ): CommitReconciliationIdentifierPlan =>
    deepFreeze({
      auditEvents: entries.map(([dryPlanIndex, auditIndex]) => ({
        runCandidateId: dryRunPlans[dryPlanIndex]!.candidates[0]!.candidateId,
        auditEventId: auditIds[auditIndex]!,
      })),
    }) as CommitReconciliationIdentifierPlan;
  const twoCandidateAuditPlan = (
    dryPlanIndex: number,
    auditIndexes: readonly [number, number],
  ): CommitReconciliationIdentifierPlan =>
    deepFreeze({
      auditEvents: dryRunPlans[dryPlanIndex]!.candidates.map((candidate, index) => ({
        runCandidateId: candidate.candidateId,
        auditEventId: auditIds[auditIndexes[index]]!,
      })),
    }) as CommitReconciliationIdentifierPlan;
  const candidateAuditPlan = (
    dryPlanIndex: number,
    candidateIndex: number,
    auditIndex: number,
  ): CommitReconciliationIdentifierPlan =>
    deepFreeze({
      auditEvents: [{
        runCandidateId: dryRunPlans[dryPlanIndex]!.candidates[candidateIndex]!.candidateId,
        auditEventId: auditIds[auditIndex]!,
      }],
    }) as CommitReconciliationIdentifierPlan;
  const emptyAuditPlan = deepFreeze({ auditEvents: [] }) as CommitReconciliationIdentifierPlan;
  const commitPlans = Object.freeze([
    auditPlan([[1, 0]]), emptyAuditPlan, emptyAuditPlan, emptyAuditPlan,
    auditPlan([[4, 3]]), emptyAuditPlan, auditPlan([[9, 4]]),
    emptyAuditPlan, emptyAuditPlan, emptyAuditPlan, emptyAuditPlan,
    emptyAuditPlan, emptyAuditPlan, auditPlan([[16, 5]]),
    auditPlan([[17, 6]]), auditPlan([[17, 6]]),
    auditPlan([[18, 7]]), auditPlan([[18, 7]]), auditPlan([[22, 8]]),
    twoCandidateAuditPlan(24, [9, 10]), auditPlan([[25, 11]]),
    auditPlan([[25, 11]]), twoCandidateAuditPlan(26, [12, 13]),
    candidateAuditPlan(26, 1, 13), auditPlan([[27, 14]]), emptyAuditPlan,
    auditPlan([[29, 15]]), emptyAuditPlan, auditPlan([[32, 16]]),
    auditPlan([[33, 17]]), auditPlan([[34, 18]]), auditPlan([[35, 19]]),
    emptyAuditPlan, auditPlan([[36, 20]]), emptyAuditPlan,
    emptyAuditPlan, emptyAuditPlan,
  ] as const);
  const technicalObjects = (() => {
    const failBlk5Function = {
      kind: "function",
      schema: "public",
      name: "phase20k_ir7_blk5_fail_fn",
      identityArguments: "",
      scenarioOwner: "blk5",
    } as const;
    const failBlk5Trigger = {
      kind: "trigger",
      name: "phase20k_ir7_blk5_fail_trg",
      owningSchema: "public",
      relationName: "reconciliation_run_candidates",
      internal: false,
      scenarioOwner: "blk5",
    } as const;
    const failBlk5WitnessSequence = {
      kind: "sequence",
      schema: "public",
      name: "phase20k_ir7_blk5_witness_seq",
      relationKind: "S",
      scenarioOwner: "blk5",
    } as const;
    const fail4d1Function = {
      kind: "function",
      schema: "public",
      name: "phase20k_ir7_4d1_fail_fn",
      identityArguments: "",
      scenarioOwner: "4d1",
    } as const;
    const fail4d1Trigger = {
      kind: "trigger",
      name: "phase20k_ir7_4d1_fail_trg",
      owningSchema: "public",
      relationName: "reconciliation_run_candidates",
      internal: false,
      scenarioOwner: "4d1",
    } as const;
    const fail4d2Function = {
      kind: "function",
      schema: "public",
      name: "phase20k_ir7_4d2_fail_fn",
      identityArguments: "",
      scenarioOwner: "4d2",
    } as const;
    const fail4d2Trigger = {
      kind: "trigger",
      name: "phase20k_ir7_4d2_fail_trg",
      owningSchema: "public",
      relationName: "reconciliation_run_candidates",
      internal: false,
      scenarioOwner: "4d2",
    } as const;
    const fail4d2cFunction = {
      kind: "function",
      schema: "public",
      name: "phase20k_ir7_4d2c_fail_fn",
      identityArguments: "",
      scenarioOwner: "4d2c_failure",
    } as const;
    const fail4d2cTrigger = {
      kind: "trigger",
      name: "phase20k_ir7_4d2c_fail_trg",
      owningSchema: "public",
      relationName: "reconciliation_run_candidates",
      internal: false,
      scenarioOwner: "4d2c_failure",
    } as const;
    const countConversionFunction = {
      kind: "function",
      schema: "public",
      name: "phase20k_ir7_4d2c_conversion_count_fn",
      identityArguments: "",
      scenarioOwner: "4d2c_conversion_counter",
    } as const;
    const countConversionTrigger = {
      kind: "trigger",
      name: "phase20k_ir7_4d2c_conversion_count_trg",
      owningSchema: "public",
      relationName: "conversions",
      internal: false,
      scenarioOwner: "4d2c_conversion_counter",
    } as const;
    const countConversionSequence = {
      kind: "sequence",
      schema: "public",
      name: "phase20k_ir7_4d2c_conversion_count_seq",
      relationKind: "S",
      scenarioOwner: "4d2c_conversion_counter",
    } as const;
    const countAuditFunction = {
      kind: "function",
      schema: "public",
      name: "phase20k_ir7_4d2c_audit_count_fn",
      identityArguments: "",
      scenarioOwner: "4d2c_audit_counter",
    } as const;
    const countAuditTrigger = {
      kind: "trigger",
      name: "phase20k_ir7_4d2c_audit_count_trg",
      owningSchema: "public",
      relationName: "reconciliation_audit_events",
      internal: false,
      scenarioOwner: "4d2c_audit_counter",
    } as const;
    const countAuditSequence = {
      kind: "sequence",
      schema: "public",
      name: "phase20k_ir7_4d2c_audit_count_seq",
      relationKind: "S",
      scenarioOwner: "4d2c_audit_counter",
    } as const;
    const all: readonly TechnicalObjectDescriptor[] = [
      failBlk5Function,
      failBlk5Trigger,
      failBlk5WitnessSequence,
      fail4d1Function,
      fail4d1Trigger,
      fail4d2Function,
      fail4d2Trigger,
      fail4d2cFunction,
      fail4d2cTrigger,
      countConversionFunction,
      countConversionTrigger,
      countConversionSequence,
      countAuditFunction,
      countAuditTrigger,
      countAuditSequence,
    ];
    return deepFreeze({
      failBlk5: {
        function: failBlk5Function,
        trigger: failBlk5Trigger,
        witnessSequence: failBlk5WitnessSequence,
      },
      fail4d1: { function: fail4d1Function, trigger: fail4d1Trigger },
      fail4d2: { function: fail4d2Function, trigger: fail4d2Trigger },
      fail4d2c: { function: fail4d2cFunction, trigger: fail4d2cTrigger },
      countConversion: {
        function: countConversionFunction,
        trigger: countConversionTrigger,
        sequence: countConversionSequence,
      },
      countAudit: {
        function: countAuditFunction,
        trigger: countAuditTrigger,
        sequence: countAuditSequence,
      },
      all,
    });
  })();
  const fixtureExecutionMutex = deepFreeze({
    kind: "sequence",
    schema: "public",
    name: "phase20k_ir7_fixture_execution_mutex_seq",
    relationKind: "S",
    ownerPurpose: "fixture_execution_mutex",
  } as const);

  const fixtureGraph = deepFreeze({
    runTag: RUN_TAG,
    fixtureRunId,
    adminActorId: uuidFromSeed(fixtureSeed, "admin-actor"),
    userIds: [
      uuidFromSeed(fixtureSeed, "publisher-primary"),
      uuidFromSeed(fixtureSeed, "publisher-pivot"),
      uuidFromSeed(fixtureSeed, "publisher-foreign"),
      uuidFromSeed(fixtureSeed, "publisher-owner-mismatch"),
    ],
    trackingLinkIds: [
      uuidFromSeed(fixtureSeed, "tracking-primary"),
      uuidFromSeed(fixtureSeed, "tracking-foreign"),
      uuidFromSeed(fixtureSeed, "tracking-owner-mismatch"),
    ],
    invalidTrackingLinkId: uuidFromSeed(fixtureSeed, "tracking-missing"),
    advertiserId: `ci-${RUN_TAG}-adv`,
    campaignId: `ci-${RUN_TAG}-cmp`,
    offerId: `ci-${RUN_TAG}-off`,
    batchId: uuidFromSeed(fixtureSeed, "shopee-batch"),
    sourceFingerprints: {
      batchSha256: createHash("sha256").update(`${fixtureRunId}:batch`).digest("hex"),
      ingestionPayloadSha256: createHash("sha256").update(`${fixtureRunId}:payload`).digest("hex"),
    },
    directConcurrentIdempotencyKey: createHash("sha256")
      .update(`${fixtureRunId}:direct-concurrent-audit`)
      .digest("hex"),
    csvRowIds: Array.from({ length: 38 }, (_, index) =>
      uuidFromSeed(fixtureSeed, `csv-row-${index}`),
    ),
    ingestionEventIds,
    conversionIds,
    sourceConversionKeys,
    externalOrderIds: conversionIds.map((id, index) =>
      `ir7k-${index.toString().padStart(2, "0")}-${id.slice(-8)}`,
    ),
    runIds,
    candidateIds,
    auditIds,
    dryRunPlans,
    commitPlans,
    overLimitConversionIds: Array.from({ length: 250 }, (_, index) =>
      uuidFromSeed(fixtureSeed, `over-limit-${index}`),
    ),
    technicalObjects,
    fixtureExecutionMutex,
    legacyUuidSequence: [
      conversionIds[0], conversionIds[1], ingestionEventIds[0],
      conversionIds[2], ingestionEventIds[1], conversionIds[3],
      conversionIds[4], ingestionEventIds[2], conversionIds[5],
      ingestionEventIds[3], uuidFromSeed(fixtureSeed, "tracking-missing"),
      uuidFromSeed(fixtureSeed, "publisher-foreign"),
      uuidFromSeed(fixtureSeed, "tracking-foreign"),
      conversionIds[6], conversionIds[7], ingestionEventIds[4], ingestionEventIds[5],
      uuidFromSeed(fixtureSeed, "publisher-owner-mismatch"),
      uuidFromSeed(fixtureSeed, "tracking-owner-mismatch"),
      conversionIds[8], ingestionEventIds[6], conversionIds[9], ingestionEventIds[7],
      conversionIds[10], ingestionEventIds[8], conversionIds[11], ingestionEventIds[9],
      conversionIds[12], ingestionEventIds[10], conversionIds[13], ingestionEventIds[11],
      conversionIds[14], ingestionEventIds[12], conversionIds[15], ingestionEventIds[13],
      conversionIds[16], ingestionEventIds[14], conversionIds[17], ingestionEventIds[15],
      conversionIds[18], ingestionEventIds[16], conversionIds[19], ingestionEventIds[17],
      runIds[0], conversionIds[20], ingestionEventIds[18],
      conversionIds[21], ingestionEventIds[19], conversionIds[22], ingestionEventIds[20],
      conversionIds[23], conversionIds[24], ingestionEventIds[21], ingestionEventIds[22],
      conversionIds[25], ingestionEventIds[23],
      conversionIds[26], conversionIds[27], ingestionEventIds[24], ingestionEventIds[25],
      conversionIds[28], ingestionEventIds[26],
      ...Array.from({ length: 250 }, (_, index) =>
        uuidFromSeed(fixtureSeed, `over-limit-${index}`),
      ),
      conversionIds[29], conversionIds[30], ingestionEventIds[27], ingestionEventIds[28],
      conversionIds[31], ingestionEventIds[29], conversionIds[32], ingestionEventIds[30],
      conversionIds[33], ingestionEventIds[31], conversionIds[34], ingestionEventIds[32],
      conversionIds[35], ingestionEventIds[33], conversionIds[36], ingestionEventIds[34],
      conversionIds[37], ingestionEventIds[35], conversionIds[38], ingestionEventIds[36],
      conversionIds[39], ingestionEventIds[37],
    ],
  });

  const PUBLISHER_ID = fixtureGraph.userIds[0]!;
  const SECOND_PUBLISHER_ID = fixtureGraph.userIds[1]!;
  const ADMIN_ACTOR_ID = fixtureGraph.adminActorId;
  const TRACKING_LINK_UUID = fixtureGraph.trackingLinkIds[0]!;
  const ADVERTISER_ID = fixtureGraph.advertiserId;
  const CAMPAIGN_ID = fixtureGraph.campaignId;
  const OFFER_ID = fixtureGraph.offerId;
  const TRACKING_LINK_ID = TRACKING_LINK_UUID;

  function ownRow(
    manifest: Phase20kFixtureOwnershipManifest,
    relation: Phase20kBaselineRelation,
    column: string,
    value: string,
  ): Phase20kFixtureOwnershipManifest {
    return addPhase20kOwnedFixtureRow(manifest, relation, {
      primaryKey: { [column]: value },
    });
  }

  let openManifest = createPhase20kFixtureOwnershipManifest({
    runId: fixtureGraph.fixtureRunId,
    targetIdentityHash: targetGuard.identityHash,
    createdAt: new Date().toISOString(),
  });
  for (const id of fixtureGraph.userIds) openManifest = ownRow(openManifest, "auth.users", "id", id);
  for (const id of fixtureGraph.userIds) openManifest = ownRow(openManifest, "public.profiles", "user_id", id);
  openManifest = ownRow(openManifest, "public.advertisers", "id", ADVERTISER_ID);
  openManifest = ownRow(openManifest, "public.campaigns", "id", CAMPAIGN_ID);
  openManifest = ownRow(openManifest, "public.offers", "id", OFFER_ID);
  openManifest = ownRow(openManifest, "public.cashback_policies", "offer_id", OFFER_ID);
  for (const id of fixtureGraph.trackingLinkIds) openManifest = ownRow(openManifest, "public.tracking_links", "id", id);
  openManifest = ownRow(openManifest, "public.shopee_csv_import_batches", "id", fixtureGraph.batchId);
  for (const id of fixtureGraph.csvRowIds) openManifest = ownRow(openManifest, "public.shopee_csv_rows", "id", id);
  for (const id of fixtureGraph.ingestionEventIds) openManifest = ownRow(openManifest, "public.shopee_ingestion_events", "id", id);
  for (const id of fixtureGraph.conversionIds) openManifest = ownRow(openManifest, "public.conversions", "id", id);
  for (const id of fixtureGraph.runIds) openManifest = ownRow(openManifest, "public.reconciliation_runs", "id", id);
  for (const id of fixtureGraph.candidateIds) openManifest = ownRow(openManifest, "public.reconciliation_run_candidates", "id", id);
  for (const id of fixtureGraph.auditIds) openManifest = ownRow(openManifest, "public.reconciliation_audit_events", "id", id);
  const sealedManifest = sealPhase20kFixtureOwnershipManifest(openManifest);
  const ownedCount = PHASE20K_EMPTY_BASELINE_RELATIONS.reduce(
    (total, relation) => total + sealedManifest.ownedRows[relation].length,
    0,
  );
  if (ownedCount !== 226) throw new Phase20kFixtureSafetyError("ownership_inventory_mismatch");

  const mutexClient = (() => {
    try {
      return postgres(DATABASE_URL, { max: 1, prepare: false });
    } catch (error) {
      throw nonSecretError(error, "fixture_execution_mutex_client_construction_failed");
    }
  })();
  let mutexClientClosed = false;
  let mutexOwned = false;
  let admin!: postgres.Sql;
  let adminConstructed = false;
  let adminClosed = false;
  const trackedClients: Array<{
    readonly label: string;
    readonly client: postgres.Sql;
    closed: boolean;
  }> = [];
  const scenarioDefinitions: Array<{
    readonly name: string;
    readonly callback: (dependencies: FixtureRepositoryDependencies) => Promise<void>;
  }> = [];
  const test = (
    name: string,
    callback: (dependencies: FixtureRepositoryDependencies) => Promise<void>,
  ): void => {
    scenarioDefinitions.push({ name, callback });
  };
  let legacyUuidCursor = 0;
  let csvRowCursor = 0;
  let dryPlanCursor = 0;
  let commitPlanCursor = 0;
  let activeConcurrentDatabaseGroups = 0;

  function nextPreallocatedUuid(): string {
    const value = fixtureGraph.legacyUuidSequence[legacyUuidCursor++];
    if (!value) throw new Phase20kFixtureSafetyError("identifier_inventory_exhausted");
    return value;
  }

  function nextCsvRowId(): string {
    const value = fixtureGraph.csvRowIds[csvRowCursor++];
    if (!value) throw new Phase20kFixtureSafetyError("csv_row_inventory_exhausted");
    return value;
  }

  function nextDryRunPlan(): DryRunReconciliationIdentifierPlan {
    const value = fixtureGraph.dryRunPlans[dryPlanCursor++];
    if (!value) throw new Phase20kFixtureSafetyError("dry_run_plan_inventory_exhausted");
    return value;
  }

  function nextCommitPlan(): CommitReconciliationIdentifierPlan {
    const value = fixtureGraph.commitPlans[commitPlanCursor++];
    if (!value) throw new Phase20kFixtureSafetyError("commit_plan_inventory_exhausted");
    return value;
  }

  function trackClient<T extends postgres.Sql>(label: string, client: T): T {
    trackedClients.push({ label, client, closed: false });
    return client;
  }

  async function closeTrackedClient(tracked: (typeof trackedClients)[number]): Promise<void> {
    if (tracked.closed) return;
    await tracked.client.end();
    tracked.closed = true;
  }

  type ConcurrentDatabaseBranch<T> = Readonly<{
    role: string;
    promise: Promise<T>;
  }>;

  async function settleConcurrentDatabaseBranches<T extends readonly unknown[]>(
    operation: string,
    relation: string,
    branches: { readonly [K in keyof T]: ConcurrentDatabaseBranch<T[K]> },
  ): Promise<T> {
    activeConcurrentDatabaseGroups += 1;
    try {
      const settlements = await Promise.allSettled(
        Array.from(branches, (branch) => branch.promise),
      );
      const failures: Error[] = [];
      for (const [index, settlement] of settlements.entries()) {
        if (settlement.status === "rejected") {
          failures.push(
            new Phase20kFixtureSafetyError("concurrent_database_branch_failed", [
              `operation=${operation}`,
              `relation=${relation}`,
              "reason=concurrent_branch_failed",
              `branch=${branches[index]!.role}`,
            ]),
          );
        }
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) {
        throw new AggregateError(failures, "concurrent_database_branches_failed");
      }
      return settlements.map(
        (settlement) => (settlement as PromiseFulfilledResult<unknown>).value,
      ) as unknown as T;
    } finally {
      activeConcurrentDatabaseGroups -= 1;
    }
  }

  async function buildTrackedRepositoryDependencies(
    clientLabel: string,
  ): Promise<FixtureRepositoryDependencies> {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const schema = await import("../src/db/schema");
    const {
      conversions,
      reconciliationAuditEvents,
      reconciliationRunCandidates,
      reconciliationRuns,
    } = schema;
    let rawClient: postgres.Sql;
    try {
      rawClient = postgres(DATABASE_URL, { max: 1, prepare: false });
    } catch (error) {
      throw nonSecretError(error, "fixture_repository_client_construction_failed");
    }
    const client = trackClient(clientLabel, rawClient);
    let database: DryRunRepositoryDependencies["database"];
    try {
      database = drizzle(client, { schema });
    } catch (error) {
      throw nonSecretError(error, "fixture_repository_wrapper_construction_failed");
    }
    const executor: ReconciliationExecutor = {
      transaction<T>(
        fn: (tx: ReconciliationExecutorTx) => Promise<T>,
      ): Promise<T> {
        return database.transaction(async (rawTx) =>
          fn({
            execute: async (query) =>
              (await rawTx.execute(query as never)) as unknown,
            updateConversions: async (payload, where) =>
              (await rawTx
                .update(conversions)
                .set(payload)
                .where(where)
                .returning({ id: conversions.id })) as unknown,
          }) as Promise<T>,
        );
      },
      execute: async (query) =>
        (await database.execute(query as never)) as unknown,
    };
    return Object.freeze({ database, executor });
  }

  async function buildTrackedReconciliationExecutor(
    clientLabel: string,
  ): Promise<ReconciliationExecutor> {
    return (await buildTrackedRepositoryDependencies(clientLabel)).executor;
  }

  async function quiesceMutationClients(): Promise<Readonly<{
    failures: readonly Error[];
    quiesced: boolean;
  }>> {
    const attempts: Array<Readonly<{
      label: string;
      promise: Promise<void>;
    }>> = trackedClients.map((tracked) => ({
      label: tracked.label,
      promise: closeTrackedClient(tracked),
    }));
    const settlements = await Promise.allSettled(
      attempts.map((attempt) => attempt.promise),
    );
    const failures: Error[] = [];
    for (const [index, settlement] of settlements.entries()) {
      if (settlement.status === "rejected") {
        failures.push(
          new Phase20kFixtureSafetyError("database_client_quiescence_failed", [
            "operation=database_client_quiescence",
            "relation=database_clients",
            "reason=client_close_failed",
            `client=${attempts[index]!.label}`,
          ]),
        );
      }
    }
    const sharedClientCount = trackedClients.filter(
      (tracked) => tracked.label === "shared_repository_client",
    ).length;
    const inventoryValid =
      sharedClientCount <= 1 &&
      (!writesStarted || sharedClientCount === 1) &&
      trackedClients.every(
        (tracked, index) =>
          trackedClients.findIndex(
            (candidate) =>
              candidate.client === tracked.client || candidate.label === tracked.label,
          ) === index,
      );
    if (!inventoryValid) {
      failures.push(
        new Phase20kFixtureSafetyError("database_client_quiescence_failed", [
          "operation=database_client_quiescence",
          "relation=database_clients",
          "reason=client_inventory_invalid",
        ]),
      );
    }
    return {
      failures,
      quiesced:
        failures.length === 0 &&
        trackedClients.every((tracked) => tracked.closed),
    };
  }

  function sourceKeyFromUuid(id: string): string {
    const index = fixtureGraph.conversionIds.indexOf(id);
    const sourceKey = fixtureGraph.sourceConversionKeys[index];
    if (!sourceKey) throw new Phase20kFixtureSafetyError("unknown_conversion_identity");
    return sourceKey;
  }

  function sha256Hex(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  function relationEvidence(count: string): { readonly count: string; readonly stableHash: string } {
    return { count, stableHash: EMPTY_ORDERED_PROJECTION_SHA256 };
  }

  async function captureBaselineSnapshot(): Promise<Phase20kBaselineSnapshot> {
    const rows = await admin<
      Array<Record<string, string>>
    >`
      SELECT
        (SELECT count(*)::text FROM auth.users) AS auth_users,
        (SELECT count(*)::text FROM public.profiles) AS profiles,
        (SELECT count(*)::text FROM public.payout_accounts) AS payout_accounts,
        (SELECT count(*)::text FROM public.tracking_links) AS tracking_links,
        (SELECT count(*)::text FROM public.clicks) AS clicks,
        (SELECT count(*)::text FROM public.shopee_csv_import_batches) AS shopee_csv_import_batches,
        (SELECT count(*)::text FROM public.shopee_csv_rows) AS shopee_csv_rows,
        (SELECT count(*)::text FROM public.shopee_ingestion_events) AS shopee_ingestion_events,
        (SELECT count(*)::text FROM public.conversions) AS conversions,
        (SELECT count(*)::text FROM public.advertisers) AS advertisers,
        (SELECT count(*)::text FROM public.campaigns) AS campaigns,
        (SELECT count(*)::text FROM public.offers) AS offers,
        (SELECT count(*)::text FROM public.cashback_policies) AS cashback_policies,
        (SELECT count(*)::text FROM public.shopee_purchase_intents) AS shopee_purchase_intents,
        (SELECT count(*)::text FROM public.reconciliation_audit_events) AS reconciliation_audit_events,
        (SELECT count(*)::text FROM public.reconciliation_runs) AS reconciliation_runs,
        (SELECT count(*)::text FROM public.reconciliation_run_candidates) AS reconciliation_run_candidates
    `;
    if (rows.length !== 1) throw new Phase20kFixtureSafetyError("baseline_count_capture_failed");
    const row = rows[0]!;
    return deepFreeze({
      "auth.users": relationEvidence(row.auth_users!),
      "public.profiles": relationEvidence(row.profiles!),
      "public.payout_accounts": relationEvidence(row.payout_accounts!),
      "public.tracking_links": relationEvidence(row.tracking_links!),
      "public.clicks": relationEvidence(row.clicks!),
      "public.shopee_csv_import_batches": relationEvidence(row.shopee_csv_import_batches!),
      "public.shopee_csv_rows": relationEvidence(row.shopee_csv_rows!),
      "public.shopee_ingestion_events": relationEvidence(row.shopee_ingestion_events!),
      "public.conversions": relationEvidence(row.conversions!),
      "public.advertisers": relationEvidence(row.advertisers!),
      "public.campaigns": relationEvidence(row.campaigns!),
      "public.offers": relationEvidence(row.offers!),
      "public.cashback_policies": relationEvidence(row.cashback_policies!),
      "public.shopee_purchase_intents": relationEvidence(row.shopee_purchase_intents!),
      "public.reconciliation_audit_events": relationEvidence(row.reconciliation_audit_events!),
      "public.reconciliation_runs": relationEvidence(row.reconciliation_runs!),
      "public.reconciliation_run_candidates": relationEvidence(row.reconciliation_run_candidates!),
    });
  }

  function assertEmptyBaseline(snapshot: Phase20kBaselineSnapshot, phase: "preflight" | "post_cleanup"): void {
    const validation = validatePhase20kEmptyBaseline(snapshot, { strict: true });
    if (validation.approved) return;
    throw new Phase20kFixtureSafetyError(
      phase === "preflight"
        ? "empty_baseline_preflight_failed_freeze_or_abandon"
        : "post_cleanup_baseline_failed_freeze_or_abandon",
      validation.failures.map((failure) => `${failure.relation}:${failure.code}`),
    );
  }

  async function executeCleanupStep(
    step: Phase20kFixtureCleanupPlan["steps"][number],
  ): Promise<void> {
    switch (step.relation) {
      case "public.reconciliation_audit_events":
        await admin`DELETE FROM public.reconciliation_audit_events WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.reconciliation_run_candidates":
        await admin`DELETE FROM public.reconciliation_run_candidates WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.reconciliation_runs":
        await admin`DELETE FROM public.reconciliation_runs WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.conversions":
        await admin`DELETE FROM public.conversions WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.shopee_ingestion_events":
        await admin`DELETE FROM public.shopee_ingestion_events WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.shopee_csv_rows":
        await admin`DELETE FROM public.shopee_csv_rows WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.shopee_csv_import_batches":
        await admin`DELETE FROM public.shopee_csv_import_batches WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.tracking_links":
        await admin`DELETE FROM public.tracking_links WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.cashback_policies":
        await admin`DELETE FROM public.cashback_policies WHERE offer_id IN ${admin(exactKeyValues(step.rows, "offer_id"))}`;
        return;
      case "public.offers":
        await admin`DELETE FROM public.offers WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.campaigns":
        await admin`DELETE FROM public.campaigns WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.advertisers":
        await admin`DELETE FROM public.advertisers WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.profiles":
        await admin`DELETE FROM public.profiles WHERE user_id IN ${admin(exactKeyValues(step.rows, "user_id"))}`;
        return;
      case "auth.users":
        await admin`DELETE FROM auth.users WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        return;
      case "public.shopee_purchase_intents":
      case "public.clicks":
      case "public.payout_accounts":
        if (step.rows.length !== 0) throw new Phase20kFixtureSafetyError("unexpected_owned_cleanup_relation");
        return;
    }
  }

  async function executeExactCleanupPlan(cleanupPlan: Phase20kFixtureCleanupPlan): Promise<void> {
    const failures: Error[] = [];
    for (const step of cleanupPlan.steps) {
      try {
        await executeCleanupStep(step);
      } catch (error) {
        failures.push(nonSecretError(error, `cleanup_${step.relation.replace(/[^a-z]/g, "_")}_failed`));
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, "exact_cleanup_failed_freeze_or_abandon");
  }

  async function countRemainingOwnedRows(
    relation: Phase20kBaselineRelation,
    rows: Phase20kFixtureOwnershipManifest["ownedRows"][Phase20kBaselineRelation],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    let result: postgres.RowList<postgres.Row[]>;
    switch (relation) {
      case "auth.users": result = await admin`SELECT count(*)::int AS n FROM auth.users WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.profiles": result = await admin`SELECT count(*)::int AS n FROM public.profiles WHERE user_id IN ${admin(exactKeyValues(rows, "user_id"))}`; break;
      case "public.tracking_links": result = await admin`SELECT count(*)::int AS n FROM public.tracking_links WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.shopee_csv_import_batches": result = await admin`SELECT count(*)::int AS n FROM public.shopee_csv_import_batches WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.shopee_csv_rows": result = await admin`SELECT count(*)::int AS n FROM public.shopee_csv_rows WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.shopee_ingestion_events": result = await admin`SELECT count(*)::int AS n FROM public.shopee_ingestion_events WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.conversions": result = await admin`SELECT count(*)::int AS n FROM public.conversions WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.advertisers": result = await admin`SELECT count(*)::int AS n FROM public.advertisers WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.campaigns": result = await admin`SELECT count(*)::int AS n FROM public.campaigns WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.offers": result = await admin`SELECT count(*)::int AS n FROM public.offers WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.cashback_policies": result = await admin`SELECT count(*)::int AS n FROM public.cashback_policies WHERE offer_id IN ${admin(exactKeyValues(rows, "offer_id"))}`; break;
      case "public.reconciliation_audit_events": result = await admin`SELECT count(*)::int AS n FROM public.reconciliation_audit_events WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.reconciliation_runs": result = await admin`SELECT count(*)::int AS n FROM public.reconciliation_runs WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.reconciliation_run_candidates": result = await admin`SELECT count(*)::int AS n FROM public.reconciliation_run_candidates WHERE id IN ${admin(exactKeyValues(rows, "id"))}`; break;
      case "public.payout_accounts":
      case "public.clicks":
      case "public.shopee_purchase_intents":
        return 0;
    }
    return Number(result[0]?.n ?? -1);
  }

  async function verifyOwnedCleanup(
    cleanupManifest: Phase20kFixtureOwnershipManifest,
  ): Promise<Phase20kFixtureOwnershipManifest> {
    const remaining: Partial<Record<Phase20kBaselineRelation, number>> = {};
    for (const relation of PHASE20K_EMPTY_BASELINE_RELATIONS) {
      remaining[relation] = await countRemainingOwnedRows(
        relation,
        cleanupManifest.ownedRows[relation],
      );
    }
    return verifyPhase20kFixtureCleanup(cleanupManifest, remaining);
  }

  async function assertFinalOwnedStateBeforeCleanup(): Promise<void> {
    const userRows = await admin`SELECT id::text AS id FROM auth.users ORDER BY id`;
    assert.deepEqual(userRows.map((row) => String(row.id)), [...fixtureGraph.userIds].sort());
    const profileRows = await admin`SELECT user_id::text AS user_id FROM public.profiles ORDER BY user_id`;
    assert.deepEqual(profileRows.map((row) => String(row.user_id)), [...fixtureGraph.userIds].sort());
    const trackingRows = await admin`SELECT id::text AS id FROM public.tracking_links ORDER BY id`;
    assert.deepEqual(trackingRows.map((row) => String(row.id)), [...fixtureGraph.trackingLinkIds].sort());
    const batchRows = await admin`SELECT id::text AS id FROM public.shopee_csv_import_batches ORDER BY id`;
    assert.deepEqual(batchRows.map((row) => String(row.id)), [fixtureGraph.batchId]);
    const catalogRows = await admin`
      SELECT
        (SELECT count(*)::int FROM public.advertisers WHERE id = ${fixtureGraph.advertiserId}::text) AS advertiser_count,
        (SELECT count(*)::int FROM public.campaigns WHERE id = ${fixtureGraph.campaignId}::text) AS campaign_count,
        (SELECT count(*)::int FROM public.offers WHERE id = ${fixtureGraph.offerId}::text) AS offer_count,
        (SELECT count(*)::int FROM public.cashback_policies WHERE offer_id = ${fixtureGraph.offerId}::text) AS policy_count
    `;
    assert.deepEqual(
      [
        Number(catalogRows[0]!.advertiser_count),
        Number(catalogRows[0]!.campaign_count),
        Number(catalogRows[0]!.offer_count),
        Number(catalogRows[0]!.policy_count),
      ],
      [1, 1, 1, 1],
    );
    const conversionRows = await admin`
      SELECT id::text AS id, paid_at,
             network_commission::text AS network_commission,
             user_cashback::text AS user_cashback,
             platform_profit::text AS platform_profit
      FROM public.conversions
      ORDER BY id
    `;
    assert.deepEqual(
      conversionRows.map((row) => String(row.id)).sort(),
      [...fixtureGraph.conversionIds].sort(),
    );
    for (const row of conversionRows) {
      assert.equal(row.paid_at, null);
      assert.equal(
        Number(row.network_commission),
        Number(row.user_cashback) + Number(row.platform_profit),
      );
    }

    const csvRows = await admin`SELECT id::text AS id FROM public.shopee_csv_rows ORDER BY id`;
    assert.deepEqual(csvRows.map((row) => String(row.id)), [...fixtureGraph.csvRowIds].sort());
    const ingestionRows = await admin`SELECT id::text AS id FROM public.shopee_ingestion_events ORDER BY id`;
    assert.deepEqual(ingestionRows.map((row) => String(row.id)), [...fixtureGraph.ingestionEventIds].sort());

    const absentRunIds = [
      fixtureGraph.dryRunPlans[19]!.reconciliationRunId,
      fixtureGraph.dryRunPlans[20]!.reconciliationRunId,
      fixtureGraph.dryRunPlans[28]!.reconciliationRunId,
    ];
    const runRows = await admin`SELECT id::text AS id FROM public.reconciliation_runs ORDER BY id`;
    assert.equal(runRows.length, 37, "exact durable reconciliation run count");
    assert.deepEqual(
      runRows.map((row) => String(row.id)),
      fixtureGraph.runIds.filter((id) => !absentRunIds.includes(id)).sort(),
    );
    const failedCandidateIds = [
      fixtureGraph.dryRunPlans[19]!.candidates[0]!.candidateId,
      fixtureGraph.dryRunPlans[20]!.candidates[0]!.candidateId,
    ];
    const candidateRows = await admin`SELECT id::text AS id FROM public.reconciliation_run_candidates ORDER BY id`;
    assert.equal(candidateRows.length, 31, "exact durable reconciliation candidate count");
    assert.deepEqual(
      candidateRows.map((row) => String(row.id)),
      fixtureGraph.candidateIds.filter((id) => !failedCandidateIds.includes(id)).sort(),
    );

    const auditRows = await admin`SELECT id::text AS id FROM public.reconciliation_audit_events ORDER BY id`;
    const durableAuditIds = auditRows.map((row) => String(row.id));
    assert.equal(durableAuditIds.length, 19);
    assert.equal(durableAuditIds.includes(fixtureGraph.auditIds[10]!), false);
    assert.equal(
      durableAuditIds.filter((id) =>
        id === fixtureGraph.auditIds[1] || id === fixtureGraph.auditIds[2],
      ).length,
      1,
    );
    for (const id of durableAuditIds) {
      assert.equal(fixtureGraph.auditIds.includes(id), true);
    }
  }

  function validateTechnicalObjectName(name: string): void {
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(name)) {
      throw new Phase20kFixtureSafetyError("invalid_technical_object_name");
    }
  }

  function validateTechnicalUuid(value: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
      throw new Phase20kFixtureSafetyError("invalid_technical_uuid");
    }
    return value;
  }

  const technicalPreflightFailure = (reason: string): Phase20kFixtureSafetyError =>
    new Phase20kFixtureSafetyError("phase20k_technical_object_preflight", [
      "relation=technical_schema_objects",
      `reason=${reason}`,
    ]);

  function technicalDescriptorIdentity(descriptor: TechnicalObjectDescriptor): string {
    switch (descriptor.kind) {
      case "function":
        return `function:${descriptor.schema}:${descriptor.name}:${descriptor.identityArguments}`;
      case "trigger":
        return `trigger:${descriptor.owningSchema}:${descriptor.relationName}:${descriptor.name}:${descriptor.internal}`;
      case "sequence":
        return `sequence:${descriptor.schema}:${descriptor.name}:${descriptor.relationKind}`;
    }
  }

  function validateTechnicalObjectRegistry(): void {
    const descriptors = fixtureGraph.technicalObjects.all;
    if (
      descriptors.length !== 15 ||
      descriptors.filter((descriptor) => descriptor.kind === "function").length !== 6 ||
      descriptors.filter((descriptor) => descriptor.kind === "trigger").length !== 6 ||
      descriptors.filter((descriptor) => descriptor.kind === "sequence").length !== 3
    ) {
      throw technicalPreflightFailure("invalid_technical_object_registry");
    }
    for (const [index, descriptor] of descriptors.entries()) {
      validateTechnicalObjectName(descriptor.name);
      const identity = technicalDescriptorIdentity(descriptor);
      if (
        descriptors.findIndex(
          (candidate) => technicalDescriptorIdentity(candidate) === identity,
        ) !== index
      ) {
        throw technicalPreflightFailure("duplicate_technical_object_descriptor");
      }
      if (
        (descriptor.kind === "function" &&
          (descriptor.schema !== "public" || descriptor.identityArguments !== "")) ||
        (descriptor.kind === "trigger" &&
          (descriptor.owningSchema !== "public" || descriptor.internal !== false)) ||
        (descriptor.kind === "sequence" &&
          (descriptor.schema !== "public" || descriptor.relationKind !== "S"))
      ) {
        throw technicalPreflightFailure("invalid_technical_object_descriptor");
      }
    }
  }

  async function assertNoStrandedTechnicalObjects(): Promise<void> {
    validateTechnicalObjectRegistry();
    const descriptors = fixtureGraph.technicalObjects.all;
    for (const descriptor of descriptors) {
      let rows: postgres.RowList<postgres.Row[]>;
      try {
        switch (descriptor.kind) {
          case "function":
            rows = await admin`
              SELECT p.oid
              FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = ${descriptor.schema}::text
                AND p.proname = ${descriptor.name}::text
                AND pg_get_function_identity_arguments(p.oid) = ${descriptor.identityArguments}::text
            `;
            break;
          case "trigger":
            rows = await admin`
              SELECT
                n.nspname = ${descriptor.owningSchema}::text
                  AND c.relname = ${descriptor.relationName}::text
                  AS expected_identity
              FROM pg_trigger t
              JOIN pg_class c ON c.oid = t.tgrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE t.tgname = ${descriptor.name}::text
                AND t.tgisinternal = ${descriptor.internal}::boolean
            `;
            break;
          case "sequence":
            rows = await admin`
              SELECT c.oid
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = ${descriptor.schema}::text
                AND c.relname = ${descriptor.name}::text
                AND c.relkind = ${descriptor.relationKind}::"char"
            `;
            break;
        }
      } catch {
        throw technicalPreflightFailure("technical_object_catalog_query_failed");
      }
      if (rows.length !== 0) {
        throw technicalPreflightFailure("stranded_technical_object_detected");
      }
    }
  }

  const mutexFailure = (reason: string): Phase20kFixtureSafetyError =>
    new Phase20kFixtureSafetyError("phase20k_fixture_execution_mutex", [
      "relation=technical_schema_objects",
      `reason=${reason}`,
    ]);

  async function inspectExecutionMutexRelation(queryFailureReason: string): Promise<
    postgres.RowList<postgres.Row[]>
  > {
    const descriptor = fixtureGraph.fixtureExecutionMutex;
    try {
      return await mutexClient`
        SELECT c.relkind::text AS relation_kind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${descriptor.schema}::text
          AND c.relname = ${descriptor.name}::text
      `;
    } catch {
      throw mutexFailure(queryFailureReason);
    }
  }

  async function acquireExecutionMutex(): Promise<void> {
    const descriptor = fixtureGraph.fixtureExecutionMutex;
    validateTechnicalObjectName(descriptor.name);
    let createFailed = false;
    try {
      await mutexClient.unsafe(`
        CREATE SEQUENCE public."${descriptor.name}"
          AS bigint
          START WITH 1
          INCREMENT BY 1
          MINVALUE 1
          NO MAXVALUE
          CACHE 1
          NO CYCLE
      `);
    } catch (_createFailure: unknown) {
      createFailed = true;
    }
    if (createFailed) {
      const collisionRows = await inspectExecutionMutexRelation(
        "fixture_execution_mutex_catalog_query_failed",
      );
      if (collisionRows.length !== 0) {
        throw mutexFailure("fixture_execution_mutex_unavailable");
      }
      throw mutexFailure("fixture_execution_mutex_create_failed");
    }

    mutexOwned = true;
    let catalogRows: postgres.RowList<postgres.Row[]>;
    let sequenceRows: postgres.RowList<postgres.Row[]>;
    try {
      catalogRows = await mutexClient`
        SELECT c.relkind::text AS relation_kind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${descriptor.schema}::text
          AND c.relname = ${descriptor.name}::text
          AND c.relkind = ${descriptor.relationKind}::"char"
      `;
      sequenceRows = await mutexClient.unsafe(`
        SELECT last_value::text AS last_value, is_called
        FROM public."${descriptor.name}"
      `);
    } catch {
      throw mutexFailure("fixture_execution_mutex_verification_query_failed");
    }
    if (
      catalogRows.length !== 1 ||
      catalogRows[0]!.relation_kind !== "S" ||
      sequenceRows.length !== 1 ||
      typeof sequenceRows[0]!.last_value !== "string" ||
      typeof sequenceRows[0]!.is_called !== "boolean"
    ) {
      throw mutexFailure("fixture_execution_mutex_verification_failed");
    }
  }

  async function releaseExecutionMutex(): Promise<readonly Error[]> {
    if (!mutexOwned) return [];
    const descriptor = fixtureGraph.fixtureExecutionMutex;
    const failures: Error[] = [];
    try {
      await mutexClient.unsafe(`DROP SEQUENCE public."${descriptor.name}"`);
    } catch (error) {
      failures.push(nonSecretError(error, "fixture_execution_mutex_drop_failed"));
    }

    let absenceProven = false;
    try {
      const rows = await inspectExecutionMutexRelation(
        "fixture_execution_mutex_release_verification_query_failed",
      );
      if (rows.length === 0) {
        absenceProven = true;
      } else {
        failures.push(mutexFailure("fixture_execution_mutex_release_incomplete"));
      }
    } catch (error) {
      failures.push(
        nonSecretError(error, "fixture_execution_mutex_release_verification_failed"),
      );
    }
    if (absenceProven) mutexOwned = false;
    return failures;
  }

  async function assertPublicTechnicalObjectNamesAvailable(
    triggerName: string,
    functionName: string,
    relationName: TechnicalRelationName,
    sequenceNames: readonly string[] = [],
  ): Promise<void> {
    validateTechnicalObjectName(triggerName);
    validateTechnicalObjectName(functionName);
    for (const sequenceName of sequenceNames) validateTechnicalObjectName(sequenceName);
    const rows = await admin`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_trigger t
          WHERE t.tgname = ${triggerName}::text
            AND NOT t.tgisinternal
        ) AS trigger_name_exists,
        EXISTS (
          SELECT 1 FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE t.tgname = ${triggerName}::text
            AND c.relname = ${relationName}::text
            AND n.nspname = 'public'
            AND NOT t.tgisinternal
        ) AS expected_trigger_exists,
        EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname = ${functionName}::text
            AND n.nspname = 'public'
            AND pg_get_function_identity_arguments(p.oid) = ''
        ) AS function_exists
    `;
    if (
      rows.length !== 1 ||
      rows[0]!.trigger_name_exists === true ||
      rows[0]!.expected_trigger_exists === true ||
      rows[0]!.function_exists === true
    ) {
      throw new Phase20kFixtureSafetyError("technical_object_name_collision");
    }
    for (const sequenceName of sequenceNames) {
      const sequenceRows = await admin`
        SELECT EXISTS (
          SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = ${sequenceName}::text
            AND c.relkind = 'S'
        ) AS sequence_exists
      `;
      if (sequenceRows.length !== 1 || sequenceRows[0]!.sequence_exists === true) {
        throw new Phase20kFixtureSafetyError("technical_sequence_name_collision");
      }
    }
  }

  async function teardownPublicTechnicalObjects(
    triggerName: string,
    functionName: string,
    relationName: TechnicalRelationName,
    sequenceNames: readonly string[] = [],
  ): Promise<void> {
    const failures: Error[] = [];
    try {
      await admin.unsafe(`DROP TRIGGER "${triggerName}" ON public.${relationName}`);
    } catch (error) {
      failures.push(nonSecretError(error, "technical_trigger_teardown_failed"));
    }
    try {
      await admin.unsafe(`DROP FUNCTION public."${functionName}"()`);
    } catch (error) {
      failures.push(nonSecretError(error, "technical_function_teardown_failed"));
    }
    for (const sequenceName of sequenceNames) {
      try {
        validateTechnicalObjectName(sequenceName);
        await admin.unsafe(`DROP SEQUENCE public."${sequenceName}"`);
      } catch (error) {
        failures.push(nonSecretError(error, "technical_sequence_teardown_failed"));
      }
    }
    try {
      const rows = await admin`
        SELECT
          EXISTS (
            SELECT 1 FROM pg_trigger t
            WHERE t.tgname = ${triggerName}::text
              AND NOT t.tgisinternal
          ) AS trigger_name_exists,
          EXISTS (
            SELECT 1 FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE t.tgname = ${triggerName}::text
              AND c.relname = ${relationName}::text
              AND n.nspname = 'public'
              AND NOT t.tgisinternal
          ) AS expected_trigger_exists,
          EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE p.proname = ${functionName}::text
              AND n.nspname = 'public'
              AND pg_get_function_identity_arguments(p.oid) = ''
          ) AS function_exists
      `;
      if (
        rows.length !== 1 ||
        rows[0]!.trigger_name_exists === true ||
        rows[0]!.expected_trigger_exists === true ||
        rows[0]!.function_exists === true
      ) {
        throw new Phase20kFixtureSafetyError("technical_object_post_drop_verification_failed");
      }
    } catch (error) {
      failures.push(nonSecretError(error, "technical_object_post_drop_metadata_check_failed"));
    }
    for (const sequenceName of sequenceNames) {
      try {
        const rows = await admin`
          SELECT EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = ${sequenceName}::text
              AND n.nspname = 'public'
              AND c.relkind = 'S'
          ) AS sequence_exists
        `;
        if (rows.length !== 1 || rows[0]!.sequence_exists === true) {
          throw new Phase20kFixtureSafetyError(
            "technical_sequence_post_drop_verification_failed",
          );
        }
      } catch (error) {
        failures.push(nonSecretError(error, "technical_sequence_post_drop_metadata_check_failed"));
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "technical_object_teardown_failed_freeze_or_abandon");
    }
  }

  async function teardownPublicTechnicalObjectPairs(
    pairs: readonly (readonly [string, string, TechnicalRelationName, readonly string[]])[],
  ): Promise<void> {
    const failures: Error[] = [];
    for (const [triggerName, functionName, relationName, sequenceNames] of pairs) {
      try {
        await teardownPublicTechnicalObjects(
          triggerName,
          functionName,
          relationName,
          sequenceNames,
        );
      } catch (error) {
        failures.push(nonSecretError(error, "technical_object_pair_teardown_failed"));
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "technical_object_pairs_teardown_failed_freeze_or_abandon");
    }
  }

  async function bootstrap(): Promise<void> {
    await admin`
      INSERT INTO auth.users (id, raw_user_meta_data)
      VALUES (${PUBLISHER_ID}::uuid, '{}'::jsonb)
    `;
    const primaryProfile = await admin`
      SELECT user_id::text AS user_id FROM public.profiles
      WHERE user_id = ${PUBLISHER_ID}::uuid
    `;
    assert.deepEqual(primaryProfile.map((row) => String(row.user_id)), [PUBLISHER_ID]);
    await admin`
      INSERT INTO advertisers (id, name, platform, status)
      VALUES (${ADVERTISER_ID}::text, ${RUN_TAG + " adv"}, 'shopee', 'active')
    `;
    await admin`
      INSERT INTO campaigns (id, advertiser_id, name, status)
      VALUES (${CAMPAIGN_ID}::text, ${ADVERTISER_ID}::text, ${RUN_TAG + " cmp"}, 'active')
    `;
    await admin`
      INSERT INTO offers (id, campaign_id, name, status)
      VALUES (${OFFER_ID}::text, ${CAMPAIGN_ID}::text, ${RUN_TAG + " off"}, 'active')
    `;
    await admin`
      INSERT INTO cashback_policies (offer_id, cashback_share_bps)
      VALUES (${OFFER_ID}::text, 6000)
    `;
    // Phase 20K follow-up 4 -- seed a real tracking_links row so
    // the loader's `EXISTS (SELECT 1 FROM tracking_links WHERE
    // tl.id::text = c.tracking_link_id)` returns true. Use
    // explicit text payloads rather than nested JS template
    // literals so postgres.js can infer parameter types. Every
    // value is namespaced by RUN_TAG so the row never collides
    // with other tests' tracking_links rows.
    const safeTag = RUN_TAG.replace(/[^a-zA-Z0-9]/g, "");
    const tlShortCode = ("ci" + safeTag).slice(0, 24).padEnd(10, "0");
    const tlNetworkSubId = "vaflnk" + sha256Hex(safeTag).slice(0, 24);
    const tlDestinationUrl = "https://shopee.vn/product/ci/" + RUN_TAG + "/1/1";
    const tlAffiliateUrl = "https://affiliate.shopee.vn/?subid=" + tlNetworkSubId;
    await admin`
      INSERT INTO tracking_links (
        id, publisher_id, platform, destination_url,
        affiliate_url, network_sub_id, short_code, status,
        campaign_id, offer_id
      )
      VALUES (
        ${TRACKING_LINK_UUID}::uuid,
        ${PUBLISHER_ID}::uuid,
        ${"shopee"}::text,
        ${tlDestinationUrl}::text,
        ${tlAffiliateUrl}::text,
        ${tlNetworkSubId}::text,
        ${tlShortCode}::text,
        ${"active"}::text,
        ${CAMPAIGN_ID}::text,
        ${OFFER_ID}::text
      )
    `;
    await admin`
      INSERT INTO shopee_csv_import_batches (
        id, source_file_name, source_file_sha256,
        source_file_size_bytes, source_headers, parser_version,
        source, status, total_rows, completed_at
      )
      VALUES (
        ${fixtureGraph.batchId}::uuid,
        ${RUN_TAG + ".csv"}::text,
        ${fixtureGraph.sourceFingerprints.batchSha256}::text,
        ${38}::bigint,
        ${admin.json(["x"])}::jsonb,
        ${"phase-20k-test"}::text,
        ${"manual_csv"}::text,
        ${"completed"}::text,
        ${38}::integer,
        now()
      )
    `;
  }

  async function insertIngestionEvent(args: {
    id: string;
    sourceKey: string;
    processingStatus: "succeeded" | "failed" | "skipped";
    /**
     * Phase 20K 4E3: when `processingStatus === "failed"`, the
     * Phase 20G.2a `shopee_ingestion_events_failure_code_check`
     * CHECK constraint requires non-blank `failure_code` and
     * `failure_message`. Callers that insert a `failed` event
     * MUST provide them. Callers that insert a non-`failed`
     * event MUST NOT provide them -- the helper inserts them as
     * NULL for non-`failed` rows so the same constraint's
     * negative branch (`status <> 'failed' AND both null`) is
     * satisfied.
     */
    failureCode?: string;
    failureMessage?: string;
  }): Promise<void> {
    // Minimal `shopee_ingestion_events` + matching `shopee_csv_rows`
    // pair so the source-evidence mapper sees a real
    // (processing_status, validation_status) tuple derived from the
    // joined schema (see `loadSourceEvidenceAsync` in the
    // repository). Both rows use preallocated exact primary keys;
    // source_row_number follows the sealed CSV-row inventory order.
    const csvRowId = nextCsvRowId();
    const sourceRowNumber = csvRowCursor + 1;
    await admin`
      INSERT INTO shopee_csv_rows (
        id, batch_id, source, source_row_number, row_fingerprint_sha256,
        raw_row
      )
      VALUES (
        ${csvRowId}::uuid,
        ${fixtureGraph.batchId}::uuid,
        ${'manual_csv'}::text,
        ${sourceRowNumber}::integer,
        ${args.sourceKey}::text,
        '{}'::jsonb
      )
    `;
    await admin`
      INSERT INTO shopee_ingestion_events (
        id, network, source_event_id, payload_sha256,
        processing_status, processed_at, raw_reference,
        failure_code, failure_message
      )
      VALUES (
        ${args.id}::uuid,
        ${`ci-${RUN_TAG}-event-network`}::text,
        ${`ci-${RUN_TAG}-event-${args.id}`}::text,
        ${fixtureGraph.sourceFingerprints.ingestionPayloadSha256}::text,
        ${args.processingStatus}::text,
        ${
          args.processingStatus === "succeeded" ||
          args.processingStatus === "failed"
            ? new Date()
            : null
        },
        '{}'::jsonb,
        ${
          args.processingStatus === "failed"
            ? (args.failureCode ?? "invalid")
            : null
        }::text,
        ${
          args.processingStatus === "failed"
            ? (args.failureMessage ?? "rejected_source_invalid: persisted INVALID evidence")
            : null
        }::text
      )
    `;
  }

  async function insertConversion(args: {
    id: string;
    externalOrderId: string;
    sourceKey: string;
    status: "pending" | "approved" | "payable";
    commission: number;
    validationStatus?: string | null;
    settlementStatus?: string | null;
    ingestionEventId?: string | null;
  }): Promise<void> {
    const conversionIndex = fixtureGraph.conversionIds.indexOf(args.id);
    const externalOrderId = fixtureGraph.externalOrderIds[conversionIndex];
    if (!externalOrderId || fixtureGraph.sourceConversionKeys[conversionIndex] !== args.sourceKey) {
      throw new Phase20kFixtureSafetyError("conversion_fixture_identity_mismatch");
    }
    const userCashback = Math.floor((args.commission * 6000) / 10000);
    const platformProfit = args.commission - userCashback;
    const occurredAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const approvedAt =
      args.status === "pending"
        ? null
        : new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const payableAt =
      args.status === "payable"
        ? new Date(Date.now() - 60 * 60 * 1000).toISOString()
        : null;
    await admin`
      INSERT INTO conversions (
        id, network, external_order_id, publisher_id,
        advertiser_id, campaign_id, offer_id, tracking_link_id,
        status, source_conversion_key,
        order_amount, network_commission, user_cashback, platform_profit,
        cashback_share_bps_snapshot,
        occurred_at, approved_at, payable_at,
        updated_at, validation_status, settlement_status, ingestion_event_id
      )
      VALUES (
        ${args.id}::uuid,
        'shopee',
        ${externalOrderId}::text,
        ${PUBLISHER_ID}::uuid,
        ${ADVERTISER_ID}::text,
        ${CAMPAIGN_ID}::text,
        ${OFFER_ID}::text,
        ${TRACKING_LINK_ID}::text,
        ${args.status}::text,
        ${args.sourceKey}::text,
        ${args.commission}::bigint,
        ${args.commission}::bigint,
        ${userCashback}::bigint,
        ${platformProfit}::bigint,
        ${6000}::integer,
        ${occurredAt}::timestamptz,
        ${approvedAt}::timestamptz,
        ${payableAt}::timestamptz,
        now(),
        ${args.validationStatus ?? null}::text,
        ${args.settlementStatus ?? null}::text,
        ${args.ingestionEventId ?? null}::uuid
      )
    `;
  }

  async function commitRun(
    dependencies: FixtureRepositoryDependencies,
    args: {
    actorUserId: string;
    actorRole: "admin" | "super_admin";
    reconciliationRunId: string;
    },
  ): Promise<{
    applied: Array<{ conversionId: string }>;
    skipped: Array<{
      conversionId: string;
      reasonCode: string;
      idempotentReplay?: boolean;
    }>;
  }> {
    const { commitReconciliationAsync } = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    const identifierPlan = nextCommitPlan();
    const result = await commitReconciliationAsync({
      ...args,
      identifierPlan,
    }, dependencies.executor);
    return {
      applied: result.applied.map((d) => ({ conversionId: d.conversionId })),
      skipped: [...result.skipped],
    };
  }

  async function dryRun(
    dependencies: FixtureRepositoryDependencies,
    args: {
    actorUserId: string;
    actorRole: "admin" | "super_admin";
    network: "shopee" | "manual";
    sourceKey: string;
    },
  ): Promise<{
    reconciliationRunId: string;
    appliedCount: number;
    skipped: ReadonlyArray<{ conversionId: string; reasonCode: string }>;
  }> {
    const { dryRunReconciliationAsync } = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    const { buildReconciliationAdminActor } = await import(
      "../src/lib/reconciliation/actor"
    );
    const actor = buildReconciliationAdminActor({
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
    });
    const identifierPlan = nextDryRunPlan();
    const result = await dryRunReconciliationAsync({
      network: args.network,
      actor,
      identifierPlan,
      sourceScope: {
        // The integration test seeds conversions under a per-test
        // RUN_TAG. We bind the scope to the source conversion
        // keys we just inserted so the loader's WHERE clause is
        // bounded and excludes rows from sibling tests.
        sourceConversionKeys: [args.sourceKey],
      },
    }, dependencies);
    assert.equal(result.reconciliationRunId, identifierPlan.reconciliationRunId);
    return {
      reconciliationRunId: result.reconciliationRunId,
      appliedCount: result.summary.applied,
      skipped: result.skipped,
    };
  }

  async function dryRunWithScope(
    dependencies: FixtureRepositoryDependencies,
    args: {
    actorUserId: string;
    actorRole: "admin" | "super_admin";
    network: "shopee" | "manual";
    sourceConversionKeys: ReadonlyArray<string>;
    },
  ): Promise<{
    reconciliationRunId: string;
    appliedCount: number;
    skipped: ReadonlyArray<{ conversionId: string; reasonCode: string }>;
  }> {
    const { dryRunReconciliationAsync } = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    const { buildReconciliationAdminActor } = await import(
      "../src/lib/reconciliation/actor"
    );
    const actor = buildReconciliationAdminActor({
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
    });
    const identifierPlan = nextDryRunPlan();
    const result = await dryRunReconciliationAsync({
      network: args.network,
      actor,
      identifierPlan,
      sourceScope: { sourceConversionKeys: args.sourceConversionKeys },
    }, dependencies);
    assert.equal(result.reconciliationRunId, identifierPlan.reconciliationRunId);
    return {
      reconciliationRunId: result.reconciliationRunId,
      appliedCount: result.summary.applied,
      skipped: result.skipped,
    };
  }

  test("BLK A: conversion without qualifying source evidence persists zero candidates", async (repositoryDependencies) => {
    const idA = nextPreallocatedUuid();
    const sourceA = sourceKeyFromUuid(idA);
    await insertConversion({
      id: idA,
      externalOrderId: "blkA-" + idA.slice(-8),
      sourceKey: sourceA,
      status: "pending",
      commission: 15000,
      validationStatus: "approved",
      settlementStatus: null,
      ingestionEventId: null,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: sourceA,
    });
    assert.equal(dry.reconciliationRunId, fixtureGraph.dryRunPlans[0]!.reconciliationRunId);
    const runRow = await admin`
      SELECT network, status, candidate_fingerprint
      FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(runRow.length, 1, "exactly one run row");
    assert.equal(runRow[0]!.network, "shopee");
    assert.equal(runRow[0]!.status, "draft");
    assert.equal(
      String(runRow[0]!.candidate_fingerprint).length,
      64,
      "candidate_fingerprint must be a 64-char sha256 hex",
    );
    const candidateRows = await admin`
      SELECT count(*)::int AS n
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(Number(candidateRows[0]!.n), 0, "BLK A persists exactly zero candidates");
  });

  test("BLK B: same-run replay produces zero new transitions and zero new audit events", async (repositoryDependencies) => {
    const idB = nextPreallocatedUuid();
    const sourceB = sourceKeyFromUuid(idB);
    const ingestionEventIdB = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventIdB,
      sourceKey: sourceB,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id: idB,
      externalOrderId: "blkB-" + idB.slice(-8),
      sourceKey: sourceB,
      status: "pending",
      commission: 25000,
      validationStatus: "approved",
      ingestionEventId: ingestionEventIdB,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: sourceB,
    });
    const first = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    const firstApplied = first.applied.find((d) => d.conversionId === idB);
    assert.ok(firstApplied, "first commit must apply");
    const convAfterFirst = await admin`
      SELECT status FROM conversions WHERE id = ${idB}::uuid
    `;
    assert.equal(convAfterFirst[0]!.status, "approved");

    const second = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    const secondApplied = second.applied.find((d) => d.conversionId === idB);
    assert.equal(
      secondApplied,
      undefined,
      "second commit must NOT advance the same row again",
    );
    const convAfterSecond = await admin`
      SELECT status FROM conversions WHERE id = ${idB}::uuid
    `;
    assert.equal(
      convAfterSecond[0]!.status,
      "approved",
      "status must stay at 'approved' across same-run replay",
    );
    const auditRows = await admin`
      SELECT count(*)::int AS n
      FROM reconciliation_audit_events
      WHERE conversion_id = ${idB}::uuid
    `;
    assert.equal(
      Number(auditRows[0]!.n),
      1,
      "exactly one audit row for the conversion (no replay event)",
    );
    const idem = second.skipped.find((s) => s.conversionId === idB);
    assert.ok(idem, "second commit must report idempotent skip");
    assert.equal(idem!.idempotentReplay, true);
    assert.equal(idem!.reasonCode, "rejected_duplicate_conversion");
  });

  test("BLK C + D: TRUE concurrent inserts collide on (run_candidate_id) UNIQUE; exactly one row lands", async (repositoryDependencies) => {
    const idC = nextPreallocatedUuid();
    const sourceC = sourceKeyFromUuid(idC);
    const ingestionEventIdC = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventIdC,
      sourceKey: sourceC,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id: idC,
      externalOrderId: "blkCD-" + idC.slice(-8),
      sourceKey: sourceC,
      status: "pending",
      commission: 33000,
      validationStatus: "approved",
      ingestionEventId: ingestionEventIdC,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: sourceC,
    });

    // The shared `db` singleton is configured with max: 1 so two
    // repository calls would land on the same connection. To
    // exercise the TRUE concurrent path required by BLK D we use
    // two INDEPENDENT postgres clients and reproduce the
    // production audit INSERT SQL directly. This proves the
    // partial UNIQUE INDEX on
    // `reconciliation_audit_events.run_candidate_id` is the
    // durable boundary that yields "exactly one applied, one
    // audit event" under true concurrency.
    const candidateRow = await admin`
      SELECT id FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
        AND conversion_id = ${idC}::uuid
    `;
    assert.equal(
      candidateRow.length,
      1,
      "test fixture must produce exactly one run candidate for the conversion",
    );
    const runCandidateId = String(candidateRow[0]!.id);

    const clientA = trackClient(
      "blk_c_d_audit_client_a",
      postgres(DATABASE_URL, { max: 1, prepare: false }),
    );
    const clientB = trackClient(
      "blk_c_d_audit_client_b",
      postgres(DATABASE_URL, { max: 1, prepare: false }),
    );
    try {
      const concurrentInsertSql = `
        INSERT INTO reconciliation_audit_events (
          id, network, source_conversion_key, idempotency_key,
          conversion_id, previous_status, next_status,
          decision, reason_code, human_reason,
          network_commission, user_cashback, platform_profit,
          actor_kind, actor_user_id, actor_role,
          reconciliation_run_id, run_candidate_id
        ) VALUES (
          $1::uuid, 'shopee', $2, $3,
          $4::uuid, 'pending', 'approved',
          'approve', 'approved_via_test_concurrent', 'concurrent test',
          33000, 19800, 13200,
          'admin', $5::uuid, 'admin',
          $6::uuid, $7::uuid
        )
        ON CONFLICT (run_candidate_id) WHERE run_candidate_id IS NOT NULL DO NOTHING
        RETURNING id
      `;
      const params: ReadonlyArray<unknown> = [
        sourceC,
        // Stable idempotency key unique to this test row so the
        // (network, idempotency_key) UNIQUE constraint is
        // guaranteed to collide on retries within the test.
        fixtureGraph.directConcurrentIdempotencyKey,
        idC,
        ADMIN_ACTOR_ID,
        dry.reconciliationRunId,
        runCandidateId,
      ];

      const tryInsert = async (
        client: postgres.Sql<Record<string, never>>,
        auditId: string,
      ): Promise<{ inserted: boolean; rowCount: number }> => {
        const rows = await client.unsafe(concurrentInsertSql, [
          auditId,
          ...params,
        ] as never[]);
        return { inserted: rows.length === 1, rowCount: rows.length };
      };

      const [a, b] = await settleConcurrentDatabaseBranches(
        "blk_c_d_concurrent_audit_insert",
        "reconciliation_audit_events",
        [
          {
            role: "audit_insert_client_a",
            promise: tryInsert(clientA, fixtureGraph.auditIds[1]!),
          },
          {
            role: "audit_insert_client_b",
            promise: tryInsert(clientB, fixtureGraph.auditIds[2]!),
          },
        ] as const,
      );
      const insertedTotal = (a.inserted ? 1 : 0) + (b.inserted ? 1 : 0);
      assert.equal(
        insertedTotal,
        1,
        "exactly one of the two concurrent inserts lands a row",
      );

      const auditRows = await admin`
        SELECT id::text AS id, run_candidate_id::text AS run_candidate_id
        FROM reconciliation_audit_events
        WHERE conversion_id = ${idC}::uuid
      `;
      assert.equal(
        auditRows.length,
        1,
        "exactly one audit row persisted under concurrent insert",
      );
      assert.equal(
        auditRows
          .map((row) => String(row.run_candidate_id))
          .filter((value, index, values) => values.indexOf(value) === index).length,
        1,
        "single run_candidate_id across audit rows",
      );
      assert.ok(
        [fixtureGraph.auditIds[1], fixtureGraph.auditIds[2]].includes(
          String(auditRows[0]!.id),
        ),
        "the durable row uses exactly one of the two owned audit IDs",
      );
    } finally {
      assert.notStrictEqual(clientA, clientB);
    }
  });

  test("BLK F: row with no source evidence cannot advance; pure mapper refuses", async (repositoryDependencies) => {
    const idF = nextPreallocatedUuid();
    const sourceF = sourceKeyFromUuid(idF);
    // Insert a conversion with NO validation_status, NO
    // settlement_status, NO ingestion_event_id, NO matching
    // shopee_csv_row -> mapper will refuse with
    // rejected_missing_provenance.
    await insertConversion({
      id: idF,
      externalOrderId: "blkF-" + idF.slice(-8),
      sourceKey: sourceF,
      status: "pending",
      commission: 20000,
      validationStatus: null,
      settlementStatus: null,
      ingestionEventId: null,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: sourceF,
    });
    // because the mapper flagged it as a skip. Either way the
    // conversion status must remain unchanged.
    const skippedInRun = await admin`
      SELECT count(*)::int AS n
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
        AND conversion_id = ${idF}::uuid
    `;
    assert.equal(
      Number(skippedInRun[0]!.n),
      0,
      "missing-evidence row never becomes a candidate",
    );
    const commitResult = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    const appliedForRow = commitResult.applied.find(
      (d) => d.conversionId === idF,
    );
    assert.equal(appliedForRow, undefined);
    const convAfter = await admin`
      SELECT status FROM conversions WHERE id = ${idF}::uuid
    `;
    assert.equal(convAfter[0]!.status, "pending");
  });

  test("BLK G: source-evidence mapper refuses unknown networks closed; manual is the only non-Shopee network in scope", async (repositoryDependencies) => {
    // The pure mapper is the authoritative closed-enum gate.
    // We exercise it directly here so the test does not depend
    // on the (intentionally type-safe) repository network
    // argument: a runtime-unknown value MUST produce a closed
    // refusal with a closed reason code, never a silent
    // reinterpretation to "manual".
    const { mapSourceEvidenceToDecision } = await import(
      "../src/lib/reconciliation/source-evidence"
    );
    const unknown = mapSourceEvidenceToDecision({
      network: "tiktok" as never,
      currentStatus: "pending",
      validationStatus: "approved",
      settlementStatus: null,
      sourceConversionKey: "0".repeat(64),
      ingestionEventId: "00000000-0000-4000-8000-000000000001",
      persistedLinkKind: "unique",
      sourceStatus: "confirmed_eligible",
    });
    assert.equal(unknown.kind, "skip");
    if (unknown.kind === "skip") {
      assert.equal(unknown.reasonCode, "rejected_unknown_network");
    }
    // Sanity: shopee + confirmed_eligible still produces a valid
    // apply decision, proving the refusal above is specific to
    // unknown networks and not a blanket refusal.
    const shopee = mapSourceEvidenceToDecision({
      network: "shopee",
      currentStatus: "pending",
      validationStatus: "approved",
      settlementStatus: null,
      sourceConversionKey: "1".repeat(64),
      ingestionEventId: "00000000-0000-4000-8000-000000000001",
      persistedLinkKind: "unique",
      sourceStatus: "confirmed_eligible",
    });
    assert.equal(shopee.kind, "apply");
    // Phase 20K 4A2B: "manual" no longer has a durable
    // persisted provenance contract (no ingestion pipeline
    // persists a manual-network conversion with
    // (ingestion_event, source_conversion_key, csv row)
    // evidence) and is therefore REMOVED from the automatic
    // reconciliation allowlist. The mapper refuses the row
    // closed with `rejected_unknown_network` rather than
    // auto-approving it merely because the commission amounts
    // look valid.
    const manual = mapSourceEvidenceToDecision({
      network: "manual",
      currentStatus: "pending",
      validationStatus: "approved",
      settlementStatus: null,
      sourceConversionKey: "2".repeat(64),
      ingestionEventId: "00000000-0000-4000-8000-000000000001",
      persistedLinkKind: "unique",
      sourceStatus: "confirmed_eligible",
    });
    assert.equal(manual.kind, "skip");
    assert.equal(manual.reasonCode, "rejected_unknown_network");
  });

  test("Phase 20K follow-up 2: a NEW run is required to advance an already-approved row to payable", async (repositoryDependencies) => {
    // BLK B requires that advancing approved -> payable is
    // impossible via "click Commit again on the same run id".
    // This test proves it: the seed conversion has been
    // advanced to `approved` by the BLK B test. We attempt a
    // serial retry on the SAME run id and assert status stays
    // at `approved` (no payable mutation, no second audit
    // row).
    const idB = fixtureGraph.conversionIds[1]!;
    const runId = fixtureGraph.dryRunPlans[1]!.reconciliationRunId;
    const result = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: runId,
    });
    const appliedFor = result.applied.find(
      (d) => d.conversionId === idB,
    );
    assert.equal(appliedFor, undefined);
    const auditCount = await admin`
      SELECT count(*)::int AS n
      FROM reconciliation_audit_events
      WHERE conversion_id = ${idB}::uuid
    `;
    assert.ok(
      Number(auditCount[0]!.n) === 1,
      "the originally-approved conversion must still have its one audit row",
    );
  });

  // ====================================================================
  // Phase 20K follow-up 4 -- additional money-safety / provenance tests
  // ====================================================================

  test("BLK 1 (60/40 production path): 10000 -> user 6000 / platform 4000; conversion row updated on commit", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    // Seed the schema-valid persisted 60/40 policy snapshot. Migration
    // 0027 now prevents an inconsistent split from existing at rest.
    await insertConversion({
      id,
      externalOrderId: "blk1-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 10000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1, "10000 with approved evidence must plan one apply");

    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(commit.applied.length, 1);

    const after = await admin`
      SELECT network_commission::text AS n,
             user_cashback::text AS u,
             platform_profit::text AS p,
             status
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(after[0]!.n, "10000", "network_commission preserved");
    assert.equal(after[0]!.u, "6000", "user_cashback recomputed to 60%");
    assert.equal(after[0]!.p, "4000", "platform_profit recomputed to 40%");
    assert.equal(after[0]!.status, "approved");

    const audit = await admin`
      SELECT network_commission::text AS n,
             user_cashback::text AS u,
             platform_profit::text AS p
      FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(audit.length, 1, "one durable audit row");
    assert.equal(audit[0]!.n, "10000");
    assert.equal(audit[0]!.u, "6000");
    assert.equal(audit[0]!.p, "4000");
  });

  test("BLK 2 (fail-closed provenance): missing tracking link skips the conversion", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    // Insert a conversion with NO matching tracking_links row.
    // The loader's tracking_link_present check returns false,
    // so persistedLinkKind = "missing" and the candidate MUST
    // be skipped.
    await insertConversion({
      id,
      externalOrderId: "blk2m-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 20000,
      validationStatus: "approved",
      ingestionEventId,
    });
    // Point tracking_link_id at a UUID that does not exist.
    await admin`UPDATE conversions SET tracking_link_id = ${nextPreallocatedUuid()}::text WHERE id = ${id}::uuid`;

    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 0, "missing tracking link cannot become a candidate");
    const after = await admin`SELECT status FROM conversions WHERE id = ${id}::uuid`;
    assert.equal(after[0]!.status, "pending", "status unchanged on skipped dry-run");
  });

  test("BLK 2 (fail-closed provenance): two rows sharing the same foreign-owned tracking_link both fail closed as owner_mismatch", async (repositoryDependencies) => {
    // Phase 20K 4J2-C schema-valid ambiguity contract:
    //
    // The previous version of this test reached the loader's
    // "external_order_collision" gate by violating the live
    // `(network, external_order_id)` UNIQUE constraint via
    // DROP CONSTRAINT / UPDATE / ADD CONSTRAINT inside a
    // `try...finally` block. That violated Phase 20K
    // safety invariants -- the schema must NOT be weakened
    // even temporarily, and the test should not need any
    // DDL to demonstrate loader ambiguity.
    //
    // The ONLY schema-valid natural ambiguity the loader can
    // produce from real DB rows is `persistedLinkKind =
    // "owner_mismatch"`: a `conversions.tracking_link_id`
    // value that EXISTS in `tracking_links` but whose
    // `publisher_id` differs from the conversion's
    // `publisher_id`. The loader query
    //
    //   SELECT 1 FROM tracking_links tl
    //    WHERE tl.id::text = c.tracking_link_id
    //      AND tl.publisher_id = c.publisher_id
    //
    // returns false -- one row per conversion is enough to
    // fire "owner_mismatch" without colliding on the network-
    // level keys. To prove the loader handles MULTIPLE
    // ambiguous rows in one scope, this test inserts two
    // conversions that BOTH point at the SAME foreign-owned
    // tracking_link, then dry-runs with an explicit scope
    // covering both source keys.
    //
    // Both candidates must:
    //   (a) be classified as `owner_mismatch` -> skip,
    //   (b) carry reason code
    //       `rejected_attribution_owner_mismatch`,
    //   (c) leave `conversions.status` and money columns
    //       unchanged.
    //
    // No DROP / ADD CONSTRAINT, no UPDATE forcing schema-
    // unique-key collisions, and no try/finally DDL
    // restoration block. The schema is identical before
    // and after this test.
    const otherPublisherId = nextPreallocatedUuid();
    const foreignTrackingLinkId = nextPreallocatedUuid();
    const safeTag = RUN_TAG.replace(/[^a-zA-Z0-9]/g, "");
    const tlShortCode = ("ci42bl2c-" + safeTag).slice(0, 24).padEnd(10, "0");
    const tlNetworkSubId =
      "vaflnk" + sha256Hex(safeTag + "-blk2c").slice(0, 24);
    const tlDestinationUrl =
      "https://shopee.vn/product/ci/blk2c/" + RUN_TAG + "/1/1";
    const tlAffiliateUrl =
      "https://affiliate.shopee.vn/?subid=" + tlNetworkSubId;

    await admin`
      INSERT INTO auth.users (id, raw_user_meta_data)
      VALUES (${otherPublisherId}::uuid, '{}'::jsonb)
    `;
    const foreignProfile = await admin`SELECT user_id::text AS user_id FROM profiles WHERE user_id = ${otherPublisherId}::uuid`;
    assert.deepEqual(foreignProfile.map((row) => String(row.user_id)), [otherPublisherId]);
    await admin`
      INSERT INTO tracking_links (
        id, publisher_id, platform, destination_url,
        affiliate_url, network_sub_id, short_code, status,
        campaign_id, offer_id
      )
      VALUES (
        ${foreignTrackingLinkId}::uuid,
        ${otherPublisherId}::uuid,
        ${"shopee"}::text,
        ${tlDestinationUrl}::text,
        ${tlAffiliateUrl}::text,
        ${tlNetworkSubId}::text,
        ${tlShortCode}::text,
        ${"active"}::text,
        ${CAMPAIGN_ID}::text,
        ${OFFER_ID}::text
      )
    `;

    const id1 = nextPreallocatedUuid();
    const id2 = nextPreallocatedUuid();
    const source1 = sourceKeyFromUuid(id1);
    const source2 = sourceKeyFromUuid(id2);
    const ingest1 = nextPreallocatedUuid();
    const ingest2 = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingest1,
      sourceKey: source1,
      processingStatus: "succeeded",
    });
    await insertIngestionEvent({
      id: ingest2,
      sourceKey: source2,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id: id1,
      externalOrderId: "blk2c-" + id1.slice(-8),
      sourceKey: source1,
      status: "pending",
      commission: 15000,
      validationStatus: "approved",
      ingestionEventId: ingest1,
    });
    await insertConversion({
      id: id2,
      externalOrderId: "blk2c-" + id2.slice(-8),
      sourceKey: source2,
      status: "pending",
      commission: 25000,
      validationStatus: "approved",
      ingestionEventId: ingest2,
    });
    // Both conversions now point at the SAME foreign-owned
    // tracking_link. The loader's
    // `tracking_link_publisher_match` returns false for both,
    // so the classifier must produce
    // `persistedLinkKind = "owner_mismatch"` for both rows.
    await admin`
      UPDATE conversions
      SET tracking_link_id = ${foreignTrackingLinkId}::text
      WHERE id IN (${id1}::uuid, ${id2}::uuid)
    `;

    // Money + status snapshot for invariant assertions.
    const before = await admin`
      SELECT id::text AS id, status::text AS status,
             network_commission::bigint AS commission,
             user_cashback::bigint       AS user_cashback,
             platform_profit::bigint     AS platform_profit
      FROM conversions
      WHERE id IN (${id1}::uuid, ${id2}::uuid)
      ORDER BY id
    `;

    // Scope the dry-run to BOTH source keys. The loader's
    // collision counts are scoped to this set, so the two
    // distinct conversions share BOTH the
    // `(network, external_order_id)` keys (different) and
    // the `tracking_link_id` key (same), and both are
    // classified as `owner_mismatch`. The pre-run scoping is
    // what turns this fixture into a "multiple ambiguous
    // rows in one scope" proof instead of a single-row
    // fail-closed proof (which is already covered by
    // `BLK 4A2B`).
    const dry = await dryRunWithScope(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceConversionKeys: [source1, source2],
    });

    assert.equal(
      dry.appliedCount,
      0,
      "foreign-owned tracking link cannot become an applied candidate",
    );

    // Multi-row ambiguity: both scoped rows must be skipped
    // with the same owner_mismatch reason code (ambiguity
    // count greater than one).
    const skipForId1 = dry.skipped.find((s) => s.conversionId === id1);
    const skipForId2 = dry.skipped.find((s) => s.conversionId === id2);
    assert.ok(skipForId1, "ambiguous row id1 produced a skip record");
    assert.ok(skipForId2, "ambiguous row id2 produced a skip record");
    assert.equal(
      skipForId1!.reasonCode,
      "rejected_attribution_owner_mismatch",
      "ambiguous row id1 maps to rejected_attribution_owner_mismatch",
    );
    assert.equal(
      skipForId2!.reasonCode,
      "rejected_attribution_owner_mismatch",
      "ambiguous row id2 maps to rejected_attribution_owner_mismatch",
    );
    // No second reason code should leak into the same scope
    // for these rows.
    const allOurSkips = dry.skipped.filter(
      (s) => s.conversionId === id1 || s.conversionId === id2,
    );
    assert.equal(
      allOurSkips.length,
      2,
      "exactly two ambiguous rows in scope, both classified as owner_mismatch",
    );

    // Invariants: conversion status + money must NOT mutate.
    const after = await admin`
      SELECT id::text AS id, status::text AS status,
             network_commission::bigint AS commission,
             user_cashback::bigint       AS user_cashback,
             platform_profit::bigint     AS platform_profit
      FROM conversions
      WHERE id IN (${id1}::uuid, ${id2}::uuid)
      ORDER BY id
    `;
    assert.equal(after.length, before.length, "no row created or lost");
    for (let i = 0; i < before.length; i++) {
      assert.equal(
        after[i]!.id,
        before[i]!.id,
        `id unchanged on row ${i}`,
      );
      assert.equal(
        after[i]!.status,
        "pending",
        `status unchanged (still pending) on row ${before[i]!.id}`,
      );
      assert.equal(
        Number(after[i]!.commission),
        Number(before[i]!.commission),
        `commission unchanged on row ${before[i]!.id}`,
      );
      assert.equal(
        Number(after[i]!.user_cashback),
        Number(before[i]!.user_cashback),
        `user_cashback unchanged on row ${before[i]!.id}`,
      );
      assert.equal(
        Number(after[i]!.platform_profit),
        Number(before[i]!.platform_profit),
        `platform_profit unchanged on row ${before[i]!.id}`,
      );
    }

    // No audit event may be written for a fail-closed skip.
    const audit = await admin`
      SELECT count(*)::int AS n
      FROM reconciliation_audit_events
      WHERE conversion_id IN (${id1}::uuid, ${id2}::uuid)
    `;
    assert.equal(
      Number(audit[0]!.n),
      0,
      "fail-closed skip must not produce any audit event",
    );

  });

  // -----------------------------------------------------------------
  // Phase 20K checkpoint 4A2 -- persisted attribution provenance at the
  // database boundary.
  // -----------------------------------------------------------------
  //
  // The 4A1 dry-run ignores a wrong persisted `user_cashback` /
  // `platform_profit`. 4A2 closes the attribution-provenance gate:
  // when the persisted attribution cannot be confirmed, the candidate
  // is skipped, no status mutation is applied, and no audit event is
  // written. The scenarios covered here use the real schema rows
  // (tracking_links, profiles, conversions) the production loader
  // actually queries.
  test(
    "BLK 4A2B (fail-closed provenance): tracking_link belongs to a DIFFERENT publisher -> dry-run skips with rejected_attribution_owner_mismatch",
    async (repositoryDependencies) => {

      // Build a second publisher + a tracking_link that the
      // second publisher OWNS. The conversion we are about to
      // insert still belongs to PUBLISHER_ID, but its
      // tracking_link_id points at the OTHER publisher's
      // tracking_link row. The loader's
      // `tracking_link_publisher_match` flag must return false,
      // so persistedLinkKind becomes "owner_mismatch" and the
      // candidate must be skipped with the diagnostic closed
      // reason code "rejected_attribution_owner_mismatch" (NOT
      // the previous misleading "duplicate" bucket).
      const otherPublisherId = nextPreallocatedUuid();
      const otherTrackingLinkId = nextPreallocatedUuid();
      const safeTag = RUN_TAG.replace(/[^a-zA-Z0-9]/g, "");
      const tlShortCode = ("ci42a2-" + safeTag).slice(0, 24).padEnd(10, "0");
      const tlNetworkSubId =
        "vaflnk" + sha256Hex(safeTag + "-4a2").slice(0, 24);
      const tlDestinationUrl =
        "https://shopee.vn/product/ci/4a2/" + RUN_TAG + "/1/1";
      const tlAffiliateUrl =
        "https://affiliate.shopee.vn/?subid=" + tlNetworkSubId;

      await admin`
        INSERT INTO auth.users (id, raw_user_meta_data)
        VALUES (${otherPublisherId}::uuid, '{}'::jsonb)
      `;
      const mismatchProfile = await admin`SELECT user_id::text AS user_id FROM profiles WHERE user_id = ${otherPublisherId}::uuid`;
      assert.deepEqual(mismatchProfile.map((row) => String(row.user_id)), [otherPublisherId]);
      await admin`
        INSERT INTO tracking_links (
          id, publisher_id, platform, destination_url,
          affiliate_url, network_sub_id, short_code, status,
          campaign_id, offer_id
        )
        VALUES (
          ${otherTrackingLinkId}::uuid,
          ${otherPublisherId}::uuid,
          ${"shopee"}::text,
          ${tlDestinationUrl}::text,
          ${tlAffiliateUrl}::text,
          ${tlNetworkSubId}::text,
          ${tlShortCode}::text,
          ${"active"}::text,
          ${CAMPAIGN_ID}::text,
          ${OFFER_ID}::text
        )
      `;

    const id = nextPreallocatedUuid();
      const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
      await insertIngestionEvent({
        id: ingestionEventId,
        sourceKey: source,
        processingStatus: "succeeded",
      });
      await insertConversion({
        id,
        externalOrderId: "blk4a2-" + id.slice(-8),
        sourceKey: source,
        status: "pending",
        commission: 20000,
        validationStatus: "approved",
        ingestionEventId,
      });
      // Point the conversion at the OTHER publisher's
      // tracking_link row. `tracking_link_id` exists in the
      // table, but its `publisher_id` is `otherPublisherId`, not
      // PUBLISHER_ID.
      await admin`UPDATE conversions SET tracking_link_id = ${otherTrackingLinkId}::text WHERE id = ${id}::uuid`;

      const dry = await dryRun(repositoryDependencies, {
        actorUserId: ADMIN_ACTOR_ID,
        actorRole: "admin",
        network: "shopee",
        sourceKey: source,
      });
      assert.equal(
        dry.appliedCount,
        0,
        "wrong-owner tracking link cannot become an applied candidate",
      );
      const skipForId = dry.skipped.find((s) => s.conversionId === id);
      assert.ok(
        skipForId,
        "wrong-owner link produced a skip record (reason codes are documented)",
      );
      assert.equal(
        skipForId!.reasonCode,
        "rejected_attribution_owner_mismatch",
        "wrong-owner link maps to rejected_attribution_owner_mismatch (NOT the generic missing-provenance bucket)",
      );
      const after = await admin`SELECT status FROM conversions WHERE id = ${id}::uuid`;
      assert.equal(
        after[0]!.status,
        "pending",
        "status unchanged on skipped dry-run",
      );

    },
  );

  test(
    "BLK 4A2 (fail-closed provenance): missing publisher profile -> loader returns persistedLinkKind=missing (locked at pure unit layer)",
    async (repositoryDependencies) => {
      // The DB-level reproduction of "missing publisher profile" is
      // rejected by the schema's foreign key constraint
      // (`conversions.publisher_id REFERENCES profiles.user_id`).
      // The integration test therefore asserts that the FK
      // boundary itself enforces the invariant -- the production
      // code can never see a row whose `publisher_id` has no
      // `profiles.user_id`, so the loader's
      // `EXISTS (SELECT 1 FROM profiles ...)` clause is a redundant
      // safety net locked at the pure-helper layer
      // (`classify-source-evidence.test.ts`, scenario 2).
      const fk = await admin`
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'conversions_publisher_id_profiles_user_id_fk'
          AND table_name = 'conversions'
      `;
      assert.equal(
        fk.length,
        1,
        "FK conversions.publisher_id -> profiles.user_id is enforced",
      );
    },
  );

  test("BLK 3 (stale evidence): change source evidence after dry-run -> commit must NOT mutate", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk3-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 20000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1, "dry-run plans an apply");

    // Change the source evidence AFTER dry-run: mutate
    // validation_status so the planned fingerprint no longer
    // matches the live row.
    await admin`UPDATE conversions SET validation_status = 'rejected' WHERE id = ${id}::uuid`;

    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(
      commit.applied.find((d) => d.conversionId === id),
      undefined,
      "stale evidence must NOT be applied",
    );
    const after = await admin`SELECT status, validation_status FROM conversions WHERE id = ${id}::uuid`;
    assert.equal(after[0]!.status, "pending", "status stays pending on drift");
    assert.equal(after[0]!.validation_status, "rejected");
    const audit = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(
      Number(audit[0]!.n),
      0,
      "stale evidence must NOT produce a durable audit event",
    );
  });

  // ===================================================================
  // Phase 20K checkpoint 4B -- commit-time source-evidence
  // revalidation. Each test below is a focused PostgreSQL proof
  // that a single field drift between dry-run and commit refuses
  // the transition with the closed `rejected_stale_source_evidence`
  // reason and produces ZERO mutation + ZERO audit event.
  // ===================================================================

  test("Phase 20K 4B (1) unchanged evidence: commit applies the planned transition and produces one audit event", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4b1-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 30000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1, "dry-run plans an apply");
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.ok(
      commit.applied.find((a) => a.conversionId === id),
      "clean evidence must be applied",
    );
    const after =
      await admin`SELECT status, network_commission::text AS c, user_cashback::text AS u, platform_profit::text AS p FROM conversions WHERE id = ${id}::uuid`;
    assert.equal(after[0]!.status, "approved", "status advanced to approved");
    assert.equal(Number(after[0]!.c), 30000, "network_commission unchanged");
    assert.equal(Number(after[0]!.u), 18000, "user_cashback is 60%");
    assert.equal(Number(after[0]!.p), 12000, "platform_profit is 40%");
    const audit = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(
      Number(audit[0]!.n),
      1,
      "clean evidence must produce exactly one durable audit event",
    );
  });

  test("Phase 20K 4B (2) validation_status changed after dry-run: commit must NOT mutate and must report rejected_stale_source_evidence", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4b2-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 22000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1);
    // Mutate validation_status AFTER dry-run.
    await admin`UPDATE conversions SET validation_status = 'rejected' WHERE id = ${id}::uuid`;
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(
      commit.applied.find((a) => a.conversionId === id),
      undefined,
      "stale evidence must NOT be applied",
    );
    const skip = commit.skipped.find((s) => s.conversionId === id);
    assert.ok(skip, "conversion must be reported as skipped");
    assert.equal(
      skip.reasonCode,
      "rejected_stale_source_evidence",
      "validation drift must report the dedicated 4B reason",
    );
    const after = await admin`SELECT status FROM conversions WHERE id = ${id}::uuid`;
    assert.equal(after[0]!.status, "pending", "status stays pending on drift");
    const audit = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(
      Number(audit[0]!.n),
      0,
      "stale evidence must NOT produce a durable audit event",
    );
  });

  test("Phase 20K 4B (3) settlement_status changed after dry-run: commit must NOT mutate", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4b3-" + id.slice(-8),
      sourceKey: source,
      // Phase 20K checkpoint 4F1B HARD-BLOCK forbids the
      // mapper from planning `approved -> payable` transitions;
      // starting at status='approved' makes the dry-run plan
      // zero candidates. The 4B(3) test asserts that
      // `settlement_status` drift between dry-run and commit is
      // detected, which is independent of the conversion's
      // initial status. Start at `pending` so the dry-run plans
      // `pending -> approved`; mutate `settlement_status`
      // post-dry-run; the 4B revalidation block fires
      // `stale_settlement_status` and surfaces
      // `rejected_stale_source_evidence` exactly as before.
      status: "pending",
      commission: 18000,
      validationStatus: "approved",
      settlementStatus: "payable",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1);
    // Mutate settlement_status AFTER dry-run.
    await admin`UPDATE conversions SET settlement_status = 'not_payable' WHERE id = ${id}::uuid`;
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(
      commit.applied.find((a) => a.conversionId === id),
      undefined,
      "stale evidence must NOT be applied",
    );
    const skip = commit.skipped.find((s) => s.conversionId === id);
    assert.ok(skip, "conversion must be reported as skipped");
    assert.equal(
      skip.reasonCode,
      "rejected_stale_source_evidence",
      "settlement drift must report the dedicated 4B reason",
    );
    const after =
      await admin`SELECT status, settlement_status FROM conversions WHERE id = ${id}::uuid`;
    assert.equal(after[0]!.status, "pending", "status stays pending on drift");
    const audit = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(
      Number(audit[0]!.n),
      0,
      "stale evidence must NOT produce a durable audit event",
    );
  });

  test("Phase 20K 4B (4) source order becomes cancelled after dry-run: commit must NOT mutate", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4b4-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 25000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1);
    // Phase 20K checkpoint 4B5 -- defensive CSV row-count
    // assertion. If the per-call-site `source_row_number` derivation
    // ever regresses and a sibling test silently steals this
    // fixture's (batch_id, source_row_number) tuple, this assertion
    // fails loudly BEFORE the cancellation drift assertion can be
    // confused by missing evidence. Exactly one CSV row must exist
    // for this fixture's `row_fingerprint_sha256` immediately
    // before flipping `order_status`.
    const csvRows = await admin`
      SELECT count(*)::int AS n FROM shopee_csv_rows
      WHERE row_fingerprint_sha256 = ${source}::text
    `;
    assert.equal(
      Number(csvRows[0]!.n),
      1,
      "expected exactly one shopee_csv_rows row to back this fixture",
    );
    // Mutate the underlying CSV row's order_status to CANCELLED
    // AFTER dry-run so the source-evidence loader reports a
    // cancelled source-status.
    await admin`UPDATE shopee_csv_rows SET order_status = 'CANCELLED' WHERE row_fingerprint_sha256 = ${source}::text`;
    const cancelledRows = await admin`
      SELECT count(*)::int AS n FROM shopee_csv_rows
      WHERE row_fingerprint_sha256 = ${source}::text
        AND order_status = 'CANCELLED'
    `;
    assert.equal(
      Number(cancelledRows[0]!.n),
      1,
      "CANCELLED update must affect exactly one source row",
    );
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(
      commit.applied.find((a) => a.conversionId === id),
      undefined,
      "cancelled order must NOT be applied",
    );
    const skip = commit.skipped.find((s) => s.conversionId === id);
    assert.ok(skip, "conversion must be reported as skipped");
    assert.equal(
      skip.reasonCode,
      "rejected_stale_source_evidence",
      "cancelled-order drift must report the dedicated 4B reason",
    );
    const after = await admin`SELECT status FROM conversions WHERE id = ${id}::uuid`;
    assert.equal(after[0]!.status, "pending");
    const audit = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(Number(audit[0]!.n), 0);
  });

  test("Phase 20K 4B (5) network_commission changed after dry-run: commit must NOT mutate", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4b5-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 15000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1);
    // Mutate the persisted money AFTER dry-run. The dry-run
    // planner recorded the split for 15000 -> 9000 / 6000. We
    // atomically rewrite all three columns to a DIFFERENT but
    // internally-consistent 60/40 split so the database CHECK
    // constraint `conversions_commission_allocation_check`
    // accepts the row (user_cashback + platform_profit must
    // equal network_commission). The new commission is 17000,
    // which `splitCommissionFloor` would map to
    // 10200 / 6800 -- different from the persisted plan, so
    // `compareLiveEvidenceAgainstPlan` must surface
    // `stale_network_commission`.
    const newNetworkCommission = 17000;
    const newUserCashback = Math.floor((newNetworkCommission * 6000) / 10000);
    const newPlatformProfit = newNetworkCommission - newUserCashback;
    await admin`
      UPDATE conversions
      SET network_commission = ${newNetworkCommission}::bigint,
          user_cashback      = ${newUserCashback}::bigint,
          platform_profit    = ${newPlatformProfit}::bigint
      WHERE id = ${id}::uuid
    `;
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(
      commit.applied.find((a) => a.conversionId === id),
      undefined,
      "stale commission must NOT be applied",
    );
    const skip = commit.skipped.find((s) => s.conversionId === id);
    assert.ok(skip);
    assert.equal(
      skip.reasonCode,
      "rejected_stale_source_evidence",
      "commission drift must report the dedicated 4B reason",
    );
    const after = await admin`
      SELECT status,
             network_commission::text AS c,
             user_cashback::text      AS uc,
             platform_profit::text    AS pp
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(after[0]!.status, "pending");
    assert.equal(
      Number(after[0]!.c),
      newNetworkCommission,
      "network_commission is the post-dry-run value, not the planned one",
    );
    assert.equal(
      Number(after[0]!.uc),
      newUserCashback,
      "user_cashback is the post-dry-run 60/40 share, not the planned one",
    );
    assert.equal(
      Number(after[0]!.pp),
      newPlatformProfit,
      "platform_profit is the post-dry-run 60/40 remainder, not the planned one",
    );
    const audit = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(Number(audit[0]!.n), 0);
  });

  test("Phase 20K 4B (6) attribution ownership pivot: tracking_link's publisher_id no longer matches the conversion's publisher_id", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4b6-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 17000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1);
    // Mutate the tracking_link's publisher_id to a different
    // publisher AFTER dry-run. The loader's
    // `tracking_link_publisher_match` returns false -> live
    // persistedLinkKind becomes "owner_mismatch" -> the
    // revalidation helper fails closed.
    //
    // Phase 20K checkpoint 4B3 -- the new tracking-link owner
    // must satisfy the `tracking_links_publisher_id_profiles_user_id_fk`
    // foreign key. We create a SECOND valid publisher/profile
    // (auth.users row + profiles row mirroring the bootstrap()
    // pattern), then UPDATE the tracking_link to point at it.
    // The conversion's `publisher_id` is left untouched -- the
    // pivot is on the link ownership, not on the conversion.
    await admin`
      INSERT INTO auth.users (id, raw_user_meta_data)
      VALUES (${SECOND_PUBLISHER_ID}::uuid, '{}'::jsonb)
    `;
    const pivotProfile = await admin`SELECT user_id::text AS user_id FROM profiles WHERE user_id = ${SECOND_PUBLISHER_ID}::uuid`;
    assert.deepEqual(pivotProfile.map((row) => String(row.user_id)), [SECOND_PUBLISHER_ID]);
    await admin`UPDATE tracking_links SET publisher_id = ${SECOND_PUBLISHER_ID}::uuid WHERE id = ${TRACKING_LINK_UUID}::uuid`;
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(
      commit.applied.find((a) => a.conversionId === id),
      undefined,
      "ownership pivot must NOT be applied",
    );
    const skip = commit.skipped.find((s) => s.conversionId === id);
    assert.ok(skip);
    assert.equal(
      skip.reasonCode,
      "rejected_stale_source_evidence",
      "ownership pivot must report the dedicated 4B reason",
    );
    // Phase 20K checkpoint 4B3 -- the closed skip MUST carry a
    // typed drift reason that names the ownership/provenance
    // failure (stale_publisher_attribution or
    // stale_persisted_link_kind). We don't pin the exact label
    // here -- either is a correct description of "the link no
    // longer belongs to the conversion publisher" -- but the
    // reason MUST exist and MUST be one of those two. The
    // integration `commitRun` helper does not project
    // `metadata` into its narrowed TS type, but the underlying
    // `result.skipped` array DOES carry it from the production
    // path (see `reconciliation.repository.ts` skip.push), so
    // we re-import the production result to read it.
    const driftReason = (
      skip as unknown as { metadata?: { driftReason?: string } }
    ).metadata?.driftReason;
    assert.ok(
      driftReason === "stale_publisher_attribution" ||
        driftReason === "stale_persisted_link_kind",
      "ownership pivot drift reason must identify the attribution failure: " +
        String(driftReason),
    );
    const after = await admin`SELECT status FROM conversions WHERE id = ${id}::uuid`;
    assert.equal(after[0]!.status, "pending");
    const audit = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(Number(audit[0]!.n), 0);
    // Confirm the tracking-link owner is now the second
    // publisher -- the pivot must remain on disk after the
    // skipped commit. A new dry-run is required to re-plan
    // against the new owner.
    const linkOwner = await admin`
      SELECT publisher_id::text AS owner FROM tracking_links
      WHERE id = ${TRACKING_LINK_UUID}::uuid
    `;
    assert.equal(
      linkOwner[0]!.owner,
      SECOND_PUBLISHER_ID,
      "tracking_link owner must remain the second publisher after the skipped commit",
    );
    // Restore the tracking_link ownership for subsequent tests.
    await admin`UPDATE tracking_links SET publisher_id = ${PUBLISHER_ID}::uuid WHERE id = ${TRACKING_LINK_UUID}::uuid`;
  });

  test("Phase 20K 4B (7) conversion status changed after dry-run: commit must NOT mutate", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4b7-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 21000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1);
    // Advance the conversion's status to approved AFTER dry-run.
    // The expected previous status (pending) no longer matches.
    await admin`UPDATE conversions SET status = 'approved', approved_at = now() WHERE id = ${id}::uuid`;
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(
      commit.applied.find((a) => a.conversionId === id),
      undefined,
      "status drift must NOT be applied",
    );
    const skip = commit.skipped.find((s) => s.conversionId === id);
    assert.ok(skip);
    assert.equal(
      skip.reasonCode,
      "rejected_stale_source_evidence",
      "status drift must report the dedicated 4B reason",
    );
    const audit = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(Number(audit[0]!.n), 0);
  });

  test("Phase 20K 4B (8) unchanged evidence with correct 60/40: transition + one durable audit event are applied", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4b8-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 50000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1);
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.ok(
      commit.applied.find((a) => a.conversionId === id),
      "clean evidence + correct 60/40 must be applied",
    );
    const after =
      await admin`SELECT status, network_commission::text AS c, user_cashback::text AS u, platform_profit::text AS p FROM conversions WHERE id = ${id}::uuid`;
    assert.equal(after[0]!.status, "approved");
    assert.equal(Number(after[0]!.c), 50000);
    assert.equal(Number(after[0]!.u), 30000, "50000 * 60% = 30000");
    assert.equal(Number(after[0]!.p), 20000, "50000 * 40% = 20000");
    const auditRows = await admin`
      SELECT reason_code, network_commission::text AS c, user_cashback::text AS u, platform_profit::text AS p
      FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(auditRows.length, 1, "exactly one audit event");
    assert.equal(
      Number(auditRows[0]!.c),
      50000,
      "audit row records the live 60/40 money",
    );
    assert.equal(Number(auditRows[0]!.u), 30000);
    assert.equal(Number(auditRows[0]!.p), 20000);
  });

  // ----------------------------------------------------------------
  // Phase 20K checkpoint 4C -- REAL concurrent production commit.
  //
  // Two INDEPENDENT postgres connections (each with its own
  // singleton pool: max: 1) call commitReconciliationAsync on
  // the SAME reconciliationRunId at the same time. The
  // production commit path must serialize them correctly:
  //
  //   1. The first request to acquire the conversion row's
  //      SELECT ... FOR UPDATE lock runs to completion, INSERTs
  //      the audit claim with `ON CONFLICT (run_candidate_id)
  //      WHERE run_candidate_id IS NOT NULL DO NOTHING
  //      RETURNING id`, and UPDATEs the conversion.
  //   2. The second request blocks on the FOR UPDATE lock until
  //      the first request commits; then its `existingClaimRows`
  //      check observes the durable audit row and returns
  //      `rejected_duplicate_conversion` with `idempotentReplay:
  //      true` -- without UPDATING the conversion a second time
  //      and without producing a duplicate audit row.
  //
  // The test asserts ten invariants. Two independent client
  // executors are constructed over fixture-tracked clients so the
  // singleton db pool cannot serialise the two calls and every
  // backend can be closed without timed termination.
  test("Phase 20K 4C: two concurrent production commits of the same run apply once", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4c-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      // 70000 -> 42000 user (60%) + 28000 platform (40%).
      commission: 70000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1, "dry-run must plan exactly one apply");

    const repo = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    // (1) Two INDEPENDENT fixture-tracked postgres clients. Each
    // executor uses a fresh `postgres(url, { max: 1, prepare: false })`
    // connection, so the singleton db pool cannot serialise the calls.
    const execA = await buildTrackedReconciliationExecutor("phase20k_4c_commit_client_a");
    const execB = await buildTrackedReconciliationExecutor("phase20k_4c_commit_client_b");
    assert.notStrictEqual(
      execA,
      execB,
      "two executors must be distinct objects backed by independent connections",
    );
    const inputA = {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin" as const,
      reconciliationRunId: dry.reconciliationRunId,
      identifierPlan: nextCommitPlan(),
    };
    const inputB = { ...inputA, identifierPlan: nextCommitPlan() };
    // (2) Both production commit calls start concurrently, and the
    // settle-all boundary inspects every branch before propagating failure.
    const [a, b] = await settleConcurrentDatabaseBranches(
      "phase20k_4c_concurrent_commit",
      "reconciliation_runs",
      [
        {
          role: "commit_client_a",
          promise: repo.commitReconciliationAsync(inputA, execA),
        },
        {
          role: "commit_client_b",
          promise: repo.commitReconciliationAsync(inputB, execB),
        },
      ] as const,
    );

    // (3) Winner / loser partition by run-acquire semantics.
    //
    // Phase 20K checkpoint 4D2B -- run-lifecycle ownership.
    //
    // The lifecycle ownership boundary is the
    // `draft -> committing` compare-and-set UPDATE inside
    // commitReconciliationAsync. The request whose UPDATE
    // returns exactly one row OWNS the lifecycle and may
    // process candidates; the request whose UPDATE returns
    // zero rows MUST return immediately via
    // `returnImmediateLifecycleLoss`, performing zero
    // candidate-loop iterations and zero side effects.
    //
    // The loser is therefore identifiable as the result whose
    // `applied` array is empty AND whose `skipped` array contains
    // exactly one entry carrying `idempotentReplay: true` with
    // `reasonCode: "rejected_duplicate_conversion"`. Phase 20K
    // checkpoint 4J2-B supersedes the 4D2D "empty shape"
    // contract: the caller must receive a deterministic
    // representation of the idempotent result so the BLK 4
    // test (which runs the same concurrent pattern) can observe
    // `idempotentReplay: true` on the loser's skipped queue.
    // The durable mutation boundary is unchanged: exactly one
    // applied conversion + exactly one audit row + exactly one
    // candidate outcome -- the loser performs ZERO side
    // effects, only emits the idempotent-replay skip entry.
    const aIsLoser =
      a.applied.length === 0 &&
      a.skipped.length === 1 &&
      a.skipped[0]?.idempotentReplay === true &&
      a.skipped[0]?.reasonCode === "rejected_duplicate_conversion";
    const bIsLoser =
      b.applied.length === 0 &&
      b.skipped.length === 1 &&
      b.skipped[0]?.idempotentReplay === true &&
      b.skipped[0]?.reasonCode === "rejected_duplicate_conversion";
    assert.ok(
      aIsLoser !== bIsLoser,
      "exactly one request must return the immediate lifecycle-loss shape (applied=0 AND skipped=[idempotentReplay]) and the other must have processed the candidate (got a.applied=" +
        a.applied.length +
        " a.skipped=" +
        a.skipped.length +
        " b.applied=" +
        b.applied.length +
        " b.skipped=" +
        b.skipped.length +
        ")",
    );
    const loser = aIsLoser ? a : b;
    const winner = aIsLoser ? b : a;

    // ----------------------------------------------------------------
    // (1) Exactly one result contains one applied conversion.
    // ----------------------------------------------------------------
    assert.equal(
      winner.applied.length,
      1,
      "exactly one applied across the two concurrent commits (winner only)",
    );
    const appliedEntry = winner.applied.find(
      (x) => x.conversionId === id,
    );
    assert.ok(
      appliedEntry,
      "the applied entry must be for our conversion id",
    );

    // ----------------------------------------------------------------
    // (2) The other result is the immediate lifecycle-acquisition
    // loser -- applied=0, skipped=[1 idempotentReplay entry], all
    // summary counts=0, all totals=0. Loser must not have entered
    // the candidate loop, must not have attempted an audit claim,
    // must not have mutated the conversion row.
    // ----------------------------------------------------------------
    assert.equal(
      loser.applied.length,
      0,
      "loser applied count = 0 (immediate lifecycle-loss return)",
    );
    assert.equal(
      loser.skipped.length,
      1,
      "loser skipped count = 1 (idempotent-replay entry per candidate)",
    );
    assert.equal(
      loser.skipped[0]!.conversionId,
      id,
      "loser idempotent-replay skip entry must reference the candidate",
    );
    assert.equal(
      loser.skipped[0]!.idempotentReplay,
      true,
      "loser idempotent-replay flag must be true",
    );
    assert.equal(
      loser.skipped[0]!.reasonCode,
      "rejected_duplicate_conversion",
      "loser idempotent-replay reasonCode must be rejected_duplicate_conversion",
    );
    assert.equal(
      loser.summary.applied,
      0,
      "loser summary.applied = 0",
    );
    assert.equal(
      loser.summary.skipped,
      1,
      "loser summary.skipped = 1 (counts the idempotent-replay skip)",
    );
    assert.equal(
      loser.summary.reject,
      0,
      "loser summary.reject = 0",
    );
    assert.equal(
      loser.summary.totals.networkCommission,
      0,
      "loser totals.networkCommission = 0",
    );
    assert.equal(
      loser.summary.totals.userCashback,
      0,
      "loser totals.userCashback = 0",
    );
    assert.equal(
      loser.summary.totals.platformProfit,
      0,
      "loser totals.platformProfit = 0",
    );

    // ----------------------------------------------------------------
    // (3) Loser candidate-loop processing count is zero.
    //
    // The instrumentation here is the same one 4D2B already
    // established: the singleton durable state must show
    // EXACTLY ONE audit row, EXACTLY ONE conversion mutation,
    // and EXACTLY ONE candidate outcome -- values the loser
    // could only reach by entering the candidate loop and
    // completing its work. The loser's response shape above
    // (empty applied + empty skipped + all-zero summary) is
    // paired with these durable-state invariants to prove
    // the loser performed zero candidate-loop work.
    //
    // (5) Exactly one conversion transition exists.
    // (6) Exactly one durable audit row exists.
    // (7) Exactly one candidate durable outcome exists.
    // ----------------------------------------------------------------

    // (5) final conversion status equals the planned next status
    // and money equals the planned 60/40 split -- exactly one
    // mutation across both commits.
    const finalRow = await admin`
      SELECT status, network_commission::text AS c, user_cashback::text AS u, platform_profit::text AS p
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(finalRow[0]!.status, "approved");
    assert.equal(Number(finalRow[0]!.c), 70000);
    assert.equal(
      Number(finalRow[0]!.u),
      42000,
      "70000 * 60% = 42000",
    );
    assert.equal(
      Number(finalRow[0]!.p),
      28000,
      "70000 * 40% = 28000",
    );

    // (6) Exactly one durable audit row.
    const auditAll = await admin`
      SELECT id, run_candidate_id, conversion_id
      FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(
      auditAll.length,
      1,
      "exactly one durable audit event for the run candidate",
    );
    const distinctIds = auditAll
      .map((r) => String(r.id))
      .filter((value, index, values) => values.indexOf(value) === index);
    assert.equal(
      distinctIds.length,
      auditAll.length,
      "audit ids must be unique",
    );
    const distinctRunCandidates = auditAll
      .map((r) => String(r.run_candidate_id))
      .filter((value, index, values) => values.indexOf(value) === index);
    assert.equal(
      distinctRunCandidates.length,
      auditAll.length,
      "audit run_candidate_id must be unique",
    );

    // (7) Exactly one candidate durable outcome -- the
    // candidate row reflects the winner only.
    const candOut = await admin`
      SELECT processing_outcome, processing_completed_at
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(candOut.length, 1);
    assert.equal(
      String(candOut[0]!.processing_outcome),
      "applied",
      "candidate outcome reflects the winner only",
    );
    assert.ok(
      candOut[0]!.processing_completed_at !== null,
      "winner set processing_completed_at; loser must not have touched this column",
    );

    // (8) Final run status = committed.
    const runFinal = await admin`
      SELECT status, committed_at
      FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(runFinal[0]!.status, "committed");
    assert.ok(runFinal[0]!.committed_at !== null);

    // (9) No rejected_terminal_state in either response.
    for (const r of [a, b] as const) {
      for (const s of r.skipped) {
        assert.notEqual(
          s.reasonCode,
          "rejected_terminal_state",
          "concurrent commit must not be classified as terminal_state",
        );
      }
    }

    // (10) Reaching this point proves both settle-all branches fulfilled.
    // The loser never issues an INSERT into reconciliation_audit_events
    // and never opens a per-candidate sub-transaction.
  });

  test("BLK 4 (real concurrent production commit): two clients -> one applied, one idempotentReplay, one transition, one audit", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 40000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });

    // Two INDEPENDENT postgres clients, each running its own
    // production commit path. The repository uses the singleton
    // pool with max: 1; to actually exercise concurrency we
    // use the public dependency-injection seam with each commit on
    // its own fixture-tracked postgres connection.
    const repo = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    const execA = await buildTrackedReconciliationExecutor("blk4_commit_client_a");
    const execB = await buildTrackedReconciliationExecutor("blk4_commit_client_b");
    const inputA = {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin" as const,
      reconciliationRunId: dry.reconciliationRunId,
      identifierPlan: nextCommitPlan(),
    };
    const inputB = { ...inputA, identifierPlan: nextCommitPlan() };
    const [a, b] = await settleConcurrentDatabaseBranches(
      "blk4_concurrent_commit",
      "reconciliation_runs",
      [
        {
          role: "commit_client_a",
          promise: repo.commitReconciliationAsync(inputA, execA),
        },
        {
          role: "commit_client_b",
          promise: repo.commitReconciliationAsync(inputB, execB),
        },
      ] as const,
    );
    const appliedTotal = a.applied.length + b.applied.length;
    const replayTotal =
      a.skipped.filter((s) => s.idempotentReplay).length +
      b.skipped.filter((s) => s.idempotentReplay).length;
    assert.equal(appliedTotal, 1, "exactly one applied across the two commits");
    assert.equal(replayTotal, 1, "exactly one idempotentReplay across the two commits");

    const statusAfter = await admin`SELECT status FROM conversions WHERE id = ${id}::uuid`;
    assert.equal(statusAfter[0]!.status, "approved");
    const auditAfter = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(Number(auditAfter[0]!.n), 1, "exactly one durable audit event");
  });

  test("BLK 5 (run creation rollback): dry-run failure on candidate insert must leave NO partial run", async (repositoryDependencies) => {
    const blk5ProofFailure = (reason: string): Phase20kFixtureSafetyError =>
      new Phase20kFixtureSafetyError("blk5_candidate_insert_failure_proof", [
        "relation=reconciliation_run_candidates",
        `reason=${reason}`,
      ]);
    const preRunId = nextPreallocatedUuid();
    const preConvId = nextPreallocatedUuid();
    const preKey = sourceKeyFromUuid(preConvId);
    const preIngest = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: preIngest,
      sourceKey: preKey,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id: preConvId,
      externalOrderId: "blk5pre-" + preConvId.slice(-8),
      sourceKey: preKey,
      status: "pending",
      commission: 10000,
      validationStatus: "approved",
      ingestionEventId: preIngest,
    });
    // This unrelated durable run is the control row proving the
    // forced dry-run rollback is scoped to its own transaction.
    await admin`
      INSERT INTO reconciliation_runs (
        id, network, created_by_user_id, created_by_role,
        policy_version, candidate_fingerprint, status
      )
      VALUES (
        ${preRunId}::uuid, 'shopee', ${ADMIN_ACTOR_ID}::uuid, 'admin',
        1, ${"pre-fixture-" + preRunId.slice(0, 32)}, 'draft'
      )
    `;

    assert.equal(dryPlanCursor, 19, "BLK 5 consumes the locked dry-run plan");
    const plannedRun = fixtureGraph.dryRunPlans[19]!;
    assert.equal(plannedRun.candidates.length, 1, "BLK 5 has exactly one planned candidate");
    const plannedCandidate = plannedRun.candidates[0]!;
    assert.equal(plannedCandidate.conversionId, preConvId);
    assert.equal(plannedCandidate.sourceConversionKey, preKey);
    assert.equal(plannedCandidate.candidateId, fixtureGraph.candidateIds[14]);
    const blk5CandidateId = validateTechnicalUuid(plannedCandidate.candidateId);
    const blk5RunId = validateTechnicalUuid(plannedRun.reconciliationRunId);
    const { dryRunReconciliationAsync: dryRunBlk5Async } = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    const { buildReconciliationAdminActor: buildBlk5Actor } = await import(
      "../src/lib/reconciliation/actor"
    );
    const blk5Actor = buildBlk5Actor({
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
    });
    const blk5IdentifierPlan = nextDryRunPlan();
    assert.equal(blk5IdentifierPlan, plannedRun);

    const conversionBefore = await admin`
      SELECT to_jsonb(c)::text AS row_json, paid_at
      FROM public.conversions c
      WHERE id = ${preConvId}::uuid
    `;
    assert.equal(conversionBefore.length, 1);
    assert.equal(conversionBefore[0]!.paid_at, null);

    const failBlk5Function = fixtureGraph.technicalObjects.failBlk5.function.name;
    const failBlk5Trigger = fixtureGraph.technicalObjects.failBlk5.trigger.name;
    const failBlk5WitnessSequence =
      fixtureGraph.technicalObjects.failBlk5.witnessSequence.name;
    await assertPublicTechnicalObjectNamesAvailable(
      failBlk5Trigger,
      failBlk5Function,
      "reconciliation_run_candidates",
      [failBlk5WitnessSequence],
    );
    const assertWitnessState = async (
      expectedIsCalled: boolean,
      reason: string,
    ): Promise<void> => {
      let rows: postgres.RowList<postgres.Row[]>;
      try {
        rows = await admin.unsafe(`
          SELECT last_value::text AS last_value, is_called
          FROM public."${failBlk5WitnessSequence}"
        `);
      } catch {
        throw blk5ProofFailure(reason);
      }
      if (
        rows.length !== 1 ||
        rows[0]!.last_value !== "1" ||
        rows[0]!.is_called !== expectedIsCalled
      ) {
        throw blk5ProofFailure(reason);
      }
    };
    await admin.begin(async (tx) => {
      await tx.unsafe(`
        CREATE SEQUENCE public."${failBlk5WitnessSequence}"
          AS bigint
          START WITH 1
          INCREMENT BY 1
          MINVALUE 1
          NO MAXVALUE
          CACHE 1
          NO CYCLE
      `);
      await tx.unsafe(`
        CREATE FUNCTION public."${failBlk5Function}"()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY INVOKER
        SET search_path = pg_catalog, public
        AS $$
        BEGIN
          IF NEW.id = '${blk5CandidateId}'::uuid
             OR NEW.run_id = '${blk5RunId}'::uuid THEN
            PERFORM nextval('public."${failBlk5WitnessSequence}"'::regclass);
            RAISE EXCEPTION
              USING
                ERRCODE = 'P0001',
                MESSAGE = 'phase20k_blk5_candidate_insert_failure';
          END IF;
          RETURN NEW;
        END;
        $$
      `);
      await tx.unsafe(`
        CREATE TRIGGER "${failBlk5Trigger}"
          BEFORE INSERT ON public.reconciliation_run_candidates
          FOR EACH ROW EXECUTE FUNCTION public."${failBlk5Function}"()
      `);
    });

    let blk5TriggerFailureObserved = false;
    try {
      await assertWitnessState(false, "witness_sequence_precondition_invalid");

      let dryRunRejected = false;
      try {
        await dryRunBlk5Async({
          network: "shopee",
          actor: blk5Actor,
          identifierPlan: blk5IdentifierPlan,
          sourceScope: { sourceConversionKeys: [preKey] },
        }, repositoryDependencies);
      } catch (_rejection: unknown) {
        dryRunRejected = true;
      }
      if (!dryRunRejected) {
        throw blk5ProofFailure("expected_dry_run_rejection_not_observed");
      }

      await assertWitnessState(
        true,
        "candidate_insert_trigger_witness_not_observed",
      );
      blk5TriggerFailureObserved = true;
      assert.equal(
        blk5TriggerFailureObserved,
        true,
        "BLK5_TRIGGER_FAILURE_OBSERVED",
      );

      const plannedRunRows = await admin`
        SELECT count(*)::int AS n FROM reconciliation_runs
        WHERE id = ${plannedRun.reconciliationRunId}::uuid
      `;
      assert.equal(Number(plannedRunRows[0]!.n), 0, "planned run INSERT rolled back");
      const plannedCandidateRows = await admin`
        SELECT count(*)::int AS n FROM reconciliation_run_candidates
        WHERE id = ${plannedCandidate.candidateId}::uuid
           OR run_id = ${plannedRun.reconciliationRunId}::uuid
      `;
      assert.equal(Number(plannedCandidateRows[0]!.n), 0, "planned candidate INSERT rolled back");
      const controlRunRows = await admin`
        SELECT count(*)::int AS n FROM reconciliation_runs
        WHERE id = ${preRunId}::uuid
      `;
      assert.equal(Number(controlRunRows[0]!.n), 1, "unrelated synthetic run remains durable");
      const controlCandidateRows = await admin`
        SELECT count(*)::int AS n FROM reconciliation_run_candidates
        WHERE run_id = ${preRunId}::uuid
      `;
      assert.equal(Number(controlCandidateRows[0]!.n), 0, "synthetic run gained no candidate");
      const conversionAfter = await admin`
        SELECT to_jsonb(c)::text AS row_json, paid_at
        FROM public.conversions c
        WHERE id = ${preConvId}::uuid
      `;
      assert.equal(conversionAfter.length, 1);
      assert.equal(conversionAfter[0]!.row_json, conversionBefore[0]!.row_json);
      assert.equal(conversionAfter[0]!.paid_at, null);
      const auditRows = await admin`
        SELECT count(*)::int AS n FROM reconciliation_audit_events
        WHERE run_candidate_id = ${plannedCandidate.candidateId}::uuid
      `;
      assert.equal(Number(auditRows[0]!.n), 0, "failed dry run creates no candidate audit");
    } finally {
      await teardownPublicTechnicalObjects(
        failBlk5Trigger,
        failBlk5Function,
        "reconciliation_run_candidates",
        [failBlk5WitnessSequence],
      );
    }
  });

  // ----------------------------------------------------------------
  // Phase 20K checkpoint 4D1 -- REAL atomic run creation.
  //
  // The production `persistRunAsync` wraps the
  // reconciliation_runs INSERT and the
  // reconciliation_run_candidates INSERT(s) in a single drizzle
  // transaction. A failure inside that transaction must roll
  // back BOTH the run row AND every candidate row, and must
  // propagate a server-side error so the dry-run caller never
  // observes a usable reconciliationRunId.
  //
  // Deterministic failure trigger: a fixture-owned public BEFORE INSERT
  // trigger on `reconciliation_run_candidates` RAISEs an
  // exception when the row's `conversion_id` matches the
  // fixture's conversion. The trigger and its helper function
  // are created at the start of the test and DROPPED in a
  // try/finally so the schema is unchanged after the test
  // completes (other tests, and subsequent runs of this test,
  // see a clean schema).
  test("Phase 20K 4D1: run creation rolls back when one candidate insert fails", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4d1-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 25000,
      validationStatus: "approved",
      ingestionEventId,
    });
    // Snapshot the conversion's mutable state so we can prove
    // (4) "no conversion status or money changes" below.
    const before = await admin`
      SELECT status, network_commission::text AS c, user_cashback::text AS u, platform_profit::text AS p
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(before[0]!.status, "pending");
    const cBefore = Number(before[0]!.c);
    const uBefore = Number(before[0]!.u);
    const pBefore = Number(before[0]!.p);

    const targetConversionId = validateTechnicalUuid(id);
    const { dryRunReconciliationAsync: dryRun4d1Async } = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    const { buildReconciliationAdminActor: build4d1Actor } = await import(
      "../src/lib/reconciliation/actor"
    );
    const actor4d1 = build4d1Actor({
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
    });
    const failedDryRunPlan = nextDryRunPlan();
    assert.equal(failedDryRunPlan.candidates.length, 1);
    assert.equal(failedDryRunPlan.candidates[0]!.conversionId, id);

    // Install the global trigger that forces the dry-run's
    // candidate INSERT to RAISE. The trigger fires for ANY row
    // whose `conversion_id` matches our fixture's conversion
    // id, which is the only candidate the dry-run will plan
    // for this scope. The predicate embeds only the exact
    // prevalidated fixture UUID so it is identical on every
    // transaction-pooler backend.
    const fail4d1Function = fixtureGraph.technicalObjects.fail4d1.function.name;
    const fail4d1Trigger = fixtureGraph.technicalObjects.fail4d1.trigger.name;
    await assertPublicTechnicalObjectNamesAvailable(
      fail4d1Trigger,
      fail4d1Function,
      "reconciliation_run_candidates",
    );
    await admin.begin(async (tx) => {
      await tx.unsafe(`
        CREATE FUNCTION public."${fail4d1Function}"()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog, public
      AS $$
      BEGIN
        IF NEW.conversion_id = '${targetConversionId}'::uuid THEN
          RAISE EXCEPTION
            'Phase 20K 4D1: forced candidate INSERT failure'
            USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END;
      $$
      `);
      await tx.unsafe(`
        CREATE TRIGGER "${fail4d1Trigger}"
          BEFORE INSERT ON public.reconciliation_run_candidates
          FOR EACH ROW EXECUTE FUNCTION public."${fail4d1Function}"()
      `);
    });

    // (1) dry-run must fail. The trigger RAISEs inside the
    // drizzle transaction, which aborts, which propagates out
    // of `persistRunAsync` and out of `dryRunReconciliationAsync`
    // as a thrown Error.
    let thrown: unknown = null;
    let attemptedRunId: string | undefined;
    try {
      const dry = await dryRun4d1Async({
        network: "shopee",
        actor: actor4d1,
        identifierPlan: failedDryRunPlan,
        sourceScope: { sourceConversionKeys: [source] },
      }, repositoryDependencies);
      attemptedRunId = dry.reconciliationRunId;
    } catch (err) {
      thrown = err;
    } finally {
      await teardownPublicTechnicalObjects(
        fail4d1Trigger,
        fail4d1Function,
        "reconciliation_run_candidates",
      );
    }
    assert.notEqual(thrown, null, "dry-run must throw on forced failure");
    assert.ok(
      thrown instanceof Error,
      "thrown value must be an Error instance",
    );
    assert.equal(
      attemptedRunId,
      undefined,
      "no usable reconciliationRunId may be returned",
    );

    // (2) no reconciliation_runs row remains for the attempted
    // run. We have no run id (the dry-run threw before
    // returning one), but we can verify the BIG PICTURE: the
    // count of runs created in this test's window must be zero
    // by the time we issue the second clean dry-run below.
    // The narrower check: no run row in `reconciliation_runs`
    // references our conversion's source_conversion_key
    // through the candidate table -- the candidate table is
    // empty for any run targeting our conversion.
    assert.equal(failedDryRunPlan, fixtureGraph.dryRunPlans[20]!);
    const runRowsForOurSource = await admin`
      SELECT count(*)::int AS n FROM reconciliation_runs
      WHERE id = ${failedDryRunPlan.reconciliationRunId}::uuid
    `;
    assert.equal(
      Number(runRowsForOurSource[0]!.n),
      0,
      "no reconciliation_runs row references our fixture's source_conversion_key",
    );

    // (3) no reconciliation_run_candidates rows remain for our
    // fixture's source.
    const candidateRows = await admin`
      SELECT count(*)::int AS n FROM reconciliation_run_candidates
      WHERE id = ${failedDryRunPlan.candidates[0]!.candidateId}::uuid
    `;
    assert.equal(
      Number(candidateRows[0]!.n),
      0,
      "no reconciliation_run_candidates rows remain for our fixture",
    );

    // (4) no conversion status or money changes.
    const after = await admin`
      SELECT status, network_commission::text AS c, user_cashback::text AS u, platform_profit::text AS p
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(after[0]!.status, "pending", "conversion status unchanged");
    assert.equal(Number(after[0]!.c), cBefore, "network_commission unchanged");
    assert.equal(Number(after[0]!.u), uBefore, "user_cashback unchanged");
    assert.equal(Number(after[0]!.p), pBefore, "platform_profit unchanged");

    // (5) no reconciliation_audit_events rows are created.
    const auditRows = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(
      Number(auditRows[0]!.n),
      0,
      "no reconciliation_audit_events rows for the failed run",
    );

    // (6) a subsequent clean dry-run can succeed normally.
    // After the trigger is dropped, the same conversion must
    // plan + persist a fresh run row and a fresh candidate
    // row in a single transaction.
    const cleanDry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.ok(cleanDry.reconciliationRunId, "clean dry-run must return a runId");
    assert.equal(cleanDry.appliedCount, 1, "clean dry-run plans exactly one apply");

    // Success-path assertions: one run row exists, and
    // persisted candidate count equals planned candidate count.
    const cleanRunRows = await admin`
      SELECT count(*)::int AS n FROM reconciliation_runs
      WHERE id = ${cleanDry.reconciliationRunId}::uuid
    `;
    assert.equal(
      Number(cleanRunRows[0]!.n),
      1,
      "one reconciliation_runs row exists for the clean dry-run",
    );
    const cleanCandidateRows = await admin`
      SELECT count(*)::int AS n FROM reconciliation_run_candidates
      WHERE run_id = ${cleanDry.reconciliationRunId}::uuid
    `;
    assert.equal(
      Number(cleanCandidateRows[0]!.n),
      cleanDry.appliedCount,
      "persisted candidate count equals planned candidate count",
    );
  });

  // ----------------------------------------------------------------
  // Phase 20K checkpoint 4D2 (1/3) -- successful run moves
  // draft -> committing -> committed.
  //
  // Asserts:
  //   - all candidates have non-'pending' processing outcomes
  //   - run status transitions through the lifecycle:
  //     draft, committing, committed (committed_at is set)
  //   - conversion status + audit count match the candidate outcomes
  test("Phase 20K 4D2: successful run moves draft -> committing -> committed", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4d2-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      // 100000 -> 60000 (60%) + 40000 (40%).
      commission: 100000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1, "dry-run plans exactly one apply");

    // Sanity: run is in `draft` before commit.
    const runBefore = await admin`
      SELECT status FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(runBefore[0]!.status, "draft");

    // Run the commit. After commit:
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(commit.applied.length, 1, "one apply");
    assert.equal(commit.skipped.length, 0, "no skips");

    // Run moved to `committed`.
    const runAfter = await admin`
      SELECT status, committed_at
      FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(runAfter[0]!.status, "committed");
    assert.ok(
      runAfter[0]!.committed_at !== null,
      "committed_at must be set",
    );

    // All candidates have non-'pending' outcomes.
    const outcomeRows = await admin`
      SELECT processing_outcome
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(outcomeRows.length, 1);
    assert.equal(
      String(outcomeRows[0]!.processing_outcome),
      "applied",
      "applied candidate has processing_outcome = 'applied'",
    );

    // Conversion status + money match the candidate outcome.
    const finalRow = await admin`
      SELECT status, network_commission::text AS c, user_cashback::text AS u, platform_profit::text AS p
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(finalRow[0]!.status, "approved");
    assert.equal(Number(finalRow[0]!.c), 100000);
    assert.equal(Number(finalRow[0]!.u), 60000);
    assert.equal(Number(finalRow[0]!.p), 40000);

    // Audit row count = 1.
    const auditRows = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE reconciliation_run_id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(Number(auditRows[0]!.n), 1, "one durable audit row");
  });

  // ----------------------------------------------------------------
  // Phase 20K checkpoint 4D2 (2/3) -- failure after one candidate
  // does not leave run as draft.
  //
  // Inject a deterministic failure AFTER one candidate has been
  // durably processed by creating a run with TWO candidates, where
  // we force the SECOND candidate's per-candidate sub-transaction
  // to throw (by staging a transition the conversion row's
  // expected previous status will not match -- the conversion's
  // status is advanced between dry-run and commit). The run is
  // expected to land in `committing` or `failed`, NEVER `draft`,
  // and the FIRST candidate's mutation must not be re-applied on
  // retry.
  //
  // Setup: candidate A's plan says pending -> approved. We
  // also inject candidate B which plans the same conversion
  // id... actually the easier path is to use ONE planned
  // candidate AND a forced-failure scenario via a per-candidate
  // sub-tx throw from the 4B revalidation block. We override
  // the plan's expected_previous_status on the candidate row
  // after dry-run so the live conversion's status will be
  // detected as drift and the candidate will skip with
  // stale_reason. That's not a "throw" though. We need an
  // UNHANDLED throw. The cleanest way: tampering with the
  // conversion's source_conversion_key between dry-run and
  // commit so 4B revalidation throws. Even simpler: bump the
  // conversion's `network_commission` to a value that produces
  // a different 60/40 split -- the planner recorded one split,
  // the live row has another, 4B returns `stale`.
  //
  // But that's a skip, not a throw. For an unhandled throw we
  // can abuse an UPDATE that zeroes a NOT NULL column the
  // conversion row needs to be rewritable. The easiest robust
  // approach: DROP the audit row after it exists, then
  // DELIBERATELY insert a duplicate audit row to force the
  // UNIQUE constraint to fire on the per-candidate sub-tx's
  // INSERT...ON CONFLICT DO NOTHING RETURNING. Wait -- ON
  // CONFLICT DO NOTHING never throws on the unique violation.
  //
  // OK, the simplest deterministic way to force a per-candidate
  // sub-tx throw is to attach a fixture-owned public BEFORE UPDATE trigger
  // to `reconciliation_run_candidates` that RAISEs when a
  // specific candidate id is updated. The trigger fires only
  // for the SECOND UPDATE -- the first candidate's outcome
  // UPDATE has already committed before the second candidate's
  // tx starts, so the trigger only causes failure on the
  // SECOND candidate.
  //
  // For a single-candidate test that still exercises the
  // partial-failure path, we can force a throw inside the
  // per-candidate sub-tx via the candidate's processing_outcome
  // UPDATE (triggered when the candidate goes from `pending`
  // to a terminal value). The run-level finalization sees
  // the pending count is non-zero after the throw -> marks
  // the run `failed`. Alternative simpler approach: use a
  // two-candidate run -- trigger the failure on the second
  // candidate. The first candidate commits successfully.
  test("Phase 20K 4D2: failure after one candidate does not leave run as draft", async (repositoryDependencies) => {
    // Create two distinct conversions in the same scope.
    const idA = nextPreallocatedUuid();
    const idB = nextPreallocatedUuid();
    const sourceA = sourceKeyFromUuid(idA);
    const sourceB = sourceKeyFromUuid(idB);
    const ingestA = nextPreallocatedUuid();
    const ingestB = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestA,
      sourceKey: sourceA,
      processingStatus: "succeeded",
    });
    await insertIngestionEvent({
      id: ingestB,
      sourceKey: sourceB,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id: idA,
      externalOrderId: "blk4d2a-" + idA.slice(-8),
      sourceKey: sourceA,
      status: "pending",
      commission: 30000,
      validationStatus: "approved",
      ingestionEventId: ingestA,
    });
    // Force idA's `occurred_at` to be EARLIER than idB so the
    // dry-run planner iterates A FIRST and the commit loop
    // processes A FIRST. Without this, both rows get the same
    // `occurred_at = now() - 3h` default and the FOR UPDATE
    // tiebreaker picks whichever UUID sorts first
    // lexicographically, making the test order-dependent.
    await admin`
      UPDATE conversions
      SET occurred_at = (now() - interval '4 hours')::timestamptz
      WHERE id = ${idA}::uuid
    `;
    await insertConversion({
      id: idB,
      externalOrderId: "blk4d2b-" + idB.slice(-8),
      sourceKey: sourceB,
      status: "pending",
      commission: 50000,
      validationStatus: "approved",
      ingestionEventId: ingestB,
    });
    await admin`
      UPDATE conversions
      SET occurred_at = (now() - interval '2 hours')::timestamptz
      WHERE id = ${idB}::uuid
    `;
    // Dry-run against an explicit scope covering BOTH
    // conversions. The dry-run produces a run with two
    // candidates.
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: sourceA,
    });
    void sourceB;
    assert.equal(dry.appliedCount, 1, "scope of A plans exactly one apply");

    // We need BOTH conversions to be candidates. Easiest:
    // run a second dry-run that covers both. Each dry-run is
    // a fresh run. We'll commit the second run (which has 2
    // candidates).
    const { commitReconciliationAsync, dryRunReconciliationAsync } =
      await import("../src/server/reconciliation/reconciliation.repository");
    const dryTwo = await dryRunReconciliationAsync({
      actor: {
        actorKind: "admin",
        actorUserId: ADMIN_ACTOR_ID,
        actorRole: "admin",
      },
      network: "shopee",
      identifierPlan: nextDryRunPlan(),
      sourceScope: {
        explicitConversionIds: [idA, idB],
      },
    }, repositoryDependencies);
    assert.equal(
      dryTwo.decisions.length,
      2,
      "two-candidate dry-run plans both conversions",
    );

    // Identify the LAST candidate by `ORDER BY created_at ASC,
    // id ASC` (which is the commit loop's iteration order). The
    // commit loop processes them in that order; the LAST one
    // will be the second-processed candidate. By staging the
    // trigger to fire on the LAST candidate's outcome UPDATE,
    // we ensure the FIRST candidate durably completes
    // (outcome = 'applied') and only the second one aborts.
    const candidateRows = await admin`
      SELECT id::text AS id, conversion_id::text AS conversion_id
      FROM reconciliation_run_candidates
      WHERE run_id = ${dryTwo.reconciliationRunId}::uuid
      ORDER BY created_at ASC, id ASC
    `;
    assert.equal(candidateRows.length, 2);
    const targetCandidateId = candidateRows[1]!.id; // last in iteration order
    assert.equal(fixtureGraph.candidateIds.includes(String(targetCandidateId)), true);
    const targetCandidateUuid = validateTechnicalUuid(String(targetCandidateId));
    const fail4d2Function = fixtureGraph.technicalObjects.fail4d2.function.name;
    const fail4d2Trigger = fixtureGraph.technicalObjects.fail4d2.trigger.name;
    await assertPublicTechnicalObjectNamesAvailable(
      fail4d2Trigger,
      fail4d2Function,
      "reconciliation_run_candidates",
    );
    await admin.begin(async (tx) => {
      await tx.unsafe(`
        CREATE FUNCTION public."${fail4d2Function}"()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog, public
      AS $$
      BEGIN
        IF NEW.id = '${targetCandidateUuid}'::uuid THEN
          RAISE EXCEPTION
            'Phase 20K 4D2: forced per-candidate UPDATE failure'
            USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END;
      $$
      `);
      await tx.unsafe(`
        CREATE TRIGGER "${fail4d2Trigger}"
          BEFORE UPDATE ON public.reconciliation_run_candidates
          FOR EACH ROW EXECUTE FUNCTION
            public."${fail4d2Function}"()
      `);
    });

    // Commit. The first candidate (A) succeeds; the trigger
    // fires when B's per-candidate UPDATE runs, causing the
    // sub-tx to abort. The outer catch transitions the run
    // to `failed`.
    let thrown: unknown = null;
    try {
      await commitReconciliationAsync(
        {
          actorUserId: ADMIN_ACTOR_ID,
          actorRole: "admin",
          reconciliationRunId: dryTwo.reconciliationRunId,
          identifierPlan: nextCommitPlan(),
        },
        repositoryDependencies.executor,
      );
    } catch (err) {
      thrown = err;
    } finally {
      await teardownPublicTechnicalObjects(
        fail4d2Trigger,
        fail4d2Function,
        "reconciliation_run_candidates",
      );
    }
    assert.notEqual(thrown, null, "commit must throw after per-candidate failure");
    // The candidate order in the commit loop is
    // `ORDER BY created_at ASC, id ASC`. Both candidates
    // were inserted in the same multi-row INSERT so they
    // share the same `created_at` to microsecond precision
    // and the `id ASC` tiebreaker picks whichever UUID
    // sorts first. We don't predict the order; we instead
    // assert that EXACTLY ONE candidate was durably
    // completed (its outcome UPDATE committed before the
    // trigger fired) and the other one's outcome UPDATE
    // was rolled back (still 'pending').
    const outcomeRowsAfterFail = await admin`
      SELECT conversion_id::text AS cid, processing_outcome
      FROM reconciliation_run_candidates
      WHERE run_id = ${dryTwo.reconciliationRunId}::uuid
      ORDER BY created_at ASC, id ASC
    `;
    const completed = outcomeRowsAfterFail.filter(
      (r) => r.processing_outcome === "applied",
    );
    const aborted = outcomeRowsAfterFail.filter(
      (r) => r.processing_outcome === "pending",
    );
    assert.equal(
      completed.length,
      1,
      "exactly one candidate was durably completed before the trigger fired",
    );
    assert.equal(
      aborted.length,
      1,
      "exactly one candidate's sub-tx was aborted by the trigger (its outcome UPDATE was rolled back, leaving 'pending')",
    );
    const runAfterFail = await admin`
      SELECT status, failed_at, failed_reason
      FROM reconciliation_runs
      WHERE id = ${dryTwo.reconciliationRunId}::uuid
    `;
    const finalStatus = String(runAfterFail[0]!.status);
    assert.notEqual(
      finalStatus,
      "draft",
      "run must never be in draft after a per-candidate failure",
    );
    assert.notEqual(
      finalStatus,
      "committed",
      "run must never be falsely committed after a partial failure",
    );
    assert.ok(
      finalStatus === "committing" || finalStatus === "failed",
      "run status is 'committing' or 'failed' (was: " + finalStatus + ")",
    );
  });

  // ----------------------------------------------------------------
  // Phase 20K checkpoint 4D2 (3/3) -- concurrent commit requests
  // cannot both transition the run.
  //
  // Asserts:
  //   - exactly one acquisition moves draft -> committing
  //   - the other returns idempotent / replay (zero applied)
  //   - final run state is consistent (committed, 1 audit row,
  //     no duplicate conversion mutation)
  test("Phase 20K 4D2: concurrent commit requests cannot both transition the run", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4d2c-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 80000,
      validationStatus: "approved",
      ingestionEventId: ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1);

    // Two independent postgres clients, each with its own
    // connection, both running the production commit path
    // concurrently.
    const repo = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    const execA = await buildTrackedReconciliationExecutor("phase20k_4d2_commit_client_a");
    const execB = await buildTrackedReconciliationExecutor("phase20k_4d2_commit_client_b");
    const inputA = {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin" as const,
      reconciliationRunId: dry.reconciliationRunId,
      identifierPlan: nextCommitPlan(),
    };
    const inputB = { ...inputA, identifierPlan: nextCommitPlan() };
    const [a, b] = await settleConcurrentDatabaseBranches(
      "phase20k_4d2_concurrent_commit",
      "reconciliation_runs",
      [
        {
          role: "commit_client_a",
          promise: repo.commitReconciliationAsync(inputA, execA),
        },
        {
          role: "commit_client_b",
          promise: repo.commitReconciliationAsync(inputB, execB),
        },
      ] as const,
    );

    // ----------------------------------------------------------------
    // Phase 20K checkpoint 4D2B -- immediate-return on losing
    // the lifecycle acquire.
    //
    // The lifecycle ownership boundary is the
    // `draft -> committing` compare-and-set UPDATE inside
    // commitReconciliationAsync. The request whose UPDATE
    // returns exactly one row OWNS the lifecycle and may
    // process candidates; the request whose UPDATE returns
    // zero rows MUST return immediately with an idempotent /
    // in-progress result, performing zero candidate-loop
    // iterations and zero side effects.
    //
    // Phase 20K checkpoint 4J2-B supersedes the 4D2D "empty
    // shape" contract for the loser: the caller must receive a
    // deterministic representation of the idempotent result
    // (one `skipped` entry per candidate carrying
    // `idempotentReplay: true` with
    // `reasonCode: "rejected_duplicate_conversion"`). The
    // durable mutation boundary is unchanged: the loser
    // performs zero candidate-loop work and zero side
    // effects -- only emits the idempotent-replay skip entry.
    // ----------------------------------------------------------------
    const aIsLoser =
      a.applied.length === 0 &&
      a.skipped.length === 1 &&
      a.skipped[0]?.idempotentReplay === true &&
      a.skipped[0]?.reasonCode === "rejected_duplicate_conversion";
    const bIsLoser =
      b.applied.length === 0 &&
      b.skipped.length === 1 &&
      b.skipped[0]?.idempotentReplay === true &&
      b.skipped[0]?.reasonCode === "rejected_duplicate_conversion";
    assert.ok(
      aIsLoser !== bIsLoser,
      "exactly one request must return immediately (applied=0 AND skipped=[idempotentReplay]) and the other must have processed the candidate (got a.applied=" +
        a.applied.length +
        " a.skipped=" +
        a.skipped.length +
        " b.applied=" +
        b.applied.length +
        " b.skipped=" +
        b.skipped.length +
        ")",
    );
    const loser = aIsLoser ? a : b;
    const winner = aIsLoser ? b : a;
    void winner;

    // (1) Exactly one request acquired the lifecycle -- the
    // winner is the one whose applied/skipped totals are
    // non-zero (it actually processed a candidate). The
    // loser is the idempotent-replay result.
    assert.equal(
      winner.applied.length,
      1,
      "the winner must have applied exactly one candidate",
    );
    assert.equal(
      winner.skipped.length,
      0,
      "the winner must have produced zero skipped entries",
    );

    // (2) Loser returns immediately -- the loser is the
    // idempotent-replay result: applied=0, skipped has exactly
    // one entry with idempotentReplay=true and the
    // rejected_duplicate_conversion reason.
    assert.equal(
      loser.applied.length,
      0,
      "loser processed candidate count = 0 (immediate-return shape)",
    );
    assert.equal(
      loser.skipped.length,
      1,
      "loser skipped count = 1 (one idempotent-replay entry per candidate)",
    );
    assert.equal(
      loser.skipped[0]!.conversionId,
      id,
      "loser idempotent-replay skip entry must reference the candidate",
    );
    assert.equal(
      loser.skipped[0]!.idempotentReplay,
      true,
      "loser idempotent-replay flag must be true",
    );
    assert.equal(
      loser.skipped[0]!.reasonCode,
      "rejected_duplicate_conversion",
      "loser idempotent-replay reasonCode must be rejected_duplicate_conversion",
    );
    assert.equal(
      loser.summary.applied,
      0,
      "loser summary.applied = 0",
    );
    assert.equal(
      loser.summary.skipped,
      1,
      "loser summary.skipped = 1 (counts the idempotent-replay skip)",
    );
    assert.equal(
      loser.summary.reject,
      0,
      "loser summary.reject = 0",
    );

    // (5) Loser created zero audit rows. Total audit count
    // is exactly one (winner only).
    const auditFinal = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE reconciliation_run_id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(
      Number(auditFinal[0]!.n),
      1,
      "exactly one audit row exists (loser must not have inserted any)",
    );

    // (7) Exactly one conversion mutation.
    const finalRow = await admin`
      SELECT status, network_commission::text AS c, user_cashback::text AS u, platform_profit::text AS p
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(finalRow[0]!.status, "approved");
    assert.equal(Number(finalRow[0]!.c), 80000);
    assert.equal(Number(finalRow[0]!.u), 48000);
    assert.equal(Number(finalRow[0]!.p), 32000);

    // (6) Loser wrote zero candidate outcomes. The candidate
    // row still reflects the winning outcome only.
    const candOut = await admin`
      SELECT processing_outcome, processing_completed_at
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(candOut.length, 1);
    assert.equal(
      String(candOut[0]!.processing_outcome),
      "applied",
      "candidate outcome reflects the winner only",
    );
    assert.ok(
      candOut[0]!.processing_completed_at !== null,
      "winner set processing_completed_at; loser must not have touched this column",
    );

    // (9) Final run status = committed.
    const runFinal = await admin`
      SELECT status, committed_at
      FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(runFinal[0]!.status, "committed");
    assert.ok(runFinal[0]!.committed_at !== null);

    // (10) No rejected_terminal_state in either response.
    const loserHasTerminalState = loser.skipped.some(
      (s) => s.reasonCode === "rejected_terminal_state",
    );
    assert.equal(
      loserHasTerminalState,
      false,
      "loser must not report rejected_terminal_state (it never reached the candidate loop)",
    );

    // (11) Reaching this point proves both settle-all branches fulfilled.
    // The loser never issues an INSERT into reconciliation_audit_events
    // and never opens a per-candidate sub-transaction.
  });

  // ----------------------------------------------------------------
  // Phase 20K checkpoint 4D2C -- failed run retry processes only
  // pending candidates.
  //
  // Scenario:
  //   1. Create a run with two candidates (A and B).
  //   2. First commit: A applies successfully, B fails
  //      deterministically, run becomes `failed`.
  //      A's outcome = `applied`, B's outcome = `pending`.
  //   3. Remove the deterministic failure.
  //   4. Retry the same `reconciliationRunId`.
  //
  // Required behaviour on retry:
  //   - acquisition moves `failed -> committing`;
  //   - candidate A does NOT enter the production candidate-
  //     processing transaction a second time (no `SELECT FOR
  //     UPDATE` on A's conversion row, no audit-claim attempt for
  //     A, no conversion UPDATE on A);
  //   - A's durable audit-row count remains exactly 1;
  //   - A's conversion row is unchanged after its first
  //     application (status, network_commission, user_cashback,
  //     platform_profit);
  //   - candidate B is processed once and receives a durable
  //     outcome (here: `applied`);
  //   - total audit rows = exactly 2 (one per applied
  //     candidate across the run lifetime);
  //   - no `rejected_terminal_state` for A (A's processing is
  //     skipped entirely, not routed through the terminal-state
  //     guard);
  //   - no duplicate-conversion fallback for A (A is never
  //     reprocessed);
  //   - final run status = `committed`;
  //   - pending candidate count = 0.
  //
  // Instrumentation: we attach two BEFORE triggers
  //   - one on `conversions` that increments a session counter
  //     for every UPDATE on A's `id`;
  //   - one on `reconciliation_audit_events` that increments a
  //     session counter for every INSERT whose
  //     `run_candidate_id = A's run_candidate_id`;
  // and assert both counters remain 0 after retry. The two
  // counters together prove A had zero candidate-loop
  // processing during retry (no UPDATE on the conversion row,
  // no audit-claim INSERT for A's run_candidate_id).
  test("Phase 20K 4D2C: failed run retry processes only pending candidates", async (repositoryDependencies) => {
    // Two distinct conversions in the same scope.
    const idA = nextPreallocatedUuid();
    const idB = nextPreallocatedUuid();
    const sourceA = sourceKeyFromUuid(idA);
    const sourceB = sourceKeyFromUuid(idB);
    const ingestA = nextPreallocatedUuid();
    const ingestB = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestA,
      sourceKey: sourceA,
      processingStatus: "succeeded",
    });
    await insertIngestionEvent({
      id: ingestB,
      sourceKey: sourceB,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id: idA,
      externalOrderId: "blk4d2cA-" + idA.slice(-8),
      sourceKey: sourceA,
      status: "pending",
      // 100000 -> 60000 (60%) + 40000 (40%).
      commission: 100000,
      validationStatus: "approved",
      ingestionEventId: ingestA,
    });
    // Force idA's `occurred_at` to be EARLIER than idB so the
    // commit loop processes A FIRST. Same trick as the 4D2
    // partial-failure test.
    await admin`
      UPDATE conversions
      SET occurred_at = (now() - interval '4 hours')::timestamptz
      WHERE id = ${idA}::uuid
    `;
    await insertConversion({
      id: idB,
      externalOrderId: "blk4d2cB-" + idB.slice(-8),
      sourceKey: sourceB,
      status: "pending",
      // 80000 -> 48000 (60%) + 32000 (40%).
      commission: 80000,
      validationStatus: "approved",
      ingestionEventId: ingestB,
    });
    await admin`
      UPDATE conversions
      SET occurred_at = (now() - interval '2 hours')::timestamptz
      WHERE id = ${idB}::uuid
    `;
    const { dryRunReconciliationAsync } = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    const dry = await dryRunReconciliationAsync({
      actor: {
        actorKind: "admin",
        actorUserId: ADMIN_ACTOR_ID,
        actorRole: "admin",
      },
      network: "shopee",
      identifierPlan: nextDryRunPlan(),
      sourceScope: {
        explicitConversionIds: [idA, idB],
      },
    }, repositoryDependencies);
    assert.equal(
      dry.decisions.length,
      2,
      "two-candidate dry-run plans both conversions",
    );

    // ----------------------------------------------------------------
    // Step 2 -- first commit (engineered to fail after A).
    //
    // The commit loop processes candidates in `ORDER BY
    // created_at ASC, id ASC`. We force the LAST candidate's
    // outcome UPDATE to raise so the FIRST candidate durably
    // completes (`applied`) and only the SECOND one's
    // sub-transaction aborts, leaving its outcome at
    // `pending`.
    const firstCandidateRows = await admin`
      SELECT id::text AS id, conversion_id::text AS conversion_id
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
      ORDER BY created_at ASC, id ASC
    `;
    assert.equal(firstCandidateRows.length, 2);
    const failingTargetCandidateId = firstCandidateRows[1]!.id;
    assert.equal(
      fixtureGraph.candidateIds.includes(String(failingTargetCandidateId)),
      true,
    );
    const failingTargetCandidateUuid = validateTechnicalUuid(
      String(failingTargetCandidateId),
    );
    const { commitReconciliationAsync } = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    const fail4d2cFunction = fixtureGraph.technicalObjects.fail4d2c.function.name;
    const fail4d2cTrigger = fixtureGraph.technicalObjects.fail4d2c.trigger.name;
    await assertPublicTechnicalObjectNamesAvailable(
      fail4d2cTrigger,
      fail4d2cFunction,
      "reconciliation_run_candidates",
    );
    await admin.begin(async (tx) => {
      await tx.unsafe(`
        CREATE FUNCTION public."${fail4d2cFunction}"()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog, public
      AS $$
      BEGIN
        IF NEW.id = '${failingTargetCandidateUuid}'::uuid THEN
          RAISE EXCEPTION
            'Phase 20K 4D2C: forced first-commit per-candidate failure'
            USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END;
      $$
      `);
      await tx.unsafe(`
        CREATE TRIGGER "${fail4d2cTrigger}"
          BEFORE UPDATE ON public.reconciliation_run_candidates
          FOR EACH ROW EXECUTE FUNCTION
            public."${fail4d2cFunction}"()
      `);
    });
    let firstThrown: unknown = null;
    try {
      await commitReconciliationAsync({
        actorUserId: ADMIN_ACTOR_ID,
        actorRole: "admin",
        reconciliationRunId: dry.reconciliationRunId,
        identifierPlan: nextCommitPlan(),
      }, repositoryDependencies.executor);
    } catch (err) {
      firstThrown = err;
    } finally {
      await teardownPublicTechnicalObjects(
        fail4d2cTrigger,
        fail4d2cFunction,
        "reconciliation_run_candidates",
      );
    }
    assert.notEqual(
      firstThrown,
      null,
      "first commit must throw after per-candidate failure",
    );
    // Identify the candidate whose outcome is `applied` -- that
    // is candidate A in the test scenario, the one that must NOT
    // be reprocessed on retry.
    const afterFirst = await admin`
      SELECT id::text AS id, conversion_id::text AS conversion_id,
             processing_outcome, processing_reason_code
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
      ORDER BY created_at ASC, id ASC
    `;
    const appliedRow = afterFirst.find(
      (r) => r.processing_outcome === "applied",
    );
    const pendingRow = afterFirst.find(
      (r) => r.processing_outcome === "pending",
    );
    assert.ok(appliedRow, "exactly one candidate is `applied`");
    assert.ok(pendingRow, "exactly one candidate is still `pending`");
    const appliedCandidateId = String(appliedRow!.id);
    const appliedConversionId = String(appliedRow!.conversion_id);
    const appliedReasonCode = appliedRow!.processing_reason_code;
    const runAfterFirst = await admin`
      SELECT status, failed_at, failed_reason
      FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(String(runAfterFirst[0]!.status), "failed");
    assert.ok(runAfterFirst[0]!.failed_at !== null);
    // Capture the conversion row state after the first apply so
    // we can prove it is byte-identical after retry.
    const convAfterFirst = await admin`
      SELECT status, network_commission::text AS c,
             user_cashback::text AS u,
             platform_profit::text AS p,
             approved_at, updated_at
      FROM conversions WHERE id = ${appliedConversionId}::uuid
    `;
    const convFirstSnapshot = {
      status: String(convAfterFirst[0]!.status),
      c: String(convAfterFirst[0]!.c),
      u: String(convAfterFirst[0]!.u),
      p: String(convAfterFirst[0]!.p),
      approvedAt:
        convAfterFirst[0]!.approved_at === null
          ? null
          : String(convAfterFirst[0]!.approved_at),
      updatedAt: String(convAfterFirst[0]!.updated_at),
    };
    // Capture the audit-row count for A after the first commit
    // (should be exactly 1) so we can prove it does NOT grow on
    // retry.
    const auditAfterFirst = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE run_candidate_id = ${appliedCandidateId}::uuid
    `;
    assert.equal(
      Number(auditAfterFirst[0]!.n),
      1,
      "first commit produced exactly one audit row for A",
    );

    // ----------------------------------------------------------------
    // Step 3 -- install retry instrumentation.
    //
    // Two BEFORE triggers advance exact public sequences only
    // when production attempts work on the APPLIED candidate:
    //   (a) `conversions` BEFORE UPDATE for A's conversion row.
    //   (b) `reconciliation_audit_events` BEFORE INSERT for A's
    //       run_candidate_id.
    //
    // After retry both counters must be 0. Together they prove
    // A was never touched by the production candidate-
    // processing transaction.
    const countConversionFunction = fixtureGraph.technicalObjects.countConversion.function.name;
    const countConversionTrigger = fixtureGraph.technicalObjects.countConversion.trigger.name;
    const countConversionSequence = fixtureGraph.technicalObjects.countConversion.sequence.name;
    const countAuditFunction = fixtureGraph.technicalObjects.countAudit.function.name;
    const countAuditTrigger = fixtureGraph.technicalObjects.countAudit.trigger.name;
    const countAuditSequence = fixtureGraph.technicalObjects.countAudit.sequence.name;
    assert.equal(fixtureGraph.conversionIds.includes(appliedConversionId), true);
    assert.equal(fixtureGraph.candidateIds.includes(appliedCandidateId), true);
    const appliedConversionUuid = validateTechnicalUuid(appliedConversionId);
    const appliedCandidateUuid = validateTechnicalUuid(appliedCandidateId);
    await assertPublicTechnicalObjectNamesAvailable(
      countConversionTrigger,
      countConversionFunction,
      "conversions",
      [countConversionSequence],
    );
    await assertPublicTechnicalObjectNamesAvailable(
      countAuditTrigger,
      countAuditFunction,
      "reconciliation_audit_events",
      [countAuditSequence],
    );
    const assertCounterSequenceUncalled = async (
      sequenceName: string,
      reason: string,
    ): Promise<void> => {
      let rows: postgres.RowList<postgres.Row[]>;
      try {
        rows = await admin.unsafe(`
          SELECT last_value::text AS last_value, is_called
          FROM public."${sequenceName}"
        `);
      } catch {
        throw new Phase20kFixtureSafetyError(reason);
      }
      if (
        rows.length !== 1 ||
        rows[0]!.last_value !== "1" ||
        rows[0]!.is_called !== false
      ) {
        throw new Phase20kFixtureSafetyError(reason);
      }
    };
    await admin.begin(async (tx) => {
      await tx.unsafe(`
        CREATE SEQUENCE public."${countConversionSequence}"
          AS bigint
          START WITH 1
          INCREMENT BY 1
          MINVALUE 1
          NO MAXVALUE
          CACHE 1
          NO CYCLE
      `);
      await tx.unsafe(`
        CREATE SEQUENCE public."${countAuditSequence}"
          AS bigint
          START WITH 1
          INCREMENT BY 1
          MINVALUE 1
          NO MAXVALUE
          CACHE 1
          NO CYCLE
      `);
      await tx.unsafe(`
        CREATE FUNCTION public."${countConversionFunction}"()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog, public
      AS $$
      BEGIN
        IF NEW.id = '${appliedConversionUuid}'::uuid THEN
          PERFORM nextval('public."${countConversionSequence}"'::regclass);
        END IF;
        RETURN NEW;
      END;
      $$
      `);
      await tx.unsafe(`
        CREATE FUNCTION public."${countAuditFunction}"()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog, public
      AS $$
      BEGIN
        IF NEW.run_candidate_id = '${appliedCandidateUuid}'::uuid THEN
          PERFORM nextval('public."${countAuditSequence}"'::regclass);
        END IF;
        RETURN NEW;
      END;
      $$
      `);
      await tx.unsafe(`
        CREATE TRIGGER "${countConversionTrigger}"
          BEFORE UPDATE ON public.conversions
          FOR EACH ROW EXECUTE FUNCTION
            public."${countConversionFunction}"()
      `);
      await tx.unsafe(`
        CREATE TRIGGER "${countAuditTrigger}"
          BEFORE INSERT ON public.reconciliation_audit_events
          FOR EACH ROW EXECUTE FUNCTION
            public."${countAuditFunction}"()
      `);
    });

    // ----------------------------------------------------------------
    // Step 4 -- retry the same reconciliationRunId.
    let retryThrown: unknown = null;
    let retryResult: Awaited<
      ReturnType<typeof commitReconciliationAsync>
    > | null = null;
    try {
      await assertCounterSequenceUncalled(
        countConversionSequence,
        "conversion_counter_precondition_invalid",
      );
      await assertCounterSequenceUncalled(
        countAuditSequence,
        "audit_counter_precondition_invalid",
      );
      retryResult = await commitReconciliationAsync({
        actorUserId: ADMIN_ACTOR_ID,
        actorRole: "admin",
        reconciliationRunId: dry.reconciliationRunId,
        identifierPlan: nextCommitPlan(),
      }, repositoryDependencies.executor);
      await assertCounterSequenceUncalled(
        countConversionSequence,
        "conversion_update_attempt_observed_on_retry",
      );
      await assertCounterSequenceUncalled(
        countAuditSequence,
        "audit_insert_attempt_observed_on_retry",
      );
    } catch (err) {
      retryThrown = err;
    } finally {
      await teardownPublicTechnicalObjectPairs([
        [
          countConversionTrigger,
          countConversionFunction,
          "conversions",
          [countConversionSequence],
        ],
        [
          countAuditTrigger,
          countAuditFunction,
          "reconciliation_audit_events",
          [countAuditSequence],
        ],
      ]);
    }
    assert.equal(
      retryThrown,
      null,
      "retry must not throw; durable outcomes let it complete",
    );

    // ----------------------------------------------------------------
    // Assertions -- the durable state.
    const auditForA = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE run_candidate_id = ${appliedCandidateId}::uuid
    `;
    assert.equal(
      Number(auditForA[0]!.n),
      1,
      "candidate A audit row count remains exactly 1 (no reprocess)",
    );

    const convAfterRetry = await admin`
      SELECT status, network_commission::text AS c,
             user_cashback::text AS u,
             platform_profit::text AS p,
             approved_at, updated_at
      FROM conversions WHERE id = ${appliedConversionId}::uuid
    `;
    assert.equal(
      String(convAfterRetry[0]!.status),
      convFirstSnapshot.status,
      "candidate A conversion status unchanged on retry",
    );
    assert.equal(
      String(convAfterRetry[0]!.c),
      convFirstSnapshot.c,
      "candidate A network_commission unchanged on retry",
    );
    assert.equal(
      String(convAfterRetry[0]!.u),
      convFirstSnapshot.u,
      "candidate A user_cashback unchanged on retry",
    );
    assert.equal(
      String(convAfterRetry[0]!.p),
      convFirstSnapshot.p,
      "candidate A platform_profit unchanged on retry",
    );
    assert.equal(
      String(convAfterRetry[0]!.updated_at),
      convFirstSnapshot.updatedAt,
      "candidate A updated_at unchanged on retry",
    );

    // The previously-pending candidate (B) must now be
    // `applied`.
    const afterRetry = await admin`
      SELECT id::text AS id, conversion_id::text AS conversion_id,
             processing_outcome, processing_reason_code
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
      ORDER BY created_at ASC, id ASC
    `;
    const aAfter = afterRetry.find(
      (r) => String(r.id) === appliedCandidateId,
    );
    const bAfter = afterRetry.find(
      (r) => String(r.id) !== appliedCandidateId,
    );
    assert.equal(
      String(aAfter!.processing_outcome),
      "applied",
      "candidate A outcome remains `applied`",
    );
    assert.equal(
      aAfter!.processing_reason_code,
      appliedReasonCode,
      "candidate A reason_code unchanged on retry",
    );
    assert.equal(
      String(bAfter!.processing_outcome),
      "applied",
      "candidate B outcome is now `applied`",
    );

    // ----------------------------------------------------------------
    // Assertions -- instrumentation counters.
    //
    // The exact pre/post sequence assertions inside the protected
    // region prove zero UPDATE and audit-INSERT trigger attempts.

    // ----------------------------------------------------------------
    // Assertions -- run-level finalization.
    const runFinal = await admin`
      SELECT status, committed_at, failed_at, failed_reason
      FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(
      String(runFinal[0]!.status),
      "committed",
      "retry must transition the run to `committed`",
    );
    assert.ok(
      runFinal[0]!.committed_at !== null,
      "committed_at must be set after retry",
    );
    assert.equal(
      runFinal[0]!.failed_at,
      null,
      "failed_at must be cleared after retry",
    );
    assert.equal(
      runFinal[0]!.failed_reason,
      null,
      "failed_reason must be cleared after retry",
    );
    // No `rejected_terminal_state` for A -- the retry
    // response did not route A through the terminal-state
    // guard because A was filtered out before the loop.
    const allRejectedTerminal = await admin`
      SELECT count(*)::int AS n FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
        AND processing_reason_code = 'rejected_terminal_state'
    `;
    assert.equal(
      Number(allRejectedTerminal[0]!.n),
      0,
      "no candidate was rejected with rejected_terminal_state on retry",
    );
    const totalAudit = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE reconciliation_run_id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(
      Number(totalAudit[0]!.n),
      2,
      "exactly one audit row per applied candidate (2 total across the run lifecycle)",
    );
    const pendingCount = await admin`
      SELECT count(*)::int AS n FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
        AND processing_outcome = 'pending'
    `;
    assert.equal(
      Number(pendingCount[0]!.n),
      0,
      "no candidate remains `pending` after retry",
    );
    // Retry response shape -- the local `applied` array is
    // this-attempt only; the previously-`applied` candidate is
    // NOT re-bucketed into the retry response (the persisted
    // state already records it).
    assert.ok(retryResult, "retryResult must exist");
    assert.equal(
      retryResult!.applied.length,
      1,
      "retry response carries only this-attempt applies (candidate B)",
    );
    assert.equal(
      retryResult!.scannedRowCount,
      2,
      "scannedRowCount reflects the full persisted plan (2 candidates)",
    );
  });

  test("BLK 6 (real rejection evidence): pending -> rejected when source order_status = CANCELLED", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    // Set the matching csv row order_status to CANCELLED so the
    // loader's sourceStatus becomes "cancelled" and the mapper
    // returns a reject decision.
    await admin`
      UPDATE shopee_csv_rows SET order_status = 'CANCELLED'
      WHERE row_fingerprint_sha256 = ${source}::text
    `;
    await insertConversion({
      id,
      externalOrderId: "blk6-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 18000,
      validationStatus: "approved",
      ingestionEventId: ingestionEventId,
    });

    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    const plannedRun = fixtureGraph.dryRunPlans[27]!;
    const plannedCandidate = plannedRun.candidates[0]!;
    assert.equal(dry.reconciliationRunId, plannedRun.reconciliationRunId);
    assert.equal(dry.appliedCount, 1, "cancelled evidence plans exactly one rejection");
    assert.equal(dry.skipped.length, 0);
    assert.equal(plannedRun.candidates.length, 1);
    assert.equal(plannedCandidate.candidateId, fixtureGraph.candidateIds[24]);
    assert.equal(plannedCandidate.conversionId, id);
    assert.equal(plannedCandidate.sourceConversionKey, source);

    const candidatePlan = await admin`
      SELECT id::text AS id,
             run_id::text AS run_id,
             conversion_id::text AS conversion_id,
             source_conversion_key,
             expected_previous_status::text AS previous_status,
             intended_next_status::text AS next_status,
             planned_reason_code::text AS reason_code,
             planned_money_network_commission::text AS network_commission,
             planned_money_user_cashback::text AS user_cashback,
             planned_money_platform_profit::text AS platform_profit,
             processing_outcome::text AS processing_outcome,
             processing_reason_code,
             processing_completed_at
      FROM reconciliation_run_candidates
      WHERE id = ${plannedCandidate.candidateId}::uuid
    `;
    assert.equal(candidatePlan.length, 1, "exact preallocated candidate is durable");
    assert.equal(candidatePlan[0]!.id, plannedCandidate.candidateId);
    assert.equal(candidatePlan[0]!.run_id, plannedRun.reconciliationRunId);
    assert.equal(candidatePlan[0]!.conversion_id, id);
    assert.equal(candidatePlan[0]!.source_conversion_key, source);
    assert.equal(candidatePlan[0]!.previous_status, "pending");
    assert.equal(candidatePlan[0]!.next_status, "rejected");
    assert.equal(candidatePlan[0]!.reason_code, "rejected_source_cancelled");
    assert.equal(candidatePlan[0]!.network_commission, "18000");
    assert.equal(candidatePlan[0]!.user_cashback, "10800");
    assert.equal(candidatePlan[0]!.platform_profit, "7200");
    assert.equal(candidatePlan[0]!.processing_outcome, "pending");
    assert.equal(candidatePlan[0]!.processing_reason_code, null);
    assert.equal(candidatePlan[0]!.processing_completed_at, null);

    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(commit.applied.length, 1, "commit applies exactly one current-attempt transition");
    assert.equal(commit.applied[0]!.conversionId, id);
    assert.equal(commit.skipped.length, 0);

    const conversionAfter = await admin`
      SELECT status, rejected_at, rejected_reason,
             network_commission::text AS network_commission,
             user_cashback::text AS user_cashback,
             platform_profit::text AS platform_profit,
             approved_at, payable_at, paid_at,
             to_jsonb(c)::text AS row_json
      FROM conversions c WHERE id = ${id}::uuid
    `;
    assert.equal(conversionAfter.length, 1);
    assert.equal(conversionAfter[0]!.status, "rejected");
    assert.ok(conversionAfter[0]!.rejected_at !== null);
    assert.equal(conversionAfter[0]!.rejected_reason, "rejected_source_cancelled");
    assert.equal(conversionAfter[0]!.network_commission, "18000");
    assert.equal(conversionAfter[0]!.user_cashback, "10800");
    assert.equal(conversionAfter[0]!.platform_profit, "7200");
    assert.equal(conversionAfter[0]!.approved_at, null);
    assert.equal(conversionAfter[0]!.payable_at, null);
    assert.equal(conversionAfter[0]!.paid_at, null);

    const candidateAfter = await admin`
      SELECT id::text AS id,
             run_id::text AS run_id,
             conversion_id::text AS conversion_id,
             processing_outcome::text AS processing_outcome,
             processing_reason_code,
             processing_completed_at,
             to_jsonb(c)::text AS row_json
      FROM reconciliation_run_candidates c
      WHERE id = ${plannedCandidate.candidateId}::uuid
    `;
    assert.equal(candidateAfter.length, 1);
    assert.equal(candidateAfter[0]!.id, plannedCandidate.candidateId);
    assert.equal(candidateAfter[0]!.run_id, plannedRun.reconciliationRunId);
    assert.equal(candidateAfter[0]!.conversion_id, id);
    assert.equal(candidateAfter[0]!.processing_outcome, "applied");
    assert.equal(candidateAfter[0]!.processing_reason_code, "rejected_source_cancelled");
    assert.ok(candidateAfter[0]!.processing_completed_at !== null);

    const expectedAuditId = fixtureGraph.auditIds[14]!;
    const auditAfter = await admin`
      SELECT id::text AS id,
             network,
             source_conversion_key,
             idempotency_key,
             conversion_id::text AS conversion_id,
             previous_status::text AS previous_status,
             next_status::text AS next_status,
             decision::text AS decision,
             reason_code::text AS reason_code,
             human_reason,
             network_commission::text AS network_commission,
             user_cashback::text AS user_cashback,
             platform_profit::text AS platform_profit,
             actor_kind,
             actor_user_id::text AS actor_user_id,
             actor_role,
             reconciliation_run_id::text AS reconciliation_run_id,
             run_candidate_id::text AS run_candidate_id,
             created_at,
             to_jsonb(a)::text AS row_json
      FROM reconciliation_audit_events a
      WHERE id = ${expectedAuditId}::uuid
    `;
    assert.equal(auditAfter.length, 1, "exact supplied audit ID is durable");
    assert.equal(auditAfter[0]!.id, expectedAuditId);
    assert.equal(auditAfter[0]!.network, "shopee");
    assert.equal(auditAfter[0]!.source_conversion_key, source);
    assert.equal(String(auditAfter[0]!.idempotency_key).length, 64);
    assert.equal(auditAfter[0]!.conversion_id, id);
    assert.equal(auditAfter[0]!.previous_status, "pending");
    assert.equal(auditAfter[0]!.next_status, "rejected");
    assert.equal(auditAfter[0]!.decision, "reject");
    assert.equal(auditAfter[0]!.reason_code, "rejected_source_cancelled");
    assert.equal(auditAfter[0]!.human_reason, "rejected_source_cancelled");
    assert.equal(auditAfter[0]!.network_commission, "18000");
    assert.equal(auditAfter[0]!.user_cashback, "10800");
    assert.equal(auditAfter[0]!.platform_profit, "7200");
    assert.equal(auditAfter[0]!.actor_kind, "admin");
    assert.equal(auditAfter[0]!.actor_user_id, ADMIN_ACTOR_ID);
    assert.equal(auditAfter[0]!.actor_role, "admin");
    assert.equal(auditAfter[0]!.reconciliation_run_id, plannedRun.reconciliationRunId);
    assert.equal(auditAfter[0]!.run_candidate_id, plannedCandidate.candidateId);
    assert.ok(auditAfter[0]!.created_at !== null);

    const runAfter = await admin`
      SELECT status, committed_at, failed_at, failed_reason,
             to_jsonb(r)::text AS row_json
      FROM reconciliation_runs r
      WHERE id = ${plannedRun.reconciliationRunId}::uuid
    `;
    assert.equal(runAfter.length, 1);
    assert.equal(runAfter[0]!.status, "committed");
    assert.ok(runAfter[0]!.committed_at !== null);
    assert.equal(runAfter[0]!.failed_at, null);
    assert.equal(runAfter[0]!.failed_reason, null);

    const replay = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(replay.applied.length, 0, "replay applies zero additional transitions");
    assert.equal(replay.skipped.length, 1, "replay reports one deterministic persisted candidate");
    assert.equal(replay.skipped[0]!.conversionId, id);
    assert.equal(replay.skipped[0]!.reasonCode, "rejected_duplicate_conversion");
    assert.equal(replay.skipped[0]!.idempotentReplay, true);

    const durableAfterReplay = await admin`
      SELECT
        (SELECT count(*)::int FROM reconciliation_audit_events
         WHERE id = ${expectedAuditId}::uuid) AS exact_audit_count,
        (SELECT count(*)::int FROM reconciliation_audit_events
         WHERE conversion_id = ${id}::uuid) AS conversion_audit_count,
        (SELECT to_jsonb(c)::text FROM conversions c
         WHERE id = ${id}::uuid) AS conversion_row,
        (SELECT to_jsonb(c)::text FROM reconciliation_run_candidates c
         WHERE id = ${plannedCandidate.candidateId}::uuid) AS candidate_row,
        (SELECT to_jsonb(a)::text FROM reconciliation_audit_events a
         WHERE id = ${expectedAuditId}::uuid) AS audit_row,
        (SELECT to_jsonb(r)::text FROM reconciliation_runs r
         WHERE id = ${plannedRun.reconciliationRunId}::uuid) AS run_row
    `;
    assert.equal(Number(durableAfterReplay[0]!.exact_audit_count), 1);
    assert.equal(Number(durableAfterReplay[0]!.conversion_audit_count), 1);
    assert.equal(durableAfterReplay[0]!.conversion_row, conversionAfter[0]!.row_json);
    assert.equal(durableAfterReplay[0]!.candidate_row, candidateAfter[0]!.row_json);
    assert.equal(durableAfterReplay[0]!.audit_row, auditAfter[0]!.row_json);
    assert.equal(durableAfterReplay[0]!.run_row, runAfter[0]!.row_json);
  });

  test("BLK 7 (over-limit scope): explicitConversionIds > MAX_SCOPE_ITEMS fails closed", async (repositoryDependencies) => {
    const oversized: string[] = [];
    for (let i = 0; i < 250; i++) oversized.push(nextPreallocatedUuid());
    const { dryRunReconciliationAsync } = await import(
      "../src/server/reconciliation/reconciliation.repository"
    );
    await assert.rejects(
      () =>
        dryRunReconciliationAsync({
          actor: {
            actorKind: "admin",
            actorUserId: ADMIN_ACTOR_ID,
            actorRole: "admin",
          },
          network: "shopee",
          identifierPlan: nextDryRunPlan(),
          sourceScope: { explicitConversionIds: oversized },
        }, repositoryDependencies),
      /explicitConversionIds|MAX_SCOPE_ITEMS|scope/i,
      "over-limit explicit scope must throw closed",
    );
  });

  test("BLK 7 (unrelated conversion): a row outside scope is never planned", async (repositoryDependencies) => {
    const idIn = nextPreallocatedUuid();
    const idOut = nextPreallocatedUuid();
    const sourceIn = sourceKeyFromUuid(idIn);
    const sourceOut = sourceKeyFromUuid(idOut);
    const ingestIn = nextPreallocatedUuid();
    const ingestOut = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestIn,
      sourceKey: sourceIn,
      processingStatus: "succeeded",
    });
    await insertIngestionEvent({
      id: ingestOut,
      sourceKey: sourceOut,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id: idIn,
      externalOrderId: "blk7in-" + idIn.slice(-8),
      sourceKey: sourceIn,
      status: "pending",
      commission: 10000,
      validationStatus: "approved",
      ingestionEventId: ingestIn,
    });
    await insertConversion({
      id: idOut,
      externalOrderId: "blk7out-" + idOut.slice(-8),
      sourceKey: sourceOut,
      status: "pending",
      commission: 99999,
      validationStatus: "approved",
      ingestionEventId: ingestOut,
    });
    // Scope only to idIn's source key.
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: sourceIn,
    });
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    const appliedOut = commit.applied.find((d) => d.conversionId === idOut);
    assert.equal(
      appliedOut,
      undefined,
      "out-of-scope conversion must never appear in applied",
    );
    const after = await admin`SELECT status FROM conversions WHERE id = ${idOut}::uuid`;
    assert.equal(after[0]!.status, "pending", "out-of-scope status is unchanged");
  });

  // ====================================================================
  // Phase 20K follow-up 4 -- 60/40 production-only money tests
  //
  // These three tests lock the production-policy contract:
  //
  //   * migration 0027 must prevent a policy-inconsistent persisted
  //     split before dry-run can observe it.
  //
  //   * commit must REFUSE a candidate whose persisted
  //     `reconciliation_run_candidates.planned_money_*` was tampered
  //     after dry-run, leaving the conversion untouched and producing
  //     no audit event.
  //
  //   * production commit must PERSIST the canonical 60/40 split
  //     back onto the conversion row for every network commission
  //     that the production policy rounds cleanly.
  // ====================================================================

  test("Phase 20K 60/40 production: schema rejects a wrong persisted split before dry-run", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "p60-dry-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 25000,
      validationStatus: "approved",
      ingestionEventId,
    });
    await assert.rejects(
      admin.begin(async (tx) => {
        await tx`
          UPDATE conversions
          SET user_cashback = 24980::bigint,
              platform_profit = 20::bigint
          WHERE id = ${id}::uuid
        `;
      }),
      (error: unknown) => {
        const postgresError = error as {
          readonly code?: string;
          readonly constraint_name?: string;
        };
        assert.equal(postgresError.code, "23514");
        assert.equal(
          postgresError.constraint_name,
          "conversions_cashback_policy_allocation_check",
        );
        return true;
      },
    );

    // The rejected update leaves the valid row intact, and dry-run
    // persists the canonical 60/40 split (15000 / 10000).
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1, "dry-run plans one apply");

    const candidateMoney = await admin`
      SELECT planned_money_network_commission::text AS n,
             planned_money_user_cashback::text AS u,
             planned_money_platform_profit::text AS p
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
        AND conversion_id = ${id}::uuid
    `;
    assert.equal(candidateMoney.length, 1, "exactly one candidate row");
    assert.equal(
      String(candidateMoney[0]!.n),
      "25000",
      "planned network commission preserved",
    );
    assert.equal(
      String(candidateMoney[0]!.u),
      "15000",
      "dry-run recomputed user_cashback to 60% (ignored wrong persisted value)",
    );
    assert.equal(
      String(candidateMoney[0]!.p),
      "10000",
      "dry-run recomputed platform_profit to 40% (ignored wrong persisted value)",
    );
  });

  test("Phase 20K 60/40 production: commit rejects a tampered planned split with no mutation and no audit event", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await insertConversion({
      id,
      externalOrderId: "p60-tamp-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 30000,
      validationStatus: "approved",
      ingestionEventId,
    });

    // Run dry-run normally so the candidate row carries the
    // canonical 60/40 (18000 / 12000).
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1);

    // Simulate a tampered candidate: someone rewrote the planned
    // money to a wrong split AFTER dry-run but BEFORE commit.
    await admin`
      UPDATE reconciliation_run_candidates
      SET planned_money_user_cashback = 28000::bigint,
          planned_money_platform_profit = 2000::bigint,
          planned_cashback_share_bps = NULL
      WHERE run_id = ${dry.reconciliationRunId}::uuid
        AND conversion_id = ${id}::uuid
    `;

    // Commit must refuse the tampered candidate, leave the
    // conversion status untouched, and produce zero audit events
    // for it.
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(
      commit.applied.find((d) => d.conversionId === id),
      undefined,
      "tampered candidate must NOT be applied",
    );
    const tamperedSkip = commit.skipped.find(
      (s) => s.conversionId === id,
    );
    assert.ok(
      tamperedSkip,
      "tampered candidate must appear in skipped",
    );
    assert.equal(
      tamperedSkip!.reasonCode,
      "rejected_stale_source_evidence",
      "fail-closed reason code is the single closed 'stale' reason; the money-split drift is surfaced as metadata.driftReason='stale_60_40_split'",
    );
    const convAfter = await admin`
      SELECT status, network_commission::text AS n,
             user_cashback::text AS u, platform_profit::text AS p
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(
      convAfter[0]!.status,
      "pending",
      "conversion status unchanged on tampered planned split",
    );
    const auditAfter = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(
      Number(auditAfter[0]!.n),
      0,
      "tampered candidate must NOT produce a durable audit event",
    );
  });

  test("Phase 20K 60/40 production: commit persists the canonical 60/40 amounts for every policy commission", async (repositoryDependencies) => {
    // Exercise every commission in the requirement list -- 100,
    // 101 -- plus the existing BLK 1 10000 case (in a fresh run to
    // prove the policy is invariant on amount). For each: the
    // conversion row's user_cashback + platform_profit must end
    // at the canonical 60/40 split recomputed by
    // `splitCommissionFloor`.
    const cases: ReadonlyArray<{
      readonly commission: number;
      readonly expectedUser: number;
      readonly expectedPlatform: number;
    }> = [
      { commission: 100, expectedUser: 60, expectedPlatform: 40 },
      { commission: 101, expectedUser: 60, expectedPlatform: 41 },
      { commission: 1, expectedUser: 0, expectedPlatform: 1 },
    ];

    for (const c of cases) {
      const id = nextPreallocatedUuid();
      const source = sourceKeyFromUuid(id);
      const ingestionEventId = nextPreallocatedUuid();
      await insertIngestionEvent({
        id: ingestionEventId,
        sourceKey: source,
        processingStatus: "succeeded",
      });
      await insertConversion({
        id,
        externalOrderId: "p60-persist-" + c.commission + "-" + id.slice(-8),
        sourceKey: source,
        status: "pending",
        commission: c.commission,
        validationStatus: "approved",
        ingestionEventId,
      });

      const dry = await dryRun(repositoryDependencies, {
        actorUserId: ADMIN_ACTOR_ID,
        actorRole: "admin",
        network: "shopee",
        sourceKey: source,
      });
      assert.equal(
        dry.appliedCount,
        1,
        "dry-run plans an apply for commission=" + c.commission,
      );

      const commit = await commitRun(repositoryDependencies, {
        actorUserId: ADMIN_ACTOR_ID,
        actorRole: "admin",
        reconciliationRunId: dry.reconciliationRunId,
      });
      assert.equal(
        commit.applied.length,
        1,
        "commit applies exactly one for commission=" + c.commission,
      );

      const after = await admin`
        SELECT network_commission::text AS n,
               user_cashback::text AS u,
               platform_profit::text AS p,
               status
        FROM conversions WHERE id = ${id}::uuid
      `;
      assert.equal(
        after[0]!.n,
        String(c.commission),
        "network_commission preserved for " + c.commission,
      );
      assert.equal(
        after[0]!.u,
        String(c.expectedUser),
        "user_cashback = " +
          c.expectedUser +
          " for commission=" +
          c.commission,
      );
      assert.equal(
        after[0]!.p,
        String(c.expectedPlatform),
        "platform_profit = " +
          c.expectedPlatform +
          " for commission=" +
          c.commission,
      );
      assert.equal(after[0]!.status, "approved");

      const audit = await admin`
        SELECT network_commission::text AS n,
               user_cashback::text AS u,
               platform_profit::text AS p
        FROM reconciliation_audit_events
        WHERE conversion_id = ${id}::uuid
      `;
      assert.equal(audit.length, 1);
      assert.equal(audit[0]!.n, String(c.commission));
      assert.equal(audit[0]!.u, String(c.expectedUser));
      assert.equal(audit[0]!.p, String(c.expectedPlatform));
    }
  });

  // ----------------------------------------------------------------
  // Phase 20K checkpoint 4E1 -- cancelled source evidence applies
  // pending -> rejected once.
  //
  // Real persisted rows:
  //   shopee_ingestion_events (processing_status = succeeded)
  //   shopee_csv_rows        (order_status     = 'CANCELLED')
  //   conversions            (status = pending,
  //                           validation_status = approved,
  //                           with valid attribution provenance)
  //
  // The CANCELLED source-status stamp must take precedence over
  // the previously-recorded validation_status='approved' so the
  // mapper plans `pending -> rejected` with reason code
  // `rejected_source_cancelled`. The commit must lock the
  // conversion, revalidate that CANCELLED evidence still exists,
  // apply status = rejected, persist rejected_at + rejected_reason,
  // write exactly one reconciliation_audit_events row, persist
  // candidate processing_outcome = applied, and finalize the run
  // under the existing 4D2 lifecycle.
  //
  // Money policy: the conversion's existing reconciled commission
  // fields are PRESERVED on the rejected transition. The
  // commission-allocation invariant
  // (`network_commission = user_cashback + platform_profit`)
  // continues to hold. No wallet, ledger, payout, or paid write.
  //
  // Same-run replay must produce zero new transitions and zero
  // new audit events; `rejected_at` and `rejected_reason` are
  // unchanged. Rejected remains terminal.
  test("Phase 20K 4E1: cancelled evidence applies pending -> rejected once", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    await admin`
      UPDATE shopee_csv_rows SET order_status = 'CANCELLED'
      WHERE row_fingerprint_sha256 = ${source}::text
    `;
    await insertConversion({
      id,
      externalOrderId: "blk4e1-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 18000,
      validationStatus: "approved",
      ingestionEventId,
    });
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1, "dry-run must plan exactly one rejected transition");
    assert.equal(dry.skipped.length, 0, "no skip entries for the cancelled conversion");
    const planRow = await admin`
      SELECT expected_previous_status::text AS prev,
             intended_next_status::text AS next,
             planned_reason_code::text AS reason,
             planned_money_network_commission::text AS nc,
             planned_money_user_cashback::text AS uc,
             planned_money_platform_profit::text AS pp
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
        AND conversion_id = ${id}::uuid
    `;
    assert.equal(planRow.length, 1, "exactly one durable candidate plan row");
    assert.equal(planRow[0]!.prev, "pending", "expected previous status = pending");
    assert.equal(planRow[0]!.next, "rejected", "intended next status = rejected");
    assert.equal(planRow[0]!.reason, "rejected_source_cancelled", "reject reason must be the closed 'rejected_source_cancelled' code");
    assert.equal(Number(planRow[0]!.nc), 18000, "planned network_commission = existing reconciled commission");
    assert.equal(Number(planRow[0]!.uc), 10800, "planned user_cashback = 18000 * 60% = 10800 (preserved)");
    assert.equal(Number(planRow[0]!.pp), 7200, "planned platform_profit = 18000 * 40% = 7200 (preserved)");
    assert.equal(
      Number(planRow[0]!.nc),
      Number(planRow[0]!.uc) + Number(planRow[0]!.pp),
      "dry-run planned money invariant: network = user + platform",
    );
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(commit.applied.length, 1);
    assert.equal(commit.applied.find((d) => d.conversionId === id)?.conversionId, id);
    assert.equal(commit.skipped.length, 0);
    const after = await admin`
      SELECT status, rejected_at, rejected_reason,
             network_commission::text AS nc,
             user_cashback::text AS uc,
             platform_profit::text AS pp,
             approved_at, payable_at, paid_at
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(after[0]!.status, "rejected");
    assert.ok(after[0]!.rejected_at !== null);
    assert.ok(
      after[0]!.rejected_reason !== null &&
        String(after[0]!.rejected_reason).includes("rejected_source_cancelled"),
    );
    assert.equal(Number(after[0]!.nc), 18000);
    assert.equal(Number(after[0]!.uc), 10800);
    assert.equal(Number(after[0]!.pp), 7200);
    assert.equal(
      Number(after[0]!.nc),
      Number(after[0]!.uc) + Number(after[0]!.pp),
    );
    assert.equal(after[0]!.approved_at, null);
    assert.equal(after[0]!.payable_at, null);
    assert.equal(after[0]!.paid_at, null);
    const audit = await admin`
      SELECT previous_status::text AS prev,
             next_status::text AS next,
             decision::text AS dec,
             reason_code::text AS reason,
             network_commission::text AS nc,
             user_cashback::text AS uc,
             platform_profit::text AS pp
      FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(audit.length, 1);
    assert.equal(audit[0]!.prev, "pending");
    assert.equal(audit[0]!.next, "rejected");
    assert.equal(audit[0]!.dec, "reject");
    assert.equal(audit[0]!.reason, "rejected_source_cancelled");
    assert.equal(Number(audit[0]!.nc), 18000);
    assert.equal(Number(audit[0]!.uc), 10800);
    assert.equal(Number(audit[0]!.pp), 7200);
    assert.equal(
      Number(audit[0]!.nc),
      Number(audit[0]!.uc) + Number(audit[0]!.pp),
    );
    const candAfter = await admin`
      SELECT processing_outcome::text AS outcome,
             processing_completed_at
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
        AND conversion_id = ${id}::uuid
    `;
    assert.equal(candAfter.length, 1);
    assert.equal(candAfter[0]!.outcome, "applied");
    assert.ok(candAfter[0]!.processing_completed_at !== null);
    const runAfter = await admin`
      SELECT status, committed_at, failed_at, failed_reason
      FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(runAfter[0]!.status, "committed");
    assert.ok(runAfter[0]!.committed_at !== null);
    assert.equal(runAfter[0]!.failed_at, null);
    assert.equal(runAfter[0]!.failed_reason, null);
    const replayRejectedAt = after[0]!.rejected_at;
    const replayRejectedReason = after[0]!.rejected_reason;
    const replay = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(replay.applied.length, 0);
    const auditAfterReplay = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(Number(auditAfterReplay[0]!.n), 1);
    const afterReplay = await admin`
      SELECT status, rejected_at, rejected_reason
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(afterReplay[0]!.status, "rejected");
    assert.equal(String(afterReplay[0]!.rejected_at), String(replayRejectedAt));
    assert.equal(String(afterReplay[0]!.rejected_reason), String(replayRejectedReason));
  });

  // ----------------------------------------------------------------
  // Phase 20K checkpoint 4E2 -- refunded source evidence applies
  // pending -> rejected once.
  //
  // Same machinery as 4E1 (cancelled evidence) but for REFUNDED
  // source rows. The loader normalises `order_status = 'REFUNDED'`
  // to `sourceStatus = "refunded"`; the mapper returns
  // `kind: "reject", nextStatus: "rejected",
  // reasonCode: "rejected_source_refunded"` (the distinct closed
  // code for refunded source states -- Phase 20K 4E2B splits the
  // prior shared `rejected_source_cancelled` code into one per
  // source state; CANCELLED continues to use
  // `rejected_source_cancelled`, verified in 4E1).
  //
  // Real persisted rows:
  //   shopee_ingestion_events (processing_status = succeeded)
  //   shopee_csv_rows        (order_status     = 'REFUNDED')
  //   conversions            (status = pending,
  //                           validation_status = approved,
  //                           with valid attribution provenance)
  //
  // Money policy: same as 4E1 -- preserve the existing
  // reconciled commission on a rejected transition. No wallet,
  // ledger, payout, or paid write.
  test("Phase 20K 4E2: refunded evidence applies pending -> rejected once", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "succeeded",
    });
    // Persisted REFUNDED source row. The loader normalises
    // `order_status = 'REFUNDED'` -> `sourceStatus = "refunded"`
    // and the mapper returns `kind: "reject"`.
    await admin`
      UPDATE shopee_csv_rows SET order_status = 'REFUNDED'
      WHERE row_fingerprint_sha256 = ${source}::text
    `;
    // Commission: 25000 -> 15000 user (60%) + 10000 platform (40%).
    await insertConversion({
      id,
      externalOrderId: "blk4e2-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 25000,
      validationStatus: "approved",
      ingestionEventId,
    });

    // (1) Dry-run must plan the rejected transition.
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(dry.appliedCount, 1, "dry-run must plan exactly one rejected transition");
    assert.equal(dry.skipped.length, 0, "no skip entries for the refunded conversion");

    // (2) The planned reason is the distinct closed code
    // for refunded source states (4E2B).
    const planRow = await admin`
      SELECT expected_previous_status::text AS prev,
             intended_next_status::text AS next,
             planned_reason_code::text AS reason,
             planned_money_network_commission::text AS nc,
             planned_money_user_cashback::text AS uc,
             planned_money_platform_profit::text AS pp
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
        AND conversion_id = ${id}::uuid
    `;
    assert.equal(planRow.length, 1);
    assert.equal(planRow[0]!.prev, "pending");
    assert.equal(planRow[0]!.next, "rejected");
    assert.equal(planRow[0]!.reason, "rejected_source_refunded", "reason must be the distinct closed 'rejected_source_refunded' code for refunded source states");
    assert.equal(Number(planRow[0]!.nc), 25000, "planned network_commission = existing reconciled commission");
    assert.equal(Number(planRow[0]!.uc), 15000, "planned user_cashback = 25000 * 60% = 15000 (preserved)");
    assert.equal(Number(planRow[0]!.pp), 10000, "planned platform_profit = 25000 * 40% = 10000 (preserved)");
    assert.equal(
      Number(planRow[0]!.nc),
      Number(planRow[0]!.uc) + Number(planRow[0]!.pp),
    );

    // (3) (4) (5) (6) (7) Commit applies once; final
    // conversion state.
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(commit.applied.length, 1);
    assert.equal(commit.applied.find((d) => d.conversionId === id)?.conversionId, id);
    assert.equal(commit.skipped.length, 0);
    const after = await admin`
      SELECT status, rejected_at, rejected_reason,
             network_commission::text AS nc,
             user_cashback::text AS uc,
             platform_profit::text AS pp,
             approved_at, payable_at, paid_at
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(after[0]!.status, "rejected");
    assert.ok(after[0]!.rejected_at !== null);
    assert.ok(
      after[0]!.rejected_reason !== null,
      "rejected_reason must be set for a rejected conversion",
    );
    assert.equal(Number(after[0]!.nc), 25000);
    assert.equal(Number(after[0]!.uc), 15000);
    assert.equal(Number(after[0]!.pp), 10000);
    assert.equal(
      Number(after[0]!.nc),
      Number(after[0]!.uc) + Number(after[0]!.pp),
      "money invariant: network = user + platform (25000 = 15000 + 10000)",
    );
    assert.equal(after[0]!.approved_at, null);
    assert.equal(after[0]!.payable_at, null);
    assert.equal(after[0]!.paid_at, null);

    // (8) (9) (10) Exactly one durable audit event.
    const audit = await admin`
      SELECT previous_status::text AS prev,
             next_status::text AS next,
             decision::text AS dec,
             reason_code::text AS reason,
             network_commission::text AS nc,
             user_cashback::text AS uc,
             platform_profit::text AS pp
      FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(audit.length, 1, "exactly one durable audit event");
    assert.equal(audit[0]!.prev, "pending");
    assert.equal(audit[0]!.next, "rejected");
    assert.equal(audit[0]!.dec, "reject");
    assert.equal(audit[0]!.reason, "rejected_source_refunded");
    assert.equal(Number(audit[0]!.nc), 25000);
    assert.equal(Number(audit[0]!.uc), 15000);
    assert.equal(Number(audit[0]!.pp), 10000);

    // (11) Candidate processing_outcome = applied.
    const candAfter = await admin`
      SELECT processing_outcome::text AS outcome,
             processing_completed_at
      FROM reconciliation_run_candidates
      WHERE run_id = ${dry.reconciliationRunId}::uuid
        AND conversion_id = ${id}::uuid
    `;
    assert.equal(candAfter.length, 1);
    assert.equal(candAfter[0]!.outcome, "applied");
    assert.ok(candAfter[0]!.processing_completed_at !== null);

    // (12) Run status = committed.
    const runAfter = await admin`
      SELECT status, committed_at, failed_at, failed_reason
      FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(runAfter[0]!.status, "committed");
    assert.ok(runAfter[0]!.committed_at !== null);
    assert.equal(runAfter[0]!.failed_at, null);
    assert.equal(runAfter[0]!.failed_reason, null);

    // (13) Same-run replay: zero transitions, audit count stays 1,
    // rejected metadata unchanged.
    const replayRejectedAt = after[0]!.rejected_at;
    const replayRejectedReason = after[0]!.rejected_reason;
    const replay = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(replay.applied.length, 0, "replay applied count = 0 (rejected is terminal)");
    const auditAfterReplay = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(Number(auditAfterReplay[0]!.n), 1);
    const afterReplay = await admin`
      SELECT status, rejected_at, rejected_reason
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(afterReplay[0]!.status, "rejected");
    assert.equal(String(afterReplay[0]!.rejected_at), String(replayRejectedAt));
    assert.equal(String(afterReplay[0]!.rejected_reason), String(replayRejectedReason));
  });

  // ----------------------------------------------------------------
  // Phase 20K checkpoint 4E3B -- safety blocker.
  //
  // 4E3 (now REMOVED) auto-classified any
  // `processing_status='failed'` ingestion event as
  // `sourceStatus='confirmed_invalid'` and planned a
  // `pending -> rejected` transition with reason code
  // `rejected_source_invalid`. That path was UNSAFE because
  // the persisted `failure_code` value is unvalidated free-form
  // text with no allowlist tying any code to a business-
  // invalid meaning, and the production tree has no writer
  // for such a code today. A technical ingestion failure
  // (network error / timeout / parse failure / transport /
  // database error / unknown) MUST NOT silently reject a
  // buyer's pending cashback.
  //
  // Phase 20K 4E3B intentionally deletes the auto-mapping. The
  // two tests below exercise the contract that protects buyer
  // cashback:
  //
  //   - `technical_failure_code_persisted_for_a_failed_ingestion_
  //     event_must_not_apply_any_transition_and_must_not_mutate_
  //     the_conversion`
  //   - `unknown_failure_code_persisted_for_a_failed_ingestion_
  //     event_must_not_apply_any_transition_and_must_not_mutate_
  //     the_conversion`
  //
  // No real business-invalid failure_code allowlist currently
  // exists; there is therefore no test case that asserts the
  // apply path. The closed reason code
  // `rejected_source_invalid` and the snapshot value
  // `confirmed_invalid` are RESERVED for a future checkpoint
  // that introduces such an allowlist.
  test("Phase 20K 4E3B (1) technical failure_code for a failed ingestion event -> skip; no reject; no conversion mutation", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    // A real persisted `processing_status='failed'` row with a
    // synthetic, unverified `failure_code` value -- the kind of
    // row an upstream network error / parse failure / db error
    // could plausibly produce. The only thing that matters for
    // the loader is the value of `processing_status`, but we
    // pin a representative string so the contract is explicit.
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "failed",
      failureCode: "shopee_upstream_timeout",
      failureMessage: "synthetic technical ingestion failure for 4E3B",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4e3b-tech-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 25000,
      validationStatus: "approved",
      ingestionEventId,
    });

    // Snapshot the pre-dry-run conversion state so we can prove
    // it is byte-equal afterwards (zero mutation).
    const before = await admin`
      SELECT status, rejected_at, rejected_reason,
             network_commission::text AS nc,
             user_cashback::text AS uc,
             platform_profit::text AS pp,
             approved_at, payable_at, paid_at,
             to_jsonb(c)::text AS row_json
      FROM conversions c WHERE id = ${id}::uuid
    `;
    assert.equal(before[0]!.status, "pending");
    assert.equal(before[0]!.rejected_at, null);
    assert.equal(before[0]!.rejected_reason, null);

    // Dry-run must NOT plan a transition. The persisted
    // 'failed' ingestion event is processed as a SKIP -- the
    // buyer is NOT auto-rejected.
    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(
      dry.appliedCount,
      0,
      "technical ingestion failure must NOT plan a pending -> rejected transition",
    );
    assert.notEqual(
      dry.skipped.length,
      0,
      "technical ingestion failure MUST be recorded as a skip (not silently lost)",
    );
    const technicalPlan = fixtureGraph.dryRunPlans[37]!;
    assert.equal(dry.reconciliationRunId, technicalPlan.reconciliationRunId);
    assert.equal(technicalPlan.candidates.length, 0, "technical 4E3B plan is exactly empty");
    const candidateCounts = await admin`
      SELECT
        (SELECT count(*)::int FROM reconciliation_run_candidates
         WHERE run_id = ${dry.reconciliationRunId}::uuid) AS run_count,
        (SELECT count(*)::int FROM reconciliation_run_candidates
         WHERE conversion_id = ${id}::uuid) AS conversion_count
    `;
    assert.equal(Number(candidateCounts[0]!.run_count), 0, "empty plan persists zero candidates");
    assert.equal(Number(candidateCounts[0]!.conversion_count), 0, "conversion has no candidate row");
    const dryRunState = await admin`
      SELECT status, committed_at, failed_at, failed_reason
      FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(dryRunState.length, 1);
    assert.equal(dryRunState[0]!.status, "draft");
    assert.equal(dryRunState[0]!.committed_at, null);
    assert.equal(dryRunState[0]!.failed_at, null);
    assert.equal(dryRunState[0]!.failed_reason, null);

    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(
      commit.applied.length,
      0,
      "commit must NOT apply a transition for a technical ingestion failure",
    );
    assert.equal(commit.skipped.length, 0, "empty persisted plan has no commit-time candidate skips");

    // The conversion must be UNCHANGED: still 'pending',
    // still null rejected_at / rejected_reason, money
    // invariant preserved. The persisted commission of 25000
    // is unchanged; the prior 60/40 split
    // (25000 = 15000 + 10000) holds.
    const after = await admin`
      SELECT status, rejected_at, rejected_reason,
             network_commission::text AS nc,
             user_cashback::text AS uc,
             platform_profit::text AS pp,
             approved_at, payable_at, paid_at,
             to_jsonb(c)::text AS row_json
      FROM conversions c WHERE id = ${id}::uuid
    `;
    assert.equal(after[0]!.status, "pending");
    assert.equal(after[0]!.rejected_at, null);
    assert.equal(after[0]!.rejected_reason, null);
    assert.equal(Number(after[0]!.nc), Number(before[0]!.nc));
    assert.equal(Number(after[0]!.uc), Number(before[0]!.uc));
    assert.equal(Number(after[0]!.pp), Number(before[0]!.pp));
    assert.equal(Number(after[0]!.nc), 25000);
    assert.equal(Number(after[0]!.uc), 15000);
    assert.equal(Number(after[0]!.pp), 10000);
    assert.equal(
      Number(after[0]!.nc),
      Number(after[0]!.uc) + Number(after[0]!.pp),
      "money invariant must remain a valid 60/40 allocation",
    );
    assert.equal(after[0]!.approved_at, null);
    assert.equal(after[0]!.payable_at, null);
    assert.equal(after[0]!.paid_at, null);
    assert.equal(after[0]!.row_json, before[0]!.row_json, "complete conversion row is unchanged");

    // Audit table must remain EMPTY for this conversion. A
    // technical ingestion failure must NOT produce a durable
    // audit event.
    const auditCount = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(
      Number(auditCount[0]!.n),
      0,
      "no durable audit row may be written for a technical ingestion failure",
    );
    const runAuditCount = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE reconciliation_run_id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(Number(runAuditCount[0]!.n), 0, "empty run writes zero audit rows");
    const committedRun = await admin`
      SELECT status, committed_at, failed_at, failed_reason
      FROM reconciliation_runs
      WHERE id = ${dry.reconciliationRunId}::uuid
    `;
    assert.equal(committedRun.length, 1);
    assert.equal(committedRun[0]!.status, "committed");
    assert.ok(committedRun[0]!.committed_at !== null);
    assert.equal(committedRun[0]!.failed_at, null);
    assert.equal(committedRun[0]!.failed_reason, null);
  });

  test("Phase 20K 4E3B (2) unknown failure_code for a failed ingestion event -> skip; no reject; no conversion mutation", async (repositoryDependencies) => {
    const id = nextPreallocatedUuid();
    const source = sourceKeyFromUuid(id);
    const ingestionEventId = nextPreallocatedUuid();
    // Unverified / unknown failure_code -- even more important
    // that this falls through to a skip rather than auto-
    // rejecting buyer cashback.
    await insertIngestionEvent({
      id: ingestionEventId,
      sourceKey: source,
      processingStatus: "failed",
      failureCode: "unknown_or_unspecified",
      failureMessage: "synthetic unknown failure for 4E3B",
    });
    await insertConversion({
      id,
      externalOrderId: "blk4e3b-unk-" + id.slice(-8),
      sourceKey: source,
      status: "pending",
      commission: 18000,
      validationStatus: "approved",
      ingestionEventId,
    });

    const before = await admin`
      SELECT status, rejected_at, rejected_reason,
             network_commission::text AS nc,
             user_cashback::text AS uc,
             platform_profit::text AS pp,
             approved_at, payable_at, paid_at
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(before[0]!.status, "pending");
    assert.equal(before[0]!.rejected_at, null);

    const dry = await dryRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      network: "shopee",
      sourceKey: source,
    });
    assert.equal(
      dry.appliedCount,
      0,
      "unknown failure_code must NOT plan a pending -> rejected transition",
    );
    const commit = await commitRun(repositoryDependencies, {
      actorUserId: ADMIN_ACTOR_ID,
      actorRole: "admin",
      reconciliationRunId: dry.reconciliationRunId,
    });
    assert.equal(
      commit.applied.length,
      0,
      "commit must NOT apply a transition for an unknown failure_code",
    );

    const after = await admin`
      SELECT status, rejected_at, rejected_reason,
             network_commission::text AS nc,
             user_cashback::text AS uc,
             platform_profit::text AS pp,
             approved_at, payable_at, paid_at
      FROM conversions WHERE id = ${id}::uuid
    `;
    assert.equal(after[0]!.status, "pending");
    assert.equal(after[0]!.rejected_at, null);
    assert.equal(after[0]!.rejected_reason, null);
    assert.equal(Number(after[0]!.nc), Number(before[0]!.nc));
    assert.equal(Number(after[0]!.uc), Number(before[0]!.uc));
    assert.equal(Number(after[0]!.pp), Number(before[0]!.pp));
    assert.equal(
      Number(after[0]!.nc),
      Number(after[0]!.uc) + Number(after[0]!.pp),
    );
    assert.equal(after[0]!.approved_at, null);
    assert.equal(after[0]!.payable_at, null);
    assert.equal(after[0]!.paid_at, null);

    const auditCount = await admin`
      SELECT count(*)::int AS n FROM reconciliation_audit_events
      WHERE conversion_id = ${id}::uuid
    `;
    assert.equal(
      Number(auditCount[0]!.n),
      0,
      "no durable audit row may be written for an unknown failure_code",
    );
  });

  let writesStarted = false;
  let allConcurrentDatabaseWorkSettled = false;
  let allMutationClientsQuiesced = false;
  let mainAdminQuiesced = false;
  let mutexAcquisitionError: Error | undefined;
  let executionError: Error | undefined;
  let cleanupError: Error | undefined;
  const closeErrors: Error[] = [];
  const mutexReleaseErrors: Error[] = [];
  let mutexClientCloseError: Error | undefined;

  try {
    await acquireExecutionMutex();
  } catch (error) {
    mutexAcquisitionError = nonSecretError(
      error,
      "fixture_execution_mutex_acquisition_failed",
    );
  }

  if (mutexAcquisitionError === undefined && mutexOwned) {
    try {
      admin = (() => {
        try {
          return postgres(DATABASE_URL, { max: 1, prepare: false });
        } catch (error) {
          throw nonSecretError(error, "admin_database_client_construction_failed");
        }
      })();
      adminConstructed = true;
    } catch (error) {
      executionError = nonSecretError(error, "admin_database_client_construction_failed");
    }

    if (adminConstructed) {
      try {
        await assertNoStrandedTechnicalObjects();
        const before = await captureBaselineSnapshot();
        assertEmptyBaseline(before, "preflight");
        const sharedRepositoryDependencies =
          await buildTrackedRepositoryDependencies("shared_repository_client");
        writesStarted = true;
        await bootstrap();
        for (const scenario of scenarioDefinitions) {
          await runScenario(
            context,
            scenario.name,
            () => scenario.callback(sharedRepositoryDependencies),
          );
        }
        await assertFinalOwnedStateBeforeCleanup();
        assert.equal(scenarioDefinitions.length, 38, "complete scenario inventory");
        assert.equal(legacyUuidCursor, fixtureGraph.legacyUuidSequence.length);
        assert.equal(csvRowCursor, fixtureGraph.csvRowIds.length);
        assert.equal(dryPlanCursor, fixtureGraph.dryRunPlans.length);
        assert.equal(commitPlanCursor, fixtureGraph.commitPlans.length);
      } catch (error) {
        executionError = nonSecretError(error, "fixture_execution_failed");
      }
    }
  }

  if (mutexOwned) {
    if (activeConcurrentDatabaseGroups === 0) {
      allConcurrentDatabaseWorkSettled = true;
    } else {
      const unsettledFailure = new Phase20kFixtureSafetyError(
        "concurrent_database_work_not_settled",
      );
      executionError = executionError === undefined
        ? unsettledFailure
        : new AggregateError(
            [executionError, unsettledFailure],
            "fixture_execution_and_concurrent_settlement_failed",
          );
    }

    try {
      const quiescence = await quiesceMutationClients();
      closeErrors.push(...quiescence.failures);
      allMutationClientsQuiesced =
        allConcurrentDatabaseWorkSettled && quiescence.quiesced;
    } catch (error) {
      closeErrors.push(nonSecretError(error, "database_client_quiescence_failed"));
    }

    if (writesStarted && allMutationClientsQuiesced) {
      try {
        const cleanupFailures: Error[] = [];
        let planned: ReturnType<typeof planPhase20kFixtureCleanup> | undefined;
        try {
          planned = planPhase20kFixtureCleanup(sealedManifest);
        } catch (error) {
          cleanupFailures.push(nonSecretError(error, "cleanup_planning_failed"));
        }
        if (planned) {
          try {
            await executeExactCleanupPlan(planned.cleanupPlan);
          } catch (error) {
            cleanupFailures.push(nonSecretError(error, "exact_cleanup_failed"));
          }
          try {
            const after = await captureBaselineSnapshot();
            assertEmptyBaseline(after, "post_cleanup");
          } catch (error) {
            cleanupFailures.push(nonSecretError(error, "post_cleanup_baseline_failed"));
          }
          try {
            const verified = await verifyOwnedCleanup(planned.manifest);
            assert.equal(verified.lifecycle, "verified");
          } catch (error) {
            cleanupFailures.push(
              nonSecretError(error, "ownership_cleanup_verification_failed"),
            );
          }
        }
        if (cleanupFailures.length > 0) {
          throw new AggregateError(cleanupFailures, "cleanup_failed_freeze_or_abandon");
        }
      } catch (error) {
        cleanupError = nonSecretError(
          error,
          "cleanup_failed_freeze_or_abandon_isolated_target",
        );
      }
    } else if (writesStarted) {
      cleanupError = new Phase20kFixtureSafetyError(
        "cleanup_skipped_database_client_quiescence_not_proven",
      );
    }

    if (adminConstructed && !adminClosed) {
      try {
        await admin.end();
        adminClosed = true;
        mainAdminQuiesced = true;
      } catch (error) {
        closeErrors.push(nonSecretError(error, "admin_database_client_close_failed"));
      }
    } else if (!adminConstructed) {
      mainAdminQuiesced = true;
    }

    const mutexReleaseAuthorized =
      allConcurrentDatabaseWorkSettled &&
      allMutationClientsQuiesced &&
      mainAdminQuiesced;
    if (!mutexReleaseAuthorized) {
      mutexReleaseErrors.push(
        mutexFailure("database_client_quiescence_not_proven"),
      );
    } else {
      try {
        mutexReleaseErrors.push(...await releaseExecutionMutex());
      } catch (error) {
        mutexReleaseErrors.push(
          nonSecretError(error, "fixture_execution_mutex_release_failed"),
        );
      }
    }
  }
  if (!mutexClientClosed) {
    try {
      await mutexClient.end();
      mutexClientClosed = true;
    } catch (error) {
      mutexClientCloseError = nonSecretError(
        error,
        "fixture_execution_mutex_client_close_failed",
      );
    }
  }

  const failures = [
    mutexAcquisitionError,
    executionError,
    cleanupError,
    ...closeErrors,
    ...mutexReleaseErrors,
    mutexClientCloseError,
  ].filter(
    (failure): failure is Error => failure !== undefined,
  );
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "phase20k_execution_cleanup_close_or_mutex_failed",
    );
  }
});
