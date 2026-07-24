/**
 * Phase 20K checkpoint 4G1 -- isolated PostgreSQL integration fixture for
 * bounded reconciliation scope and no-silent-truncation behavior.
 *
 * This file is intentionally excluded from the full integration suite. It
 * fails closed unless the isolated-target guard passes and all 17 canonical
 * application-data relations are empty.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

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
} from "../src/server/reconciliation/reconciliation.repository";

const EMPTY_ORDERED_PROJECTION_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const MAX_CANDIDATE_COUNT_PLUS_ONE = 5_001;

class Phase20kFixtureSafetyError extends Error {
  readonly code: string;

  constructor(code: string, details: readonly string[] = []) {
    super([code, ...details].join("|"));
    this.name = "Phase20kFixtureSafetyError";
    this.code = code;
  }
}

interface BulkFixtureIds {
  readonly conversionIds: readonly string[];
  readonly sourceKeys: readonly string[];
  readonly externalOrderIds: readonly string[];
  readonly occurredAt: string;
}

interface FixtureIds {
  readonly publisherId: string;
  readonly adminActorId: string;
  readonly trackingLinkId: string;
  readonly advertiserId: string;
  readonly campaignId: string;
  readonly offerId: string;
  readonly batchId: string;
  readonly csvRowAId: string;
  readonly csvRowBId: string;
  readonly ingestionAId: string;
  readonly ingestionBId: string;
  readonly conversionAId: string;
  readonly conversionBId: string;
  readonly boundedRunId: string;
  readonly boundedCandidateId: string;
  readonly boundedAuditEventId: string;
  readonly overflowRunId: string;
  readonly invalidWindowRunIds: readonly [string, string, string];
  readonly bulk: BulkFixtureIds;
}

interface ScenarioIdentifierPlans {
  readonly boundedDryRun: DryRunReconciliationIdentifierPlan;
  readonly overflowDryRun: DryRunReconciliationIdentifierPlan;
  readonly invalidWindowDryRuns: readonly DryRunReconciliationIdentifierPlan[];
  readonly boundedCommit: CommitReconciliationIdentifierPlan;
  readonly replayCommit: CommitReconciliationIdentifierPlan;
}

interface OverflowConversionProjection {
  readonly id: string;
  readonly network: string;
  readonly external_order_id: string;
  readonly publisher_id: string;
  readonly advertiser_id: string;
  readonly campaign_id: string;
  readonly offer_id: string;
  readonly tracking_link_id: string;
  readonly status: string;
  readonly order_amount: string;
  readonly network_commission: string;
  readonly user_cashback: string;
  readonly platform_profit: string;
  readonly occurred_at: string;
  readonly approved_at: string | null;
  readonly payable_at: string | null;
  readonly paid_at: string | null;
  readonly rejected_at: string | null;
  readonly rejected_reason: string | null;
  readonly source_conversion_key: string | null;
  readonly validation_status: string | null;
  readonly settlement_status: string | null;
  readonly ingestion_event_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

type OverflowProjectionField = keyof OverflowConversionProjection;

const OVERFLOW_PROJECTION_FIELDS = Object.freeze([
  "id",
  "network",
  "external_order_id",
  "publisher_id",
  "advertiser_id",
  "campaign_id",
  "offer_id",
  "tracking_link_id",
  "status",
  "order_amount",
  "network_commission",
  "user_cashback",
  "platform_profit",
  "occurred_at",
  "approved_at",
  "payable_at",
  "paid_at",
  "rejected_at",
  "rejected_reason",
  "source_conversion_key",
  "validation_status",
  "settlement_status",
  "ingestion_event_id",
  "created_at",
  "updated_at",
] as const satisfies readonly OverflowProjectionField[]);

interface BaselineCountRow {
  readonly auth_users: string;
  readonly profiles: string;
  readonly payout_accounts: string;
  readonly tracking_links: string;
  readonly clicks: string;
  readonly shopee_csv_import_batches: string;
  readonly shopee_csv_rows: string;
  readonly shopee_ingestion_events: string;
  readonly conversions: string;
  readonly advertisers: string;
  readonly campaigns: string;
  readonly offers: string;
  readonly cashback_policies: string;
  readonly shopee_purchase_intents: string;
  readonly reconciliation_audit_events: string;
  readonly reconciliation_runs: string;
  readonly reconciliation_run_candidates: string;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function indexedUuid(index: number): string {
  return `40000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function relationEvidence(count: string): {
  readonly count: string;
  readonly stableHash: string;
} {
  return {
    count,
    stableHash: count === "0" ? EMPTY_ORDERED_PROJECTION_SHA256 : "",
  };
}

async function captureBaselineSnapshot(
  admin: postgres.Sql,
): Promise<Phase20kBaselineSnapshot> {
  const rows = await admin<BaselineCountRow[]>`
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
  if (rows.length !== 1) {
    throw new Phase20kFixtureSafetyError("baseline_count_capture_failed");
  }
  const row = rows[0]!;
  return Object.freeze({
    "auth.users": relationEvidence(row.auth_users),
    "public.profiles": relationEvidence(row.profiles),
    "public.payout_accounts": relationEvidence(row.payout_accounts),
    "public.tracking_links": relationEvidence(row.tracking_links),
    "public.clicks": relationEvidence(row.clicks),
    "public.shopee_csv_import_batches": relationEvidence(
      row.shopee_csv_import_batches,
    ),
    "public.shopee_csv_rows": relationEvidence(row.shopee_csv_rows),
    "public.shopee_ingestion_events": relationEvidence(
      row.shopee_ingestion_events,
    ),
    "public.conversions": relationEvidence(row.conversions),
    "public.advertisers": relationEvidence(row.advertisers),
    "public.campaigns": relationEvidence(row.campaigns),
    "public.offers": relationEvidence(row.offers),
    "public.cashback_policies": relationEvidence(row.cashback_policies),
    "public.shopee_purchase_intents": relationEvidence(
      row.shopee_purchase_intents,
    ),
    "public.reconciliation_audit_events": relationEvidence(
      row.reconciliation_audit_events,
    ),
    "public.reconciliation_runs": relationEvidence(row.reconciliation_runs),
    "public.reconciliation_run_candidates": relationEvidence(
      row.reconciliation_run_candidates,
    ),
  });
}

function assertEmptyBaseline(
  snapshot: Phase20kBaselineSnapshot,
  phase: "preflight" | "post_cleanup",
): void {
  const result = validatePhase20kEmptyBaseline(snapshot, { strict: true });
  if (result.approved) return;

  const details = result.failures.map((failure) => {
    const count = snapshot[failure.relation]?.count ?? "missing";
    return `${failure.relation}:${failure.code}:count=${String(count)}`;
  });
  throw new Phase20kFixtureSafetyError(
    phase === "preflight"
      ? "empty_baseline_preflight_failed"
      : "isolated_target_contaminated_freeze_or_abandon",
    details,
  );
}

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

function registerKnownOwnership(
  input: Phase20kFixtureOwnershipManifest,
  ids: FixtureIds,
): Phase20kFixtureOwnershipManifest {
  let manifest = input;
  for (const id of [ids.adminActorId, ids.publisherId]) {
    manifest = ownRow(manifest, "auth.users", "id", id);
    manifest = ownRow(manifest, "public.profiles", "user_id", id);
  }
  manifest = ownRow(manifest, "public.advertisers", "id", ids.advertiserId);
  manifest = ownRow(manifest, "public.campaigns", "id", ids.campaignId);
  manifest = ownRow(manifest, "public.offers", "id", ids.offerId);
  manifest = ownRow(
    manifest,
    "public.cashback_policies",
    "offer_id",
    ids.offerId,
  );
  manifest = ownRow(
    manifest,
    "public.tracking_links",
    "id",
    ids.trackingLinkId,
  );
  manifest = ownRow(
    manifest,
    "public.shopee_csv_import_batches",
    "id",
    ids.batchId,
  );
  for (const id of [ids.csvRowAId, ids.csvRowBId]) {
    manifest = ownRow(manifest, "public.shopee_csv_rows", "id", id);
  }
  for (const id of [ids.ingestionAId, ids.ingestionBId]) {
    manifest = ownRow(manifest, "public.shopee_ingestion_events", "id", id);
  }
  for (const id of [
    ids.conversionAId,
    ids.conversionBId,
    ...ids.bulk.conversionIds,
  ]) {
    manifest = ownRow(manifest, "public.conversions", "id", id);
  }
  for (const id of [
    ids.boundedRunId,
    ids.overflowRunId,
    ...ids.invalidWindowRunIds,
  ]) {
    manifest = ownRow(manifest, "public.reconciliation_runs", "id", id);
  }
  manifest = ownRow(
    manifest,
    "public.reconciliation_run_candidates",
    "id",
    ids.boundedCandidateId,
  );
  return ownRow(
    manifest,
    "public.reconciliation_audit_events",
    "id",
    ids.boundedAuditEventId,
  );
}

function exactKeyValues(
  rows: Phase20kFixtureCleanupPlan["steps"][number]["rows"],
  column: string,
): readonly string[] {
  return rows.map((row) => {
    const value = row.primaryKey[column];
    if (!value) {
      throw new Phase20kFixtureSafetyError("invalid_exact_cleanup_plan");
    }
    return value;
  });
}

async function executeExactCleanupPlan(
  admin: postgres.Sql,
  cleanupPlan: Phase20kFixtureCleanupPlan,
): Promise<void> {
  for (const step of cleanupPlan.steps) {
    switch (step.relation) {
      case "public.reconciliation_audit_events":
        await admin`DELETE FROM public.reconciliation_audit_events WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.reconciliation_run_candidates":
        await admin`DELETE FROM public.reconciliation_run_candidates WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.reconciliation_runs":
        await admin`DELETE FROM public.reconciliation_runs WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.conversions":
        await admin`DELETE FROM public.conversions WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.shopee_ingestion_events":
        await admin`DELETE FROM public.shopee_ingestion_events WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.shopee_csv_rows":
        await admin`DELETE FROM public.shopee_csv_rows WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.shopee_csv_import_batches":
        await admin`DELETE FROM public.shopee_csv_import_batches WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.tracking_links":
        await admin`DELETE FROM public.tracking_links WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.cashback_policies":
        await admin`DELETE FROM public.cashback_policies WHERE offer_id IN ${admin(exactKeyValues(step.rows, "offer_id"))}`;
        break;
      case "public.offers":
        await admin`DELETE FROM public.offers WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.campaigns":
        await admin`DELETE FROM public.campaigns WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.advertisers":
        await admin`DELETE FROM public.advertisers WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.profiles":
        await admin`DELETE FROM public.profiles WHERE user_id IN ${admin(exactKeyValues(step.rows, "user_id"))}`;
        break;
      case "auth.users":
        await admin`DELETE FROM auth.users WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      default:
        throw new Phase20kFixtureSafetyError("unsupported_cleanup_relation", [
          step.relation,
        ]);
    }
  }
}

function zeroRemainingOwnership(): Readonly<
  Partial<Record<Phase20kBaselineRelation, number>>
> {
  return Object.freeze(
    Object.fromEntries(
      PHASE20K_EMPTY_BASELINE_RELATIONS.map((relation) => [relation, 0]),
    ),
  );
}

function nonSecretError(error: unknown, fallbackCode: string): Error {
  if (error instanceof Phase20kFixtureSafetyError) return error;
  if (error instanceof assert.AssertionError) {
    return new Phase20kFixtureSafetyError(fallbackCode, ["assertion_failed"]);
  }
  const candidateCode = (error as { readonly code?: unknown } | null)?.code;
  const safeCode =
    typeof candidateCode === "string" && /^[A-Za-z0-9_]{1,32}$/.test(candidateCode)
      ? candidateCode
      : "unknown";
  return new Phase20kFixtureSafetyError(fallbackCode, [safeCode]);
}

function requiredProjectionString(
  row: Record<string, unknown>,
  field: OverflowProjectionField,
  conversionId: string,
): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Phase20kFixtureSafetyError("overflow_snapshot_malformed", [
      conversionId,
      field,
    ]);
  }
  return value;
}

function nullableProjectionString(
  row: Record<string, unknown>,
  field: OverflowProjectionField,
  conversionId: string,
): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Phase20kFixtureSafetyError("overflow_snapshot_malformed", [
      conversionId,
      field,
    ]);
  }
  return value;
}

function validateOverflowProjectionRow(
  raw: Record<string, unknown>,
  expectedIds: ReadonlySet<string>,
): OverflowConversionProjection {
  const id = requiredProjectionString(raw, "id", "unknown_conversion");
  if (!expectedIds.has(id)) {
    throw new Phase20kFixtureSafetyError("overflow_snapshot_unexpected_id", [id]);
  }
  const row = Object.freeze({
    id,
    network: requiredProjectionString(raw, "network", id),
    external_order_id: requiredProjectionString(raw, "external_order_id", id),
    publisher_id: requiredProjectionString(raw, "publisher_id", id),
    advertiser_id: requiredProjectionString(raw, "advertiser_id", id),
    campaign_id: requiredProjectionString(raw, "campaign_id", id),
    offer_id: requiredProjectionString(raw, "offer_id", id),
    tracking_link_id: requiredProjectionString(raw, "tracking_link_id", id),
    status: requiredProjectionString(raw, "status", id),
    order_amount: requiredProjectionString(raw, "order_amount", id),
    network_commission: requiredProjectionString(
      raw,
      "network_commission",
      id,
    ),
    user_cashback: requiredProjectionString(raw, "user_cashback", id),
    platform_profit: requiredProjectionString(raw, "platform_profit", id),
    occurred_at: requiredProjectionString(raw, "occurred_at", id),
    approved_at: nullableProjectionString(raw, "approved_at", id),
    payable_at: nullableProjectionString(raw, "payable_at", id),
    paid_at: nullableProjectionString(raw, "paid_at", id),
    rejected_at: nullableProjectionString(raw, "rejected_at", id),
    rejected_reason: nullableProjectionString(raw, "rejected_reason", id),
    source_conversion_key: nullableProjectionString(
      raw,
      "source_conversion_key",
      id,
    ),
    validation_status: nullableProjectionString(raw, "validation_status", id),
    settlement_status: nullableProjectionString(raw, "settlement_status", id),
    ingestion_event_id: nullableProjectionString(raw, "ingestion_event_id", id),
    created_at: requiredProjectionString(raw, "created_at", id),
    updated_at: requiredProjectionString(raw, "updated_at", id),
  } satisfies OverflowConversionProjection);

  for (const field of [
    "order_amount",
    "network_commission",
    "user_cashback",
    "platform_profit",
  ] as const) {
    if (!/^-?[0-9]+$/.test(row[field])) {
      throw new Phase20kFixtureSafetyError("overflow_snapshot_malformed", [
        id,
        field,
      ]);
    }
  }
  for (const field of [
    "occurred_at",
    "approved_at",
    "payable_at",
    "paid_at",
    "rejected_at",
    "created_at",
    "updated_at",
  ] as const) {
    const value = row[field];
    if (value !== null && Number.isNaN(Date.parse(value))) {
      throw new Phase20kFixtureSafetyError("overflow_snapshot_malformed", [
        id,
        field,
      ]);
    }
  }
  if (
    row.network !== "shopee" ||
    !["pending", "approved", "payable", "paid", "rejected"].includes(
      row.status,
    ) ||
    row.source_conversion_key === null ||
    !/^[a-f0-9]{64}$/.test(row.source_conversion_key)
  ) {
    throw new Phase20kFixtureSafetyError("overflow_snapshot_malformed", [
      id,
      "business_identity",
    ]);
  }
  return row;
}

function assertExpectedOverflowFixtureRow(
  row: OverflowConversionProjection,
  ids: FixtureIds,
  index: number,
): void {
  const expectedValues: Readonly<Partial<OverflowConversionProjection>> = {
    id: ids.bulk.conversionIds[index],
    network: "shopee",
    external_order_id: ids.bulk.externalOrderIds[index],
    publisher_id: ids.publisherId,
    advertiser_id: ids.advertiserId,
    campaign_id: ids.campaignId,
    offer_id: ids.offerId,
    tracking_link_id: ids.trackingLinkId,
    status: "pending",
    order_amount: "10000",
    network_commission: "10000",
    user_cashback: "6000",
    platform_profit: "4000",
    approved_at: null,
    payable_at: null,
    paid_at: null,
    rejected_at: null,
    rejected_reason: null,
    source_conversion_key: ids.bulk.sourceKeys[index],
    validation_status: null,
    settlement_status: null,
    ingestion_event_id: null,
  };
  for (const [field, expected] of Object.entries(expectedValues) as Array<
    [OverflowProjectionField, string | null]
  >) {
    if (row[field] !== expected) {
      throw new Phase20kFixtureSafetyError("overflow_snapshot_fixture_mismatch", [
        row.id,
        field,
      ]);
    }
  }
  if (
    new Date(row.occurred_at).getTime() !==
    new Date(ids.bulk.occurredAt).getTime()
  ) {
    throw new Phase20kFixtureSafetyError("overflow_snapshot_fixture_mismatch", [
      row.id,
      "occurred_at",
    ]);
  }
}

async function captureOverflowSnapshot(
  admin: postgres.Sql,
  ids: FixtureIds,
): Promise<readonly OverflowConversionProjection[]> {
  const rawRows = await admin<Record<string, unknown>[]>`
    SELECT
      id::text AS id,
      network,
      external_order_id,
      publisher_id::text AS publisher_id,
      advertiser_id,
      campaign_id,
      offer_id,
      tracking_link_id,
      status,
      order_amount::text AS order_amount,
      network_commission::text AS network_commission,
      user_cashback::text AS user_cashback,
      platform_profit::text AS platform_profit,
      occurred_at::text AS occurred_at,
      approved_at::text AS approved_at,
      payable_at::text AS payable_at,
      paid_at::text AS paid_at,
      rejected_at::text AS rejected_at,
      rejected_reason,
      source_conversion_key,
      validation_status,
      settlement_status,
      ingestion_event_id::text AS ingestion_event_id,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM conversions
    WHERE id IN ${admin(ids.bulk.conversionIds)}
    ORDER BY id ASC
  `;
  if (rawRows.length !== MAX_CANDIDATE_COUNT_PLUS_ONE) {
    throw new Phase20kFixtureSafetyError("overflow_snapshot_row_count_mismatch");
  }

  const expectedIds = Object.freeze([...ids.bulk.conversionIds].sort());
  const expectedIdSet = new Set(expectedIds);
  const observedIds = new Set<string>();
  const rows: OverflowConversionProjection[] = [];
  for (let index = 0; index < rawRows.length; index += 1) {
    const row = validateOverflowProjectionRow(rawRows[index]!, expectedIdSet);
    if (observedIds.has(row.id)) {
      throw new Phase20kFixtureSafetyError("overflow_snapshot_duplicate_id", [
        row.id,
      ]);
    }
    observedIds.add(row.id);
    if (row.id !== expectedIds[index]) {
      throw new Phase20kFixtureSafetyError(
        "overflow_snapshot_ordered_set_mismatch",
        [row.id],
      );
    }
    assertExpectedOverflowFixtureRow(row, ids, index);
    rows.push(row);
  }
  if (observedIds.size !== expectedIdSet.size) {
    throw new Phase20kFixtureSafetyError("overflow_snapshot_exact_set_mismatch");
  }
  return Object.freeze(rows);
}

function assertOverflowSnapshotsEqual(
  before: readonly OverflowConversionProjection[],
  after: readonly OverflowConversionProjection[],
): void {
  if (before.length !== after.length) {
    throw new Phase20kFixtureSafetyError("overflow_snapshot_row_count_mismatch");
  }
  for (let index = 0; index < before.length; index += 1) {
    const beforeRow = before[index]!;
    const afterRow = after[index]!;
    if (beforeRow.id !== afterRow.id) {
      throw new Phase20kFixtureSafetyError(
        "overflow_snapshot_ordered_set_mismatch",
        [beforeRow.id],
      );
    }
    for (const field of OVERFLOW_PROJECTION_FIELDS) {
      if (beforeRow[field] !== afterRow[field]) {
        throw new Phase20kFixtureSafetyError(
          "overflow_snapshot_field_mismatch",
          [beforeRow.id, field],
        );
      }
    }
  }
}

async function assertNoBoundedOverflowCandidates(
  admin: postgres.Sql,
  ids: FixtureIds,
): Promise<void> {
  const rows = await admin<{ id: string; conversion_id: string }[]>`
    SELECT id::text AS id, conversion_id::text AS conversion_id
    FROM reconciliation_run_candidates
    WHERE run_id = ${ids.boundedRunId}::uuid
      AND conversion_id IN ${admin(ids.bulk.conversionIds)}
    ORDER BY conversion_id ASC, id ASC
  `;
  if (rows.length !== 0) {
    throw new Phase20kFixtureSafetyError(
      "unexpected_bounded_overflow_candidate",
      [String(rows[0]?.conversion_id ?? "unknown_conversion")],
    );
  }
}

async function assertNoBoundedOverflowAudits(
  admin: postgres.Sql,
  ids: FixtureIds,
): Promise<void> {
  const rows = await admin<{ id: string; conversion_id: string }[]>`
    SELECT id::text AS id, conversion_id::text AS conversion_id
    FROM reconciliation_audit_events
    WHERE reconciliation_run_id = ${ids.boundedRunId}::uuid
      AND conversion_id IN ${admin(ids.bulk.conversionIds)}
    ORDER BY conversion_id ASC, id ASC
  `;
  if (rows.length !== 0) {
    throw new Phase20kFixtureSafetyError(
      "unexpected_bounded_overflow_audit",
      [String(rows[0]?.conversion_id ?? "unknown_conversion")],
    );
  }
}

async function bootstrapCatalog(
  admin: postgres.Sql,
  runTag: string,
  ids: FixtureIds,
): Promise<void> {
  await admin`
    INSERT INTO auth.users (id, raw_user_meta_data)
    VALUES (
      ${ids.adminActorId}::uuid,
      ${admin.json({ full_name: runTag + " admin" })}::jsonb
    )
  `;
  await admin`
    INSERT INTO auth.users (id, raw_user_meta_data)
    VALUES (
      ${ids.publisherId}::uuid,
      ${admin.json({ full_name: runTag + " publisher" })}::jsonb
    )
  `;
  await admin`
    INSERT INTO advertisers (id, name, platform, status)
    VALUES (${ids.advertiserId}, ${runTag + " adv"}, 'shopee', 'active')
  `;
  await admin`
    INSERT INTO campaigns (id, advertiser_id, name, status)
    VALUES (${ids.campaignId}, ${ids.advertiserId}, ${runTag + " cmp"}, 'active')
  `;
  await admin`
    INSERT INTO offers (id, campaign_id, name, status)
    VALUES (${ids.offerId}, ${ids.campaignId}, ${runTag + " off"}, 'active')
  `;
  await admin`
    INSERT INTO cashback_policies (offer_id, cashback_share_bps)
    VALUES (${ids.offerId}, 6000)
  `;

  const safeTag = runTag.replace(/[^a-zA-Z0-9]/g, "");
  const networkSubId = "vaflnk" + sha256Hex(safeTag).slice(0, 24);
  await admin`
    INSERT INTO tracking_links (
      id, publisher_id, platform, destination_url,
      affiliate_url, network_sub_id, short_code, status,
      campaign_id, offer_id
    )
    VALUES (
      ${ids.trackingLinkId}::uuid,
      ${ids.publisherId}::uuid,
      'shopee',
      ${"https://shopee.vn/product/ci/" + runTag + "/1/1"},
      ${"https://affiliate.shopee.vn/?subid=" + networkSubId},
      ${networkSubId},
      ${("ci" + safeTag).slice(0, 24).padEnd(10, "0")},
      'active',
      ${ids.campaignId},
      ${ids.offerId}
    )
  `;
  await admin`
    INSERT INTO shopee_csv_import_batches (
      id, source_file_name, source_file_sha256,
      source_file_size_bytes, source_headers, parser_version,
      source, status, total_rows, completed_at
    )
    VALUES (
      ${ids.batchId}::uuid,
      ${runTag + ".csv"},
      ${sha256Hex(runTag + "-batch-sha256")},
      2,
      ${admin.json(["x"])}::jsonb,
      'phase-20k-4g1-test',
      'manual_csv',
      'completed',
      2,
      ${new Date().toISOString()}::timestamptz
    )
  `;
}

async function insertSourceEvidence(
  admin: postgres.Sql,
  ids: FixtureIds,
  sourceA: string,
  sourceB: string,
): Promise<void> {
  for (const row of [
    {
      csvRowId: ids.csvRowAId,
      sourceRowNumber: 2,
      sourceKey: sourceA,
      ingestionEventId: ids.ingestionAId,
    },
    {
      csvRowId: ids.csvRowBId,
      sourceRowNumber: 3,
      sourceKey: sourceB,
      ingestionEventId: ids.ingestionBId,
    },
  ]) {
    await admin`
      INSERT INTO shopee_csv_rows (
        id, batch_id, source, source_row_number,
        row_fingerprint_sha256, raw_row
      )
      VALUES (
        ${row.csvRowId}::uuid,
        ${ids.batchId}::uuid,
        'manual_csv',
        ${row.sourceRowNumber},
        ${row.sourceKey},
        ${admin.json({ ok: true })}::jsonb
      )
    `;
    await admin`
      INSERT INTO shopee_ingestion_events (
        id, network, source_event_id, payload_sha256,
        processing_status, processed_at, raw_reference
      )
      VALUES (
        ${row.ingestionEventId}::uuid,
        'shopee',
        ${"4g1-event-" + row.ingestionEventId},
        ${"a".repeat(64)},
        'succeeded',
        ${new Date().toISOString()}::timestamptz,
        ${admin.json({ ok: true })}::jsonb
      )
    `;
  }
}

async function insertPendingConversion(
  admin: postgres.Sql,
  ids: FixtureIds,
  input: {
    readonly id: string;
    readonly externalOrderId: string;
    readonly sourceKey: string;
    readonly ingestionEventId: string;
    readonly commission: number;
  },
): Promise<void> {
  const userCashback = Math.floor((input.commission * 6000) / 10000);
  const platformProfit = input.commission - userCashback;
  await admin`
    INSERT INTO conversions (
      id, network, external_order_id, publisher_id,
      advertiser_id, campaign_id, offer_id, tracking_link_id,
      status, source_conversion_key,
      order_amount, network_commission, user_cashback, platform_profit,
      occurred_at, approved_at, payable_at, paid_at,
      updated_at, validation_status, settlement_status, ingestion_event_id
    )
    VALUES (
      ${input.id}::uuid,
      'shopee',
      ${input.externalOrderId},
      ${ids.publisherId}::uuid,
      ${ids.advertiserId},
      ${ids.campaignId},
      ${ids.offerId},
      ${ids.trackingLinkId},
      'pending',
      ${input.sourceKey},
      ${input.commission},
      ${input.commission},
      ${userCashback},
      ${platformProfit},
      ${new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()}::timestamptz,
      ${null}::timestamptz,
      ${null}::timestamptz,
      ${null}::timestamptz,
      ${new Date().toISOString()}::timestamptz,
      'approved',
      'not_payable',
      ${input.ingestionEventId}::uuid
    )
  `;
}

async function insertBulkConversions(
  admin: postgres.Sql,
  ids: FixtureIds,
): Promise<void> {
  await admin`
    INSERT INTO conversions (
      id, network, external_order_id, publisher_id,
      advertiser_id, campaign_id, offer_id, tracking_link_id,
      status, source_conversion_key,
      order_amount, network_commission, user_cashback, platform_profit,
      occurred_at, approved_at, payable_at, paid_at,
      updated_at, validation_status, settlement_status, ingestion_event_id
    )
    SELECT
      fixture.id,
      'shopee'::text,
      fixture.external_order_id,
      ${ids.publisherId}::uuid,
      ${ids.advertiserId}::text,
      ${ids.campaignId}::text,
      ${ids.offerId}::text,
      ${ids.trackingLinkId}::text,
      'pending'::text,
      fixture.source_key,
      10000::bigint,
      10000::bigint,
      6000::bigint,
      4000::bigint,
      ${ids.bulk.occurredAt}::timestamptz,
      NULL::timestamptz,
      NULL::timestamptz,
      NULL::timestamptz,
      ${new Date().toISOString()}::timestamptz,
      NULL::text,
      NULL::text,
      NULL::uuid
    FROM unnest(
      ${admin.array([...ids.bulk.conversionIds])}::uuid[],
      ${admin.array([...ids.bulk.sourceKeys])}::text[],
      ${admin.array([...ids.bulk.externalOrderIds])}::text[]
    ) AS fixture(id, source_key, external_order_id)
  `;
}

async function runBoundedScopeScenario(
  admin: postgres.Sql,
  ids: FixtureIds,
  plans: ScenarioIdentifierPlans,
  sourceA: string,
): Promise<void> {
  const { dryRunReconciliationAsync, commitReconciliationAsync } = await import(
    "../src/server/reconciliation/reconciliation.repository"
  );
  const { buildReconciliationAdminActor } = await import(
    "../src/lib/reconciliation/actor"
  );
  const actor = buildReconciliationAdminActor({
    actorUserId: ids.adminActorId,
    actorRole: "admin",
  });

  const dry = await dryRunReconciliationAsync({
    actor,
    network: "shopee",
    sourceScope: { sourceConversionKeys: [sourceA] },
    identifierPlan: plans.boundedDryRun,
  });
  assert.equal(dry.reconciliationRunId, ids.boundedRunId);
  assert.equal(dry.scannedRowCount, 1);
  assert.equal(dry.decisions.length, 1);
  assert.equal(dry.decisions[0]?.conversionId, ids.conversionAId);
  assert.equal(dry.decisions[0]?.nextStatus, "approved");

  const runScopeRows = await admin`
    SELECT scope::text AS scope, scope_candidate_count, status
    FROM reconciliation_runs
    WHERE id = ${ids.boundedRunId}::uuid
  `;
  assert.equal(runScopeRows.length, 1);
  const persistedScope = JSON.parse(runScopeRows[0]!.scope as string);
  assert.deepEqual(Object.keys(persistedScope).sort(), ["sourceConversionKeys"]);
  assert.deepEqual(persistedScope.sourceConversionKeys, [sourceA]);
  assert.equal(Number(runScopeRows[0]!.scope_candidate_count), 1);
  assert.equal(runScopeRows[0]!.status, "draft");

  const candidateRows = await admin`
    SELECT id::text AS id, run_id::text AS run_id,
           conversion_id::text AS conversion_id,
           source_conversion_key
    FROM reconciliation_run_candidates
    WHERE id = ${ids.boundedCandidateId}::uuid
  `;
  assert.equal(candidateRows.length, 1);
  assert.equal(candidateRows[0]!.run_id, ids.boundedRunId);
  assert.equal(candidateRows[0]!.conversion_id, ids.conversionAId);
  assert.equal(candidateRows[0]!.source_conversion_key, sourceA);

  const outOfScopeCandidateCount = await admin`
    SELECT count(*)::int AS n
    FROM reconciliation_run_candidates
    WHERE run_id = ${ids.boundedRunId}::uuid
      AND conversion_id = ${ids.conversionBId}::uuid
  `;
  assert.equal(Number(outOfScopeCandidateCount[0]!.n), 0);
  await assertNoBoundedOverflowCandidates(admin, ids);

  const beforeA = await admin`
    SELECT status, paid_at, network_commission::text AS nc,
           user_cashback::text AS uc, platform_profit::text AS pp
    FROM conversions
    WHERE id = ${ids.conversionAId}::uuid
  `;
  const beforeB = await admin`
    SELECT status, paid_at, network_commission::text AS nc,
           user_cashback::text AS uc, platform_profit::text AS pp
    FROM conversions
    WHERE id = ${ids.conversionBId}::uuid
  `;
  assert.equal(beforeA[0]!.status, "pending");
  assert.equal(beforeB[0]!.status, "pending");
  assert.equal(beforeA[0]!.paid_at, null);
  assert.equal(beforeB[0]!.paid_at, null);

  const commit = await commitReconciliationAsync({
    actorUserId: ids.adminActorId,
    actorRole: "admin",
    reconciliationRunId: ids.boundedRunId,
    identifierPlan: plans.boundedCommit,
  });
  assert.equal(commit.applied.length, 1);
  assert.equal(commit.summary.applied, 1);
  assert.equal(commit.summary.skipped, 0);
  assert.equal(commit.applied[0]?.conversionId, ids.conversionAId);
  assert.equal(commit.applied[0]?.nextStatus, "approved");
  assert.equal(
    commit.applied.some((decision) => decision.conversionId === ids.conversionBId),
    false,
  );

  const afterA = await admin`
    SELECT status, paid_at, network_commission::text AS nc,
           user_cashback::text AS uc, platform_profit::text AS pp
    FROM conversions
    WHERE id = ${ids.conversionAId}::uuid
  `;
  const afterB = await admin`
    SELECT status, paid_at, network_commission::text AS nc,
           user_cashback::text AS uc, platform_profit::text AS pp
    FROM conversions
    WHERE id = ${ids.conversionBId}::uuid
  `;
  assert.equal(afterA[0]!.status, "approved");
  assert.equal(afterA[0]!.paid_at, null);
  assert.equal(
    Number(afterA[0]!.nc),
    Number(afterA[0]!.uc) + Number(afterA[0]!.pp),
  );
  assert.deepEqual(afterB[0], beforeB[0]);

  const auditA = await admin`
    SELECT id::text AS id, reconciliation_run_id::text AS run_id,
           run_candidate_id::text AS candidate_id,
           conversion_id::text AS conversion_id,
           previous_status, next_status
    FROM reconciliation_audit_events
    WHERE id = ${ids.boundedAuditEventId}::uuid
  `;
  assert.equal(auditA.length, 1);
  assert.equal(auditA[0]!.run_id, ids.boundedRunId);
  assert.equal(auditA[0]!.candidate_id, ids.boundedCandidateId);
  assert.equal(auditA[0]!.conversion_id, ids.conversionAId);
  assert.equal(auditA[0]!.previous_status, "pending");
  assert.equal(auditA[0]!.next_status, "approved");

  const auditB = await admin`
    SELECT count(*)::int AS n
    FROM reconciliation_audit_events
    WHERE reconciliation_run_id = ${ids.boundedRunId}::uuid
      AND conversion_id = ${ids.conversionBId}::uuid
  `;
  assert.equal(Number(auditB[0]!.n), 0);
  await assertNoBoundedOverflowCandidates(admin, ids);
  await assertNoBoundedOverflowAudits(admin, ids);

  const committedCandidate = await admin`
    SELECT processing_outcome, processing_reason_code
    FROM reconciliation_run_candidates
    WHERE id = ${ids.boundedCandidateId}::uuid
  `;
  const committedRun = await admin`
    SELECT status
    FROM reconciliation_runs
    WHERE id = ${ids.boundedRunId}::uuid
  `;
  assert.equal(committedCandidate[0]!.processing_outcome, "applied");
  assert.equal(
    committedCandidate[0]!.processing_reason_code,
    commit.applied[0]!.reasonCode,
  );
  assert.equal(committedRun[0]!.status, "committed");

  const replay = await commitReconciliationAsync({
    actorUserId: ids.adminActorId,
    actorRole: "admin",
    reconciliationRunId: ids.boundedRunId,
    identifierPlan: plans.replayCommit,
  });
  assert.equal(replay.applied.length, 0);
  assert.equal(replay.skipped.length, 1);
  assert.equal(replay.skipped[0]?.conversionId, ids.conversionAId);
  assert.equal(
    replay.skipped[0]?.reasonCode,
    "rejected_duplicate_conversion",
  );
  assert.equal(replay.skipped[0]?.idempotentReplay, true);

  const auditCountAfterReplay = await admin`
    SELECT count(*)::int AS n
    FROM reconciliation_audit_events
    WHERE id = ${ids.boundedAuditEventId}::uuid
      AND reconciliation_run_id = ${ids.boundedRunId}::uuid
      AND run_candidate_id = ${ids.boundedCandidateId}::uuid
  `;
  assert.equal(Number(auditCountAfterReplay[0]!.n), 1);
  await assertNoBoundedOverflowCandidates(admin, ids);
  await assertNoBoundedOverflowAudits(admin, ids);
}

async function runOverflowScenario(
  admin: postgres.Sql,
  ids: FixtureIds,
  plans: ScenarioIdentifierPlans,
): Promise<void> {
  await insertBulkConversions(admin, ids);
  const { dryRunReconciliationAsync } = await import(
    "../src/server/reconciliation/reconciliation.repository"
  );
  const { buildReconciliationAdminActor } = await import(
    "../src/lib/reconciliation/actor"
  );
  const actor = buildReconciliationAdminActor({
    actorUserId: ids.adminActorId,
    actorRole: "admin",
  });
  const occurredAtMs = new Date(ids.bulk.occurredAt).getTime();
  const beforeSnapshot = await captureOverflowSnapshot(admin, ids);
  await assertNoBoundedOverflowCandidates(admin, ids);
  await assertNoBoundedOverflowAudits(admin, ids);

  await assert.rejects(
    () =>
      dryRunReconciliationAsync({
        actor,
        network: "shopee",
        sourceScope: {
          occurredAfter: new Date(occurredAtMs - 60_000).toISOString(),
          occurredBefore: new Date(occurredAtMs + 60_000).toISOString(),
        },
        identifierPlan: plans.overflowDryRun,
      }),
    /exceeds MAX_CANDIDATE_COUNT|refusing to plan a partial run/,
  );

  const runCount = await admin`
    SELECT count(*)::int AS n
    FROM reconciliation_runs
    WHERE id = ${ids.overflowRunId}::uuid
  `;
  const candidateCount = await admin`
    SELECT count(*)::int AS n
    FROM reconciliation_run_candidates
    WHERE run_id = ${ids.overflowRunId}::uuid
  `;
  const overflowAuditCount = await admin`
    SELECT count(*)::int AS n
    FROM reconciliation_audit_events
    WHERE conversion_id IN ${admin(ids.bulk.conversionIds)}
  `;
  const afterSnapshot = await captureOverflowSnapshot(admin, ids);
  assert.equal(Number(runCount[0]!.n), 0);
  assert.equal(Number(candidateCount[0]!.n), 0);
  assert.equal(Number(overflowAuditCount[0]!.n), 0);
  assertOverflowSnapshotsEqual(beforeSnapshot, afterSnapshot);
  await assertNoBoundedOverflowCandidates(admin, ids);
  await assertNoBoundedOverflowAudits(admin, ids);
}

async function runInvalidWindowScenario(
  admin: postgres.Sql,
  ids: FixtureIds,
  plans: ScenarioIdentifierPlans,
): Promise<void> {
  const { dryRunReconciliationAsync } = await import(
    "../src/server/reconciliation/reconciliation.repository"
  );
  const { buildReconciliationAdminActor } = await import(
    "../src/lib/reconciliation/actor"
  );
  const actor = buildReconciliationAdminActor({
    actorUserId: ids.adminActorId,
    actorRole: "admin",
  });
  const invalidScopes = [
    {
      occurredAfter: "2026-07-01T00:00:00.000Z",
      occurredBefore: "2026-06-30T00:00:00.000Z",
    },
    {
      occurredAfter: "2026-01-01T00:00:00.000Z",
      occurredBefore: "2026-02-15T00:00:00.000Z",
    },
    {
      occurredAfter: "not-an-iso-timestamp",
      occurredBefore: "2026-07-02T00:00:00.000Z",
    },
  ] as const;

  for (let index = 0; index < invalidScopes.length; index += 1) {
    await assert.rejects(
      () =>
        dryRunReconciliationAsync({
          actor,
          network: "shopee",
          sourceScope: invalidScopes[index]!,
          identifierPlan: plans.invalidWindowDryRuns[index]!,
        }),
      /must be ISO timestamps|strictly less|scope window exceeds|MAX_SCOPE_WINDOW_MS/,
    );
  }

  const runCount = await admin`
    SELECT count(*)::int AS n
    FROM reconciliation_runs
    WHERE id IN ${admin(ids.invalidWindowRunIds)}
  `;
  const candidateCount = await admin`
    SELECT count(*)::int AS n
    FROM reconciliation_run_candidates
    WHERE run_id IN ${admin(ids.invalidWindowRunIds)}
  `;
  assert.equal(Number(runCount[0]!.n), 0);
  assert.equal(Number(candidateCount[0]!.n), 0);
}

test(
  "Phase 20K 4G1: bounded scope, no silent truncation, and invalid windows fail closed",
  async () => {
    const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
    const targetGuard = validatePhase20kIntegrationTarget({
      databaseUrl,
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

    const uniqueToken = randomUUID();
    const fixtureRunId = `phase20k-4g1-${uniqueToken}`;
    const runTag = `20k4g1-${uniqueToken.replace(/-/g, "")}`;
    const bulkOccurredAt = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const bulkIndexes = Array.from(
      { length: MAX_CANDIDATE_COUNT_PLUS_ONE },
      (_, index) => index + 1,
    );
    const ids: FixtureIds = {
      publisherId: randomUUID(),
      adminActorId: randomUUID(),
      trackingLinkId: randomUUID(),
      advertiserId: `ci-${runTag}-adv`,
      campaignId: `ci-${runTag}-cmp`,
      offerId: `ci-${runTag}-off`,
      batchId: randomUUID(),
      csvRowAId: randomUUID(),
      csvRowBId: randomUUID(),
      ingestionAId: randomUUID(),
      ingestionBId: randomUUID(),
      conversionAId: randomUUID(),
      conversionBId: randomUUID(),
      boundedRunId: randomUUID(),
      boundedCandidateId: randomUUID(),
      boundedAuditEventId: randomUUID(),
      overflowRunId: randomUUID(),
      invalidWindowRunIds: [randomUUID(), randomUUID(), randomUUID()],
      bulk: Object.freeze({
        conversionIds: Object.freeze(bulkIndexes.map(indexedUuid)),
        sourceKeys: Object.freeze(
          bulkIndexes.map((index) => sha256Hex(`${fixtureRunId}-bulk-${index}`)),
        ),
        externalOrderIds: Object.freeze(
          bulkIndexes.map((index) => `4g1-over-${index.toString().padStart(6, "0")}`),
        ),
        occurredAt: bulkOccurredAt,
      }),
    };
    const sourceA = sha256Hex(fixtureRunId + "-scope-a");
    const sourceB = sha256Hex(fixtureRunId + "-scope-b");
    const plans: ScenarioIdentifierPlans = Object.freeze({
      boundedDryRun: Object.freeze({
        reconciliationRunId: ids.boundedRunId,
        candidates: Object.freeze([
          Object.freeze({
            conversionId: ids.conversionAId,
            sourceConversionKey: sourceA,
            candidateId: ids.boundedCandidateId,
          }),
        ]),
      }),
      overflowDryRun: Object.freeze({
        reconciliationRunId: ids.overflowRunId,
        candidates: Object.freeze([]),
      }),
      invalidWindowDryRuns: Object.freeze(
        ids.invalidWindowRunIds.map((reconciliationRunId) =>
          Object.freeze({
            reconciliationRunId,
            candidates: Object.freeze([]),
          }),
        ),
      ),
      boundedCommit: Object.freeze({
        auditEvents: Object.freeze([
          Object.freeze({
            runCandidateId: ids.boundedCandidateId,
            auditEventId: ids.boundedAuditEventId,
          }),
        ]),
      }),
      replayCommit: Object.freeze({
        auditEvents: Object.freeze([]),
      }),
    });
    const sealedManifest = sealPhase20kFixtureOwnershipManifest(
      registerKnownOwnership(
        createPhase20kFixtureOwnershipManifest({
          runId: fixtureRunId,
          targetIdentityHash: targetGuard.identityHash,
          createdAt: new Date().toISOString(),
        }),
        ids,
      ),
    );

    let admin: postgres.Sql | undefined;
    let fixtureWritesStarted = false;
    let executionError: Error | undefined;
    let cleanupError: Error | undefined;

    try {
      admin = postgres(databaseUrl, { max: 4, prepare: false });
      const before = await captureBaselineSnapshot(admin);
      assertEmptyBaseline(before, "preflight");

      fixtureWritesStarted = true;
      await bootstrapCatalog(admin, runTag, ids);
      await insertSourceEvidence(admin, ids, sourceA, sourceB);
      await insertPendingConversion(admin, ids, {
        id: ids.conversionAId,
        externalOrderId: "4g1-A-" + ids.conversionAId.slice(-8),
        sourceKey: sourceA,
        ingestionEventId: ids.ingestionAId,
        commission: 12_000,
      });
      await insertPendingConversion(admin, ids, {
        id: ids.conversionBId,
        externalOrderId: "4g1-B-" + ids.conversionBId.slice(-8),
        sourceKey: sourceB,
        ingestionEventId: ids.ingestionBId,
        commission: 18_000,
      });

      await runBoundedScopeScenario(admin, ids, plans, sourceA);
      await runOverflowScenario(admin, ids, plans);
      await runInvalidWindowScenario(admin, ids, plans);
    } catch (error) {
      executionError = nonSecretError(error, "fixture_execution_failed");
    } finally {
      if (fixtureWritesStarted && admin) {
        try {
          const planned = planPhase20kFixtureCleanup(sealedManifest);
          await executeExactCleanupPlan(admin, planned.cleanupPlan);
          const afterCleanup = await captureBaselineSnapshot(admin);
          assertEmptyBaseline(afterCleanup, "post_cleanup");
          const verifiedManifest = verifyPhase20kFixtureCleanup(
            planned.manifest,
            zeroRemainingOwnership(),
          );
          assert.equal(verifiedManifest.lifecycle, "verified");
        } catch (error) {
          cleanupError = nonSecretError(
            error,
            "cleanup_failed_freeze_or_abandon_isolated_target",
          );
        }
      }

      if (admin) {
        try {
          await admin.end({ timeout: 5 });
        } catch (error) {
          const closeError = nonSecretError(
            error,
            "database_client_close_failed",
          );
          cleanupError = cleanupError
            ? new AggregateError(
                [cleanupError, closeError],
                "phase20k_cleanup_and_close_failed",
              )
            : closeError;
        }
      }

      const sharedClient = (
        globalThis as {
          __vaffiliatePostgresClient?: {
            end: (options?: { timeout?: number }) => Promise<void>;
          };
        }
      ).__vaffiliatePostgresClient;
      if (typeof sharedClient?.end === "function") {
        try {
          await sharedClient.end({ timeout: 5 });
        } catch (error) {
          const closeError = nonSecretError(
            error,
            "shared_database_client_close_failed",
          );
          cleanupError = cleanupError
            ? new AggregateError(
                [cleanupError, closeError],
                "phase20k_cleanup_and_close_failed",
              )
            : closeError;
        }
      }
    }

    if (executionError && cleanupError) {
      throw new AggregateError(
        [executionError, cleanupError],
        "phase20k_execution_and_cleanup_failed",
      );
    }
    if (cleanupError) throw cleanupError;
    if (executionError) throw executionError;
  },
);
