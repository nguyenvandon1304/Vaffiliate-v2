/**
 * Phase 20K checkpoint 4F1C -- isolated PostgreSQL integration test
 * for the 4F1B `approved -> payable` hard-block.
 *
 * This file is intentionally not part of the full integration suite.
 * It fails closed unless the approved isolated-target guard passes and
 * all 17 application-data relations match the canonical empty baseline.
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

class Phase20kFixtureSafetyError extends Error {
  readonly code: string;

  constructor(code: string, details: readonly string[] = []) {
    super([code, ...details].join("|"));
    this.name = "Phase20kFixtureSafetyError";
    this.code = code;
  }
}

interface FixtureIds {
  readonly publisherId: string;
  readonly adminActorId: string;
  readonly trackingLinkId: string;
  readonly advertiserId: string;
  readonly campaignId: string;
  readonly offerId: string;
  readonly batchId: string;
  readonly csvRowId: string;
  readonly ingestionEventId: string;
  readonly conversionId: string;
  readonly dryRunId: string;
  readonly legacyRunId: string;
  readonly legacyCandidateId: string;
}

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

function sourceKeyFromUuid(id: string): string {
  const hex = id.replace(/-/g, "");
  return (hex + hex).slice(0, 64);
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

function registerKnownOwnership(
  input: Phase20kFixtureOwnershipManifest,
  ids: FixtureIds,
): Phase20kFixtureOwnershipManifest {
  let manifest = input;
  for (const id of [ids.adminActorId, ids.publisherId]) {
    manifest = addPhase20kOwnedFixtureRow(manifest, "auth.users", {
      primaryKey: { id },
    });
    manifest = addPhase20kOwnedFixtureRow(manifest, "public.profiles", {
      primaryKey: { user_id: id },
    });
  }
  manifest = addPhase20kOwnedFixtureRow(manifest, "public.advertisers", {
    primaryKey: { id: ids.advertiserId },
  });
  manifest = addPhase20kOwnedFixtureRow(manifest, "public.campaigns", {
    primaryKey: { id: ids.campaignId },
  });
  manifest = addPhase20kOwnedFixtureRow(manifest, "public.offers", {
    primaryKey: { id: ids.offerId },
  });
  manifest = addPhase20kOwnedFixtureRow(
    manifest,
    "public.cashback_policies",
    { primaryKey: { offer_id: ids.offerId } },
  );
  manifest = addPhase20kOwnedFixtureRow(manifest, "public.tracking_links", {
    primaryKey: { id: ids.trackingLinkId },
  });
  manifest = addPhase20kOwnedFixtureRow(
    manifest,
    "public.shopee_csv_import_batches",
    { primaryKey: { id: ids.batchId } },
  );
  manifest = addPhase20kOwnedFixtureRow(manifest, "public.shopee_csv_rows", {
    primaryKey: { id: ids.csvRowId },
  });
  manifest = addPhase20kOwnedFixtureRow(
    manifest,
    "public.shopee_ingestion_events",
    { primaryKey: { id: ids.ingestionEventId } },
  );
  manifest = addPhase20kOwnedFixtureRow(manifest, "public.conversions", {
    primaryKey: { id: ids.conversionId },
  });
  manifest = addPhase20kOwnedFixtureRow(
    manifest,
    "public.reconciliation_runs",
    { primaryKey: { id: ids.dryRunId } },
  );
  manifest = addPhase20kOwnedFixtureRow(
    manifest,
    "public.reconciliation_runs",
    { primaryKey: { id: ids.legacyRunId } },
  );
  manifest = addPhase20kOwnedFixtureRow(
    manifest,
    "public.reconciliation_run_candidates",
    { primaryKey: { id: ids.legacyCandidateId } },
  );
  return manifest;
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
      case "public.shopee_purchase_intents":
        await admin`DELETE FROM public.shopee_purchase_intents WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.clicks":
        await admin`DELETE FROM public.clicks WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
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
      case "public.payout_accounts":
        await admin`DELETE FROM public.payout_accounts WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      case "public.profiles":
        await admin`DELETE FROM public.profiles WHERE user_id IN ${admin(exactKeyValues(step.rows, "user_id"))}`;
        break;
      case "auth.users":
        await admin`DELETE FROM auth.users WHERE id IN ${admin(exactKeyValues(step.rows, "id"))}`;
        break;
      default: {
        const unreachable: never = step.relation;
        throw new Phase20kFixtureSafetyError("unknown_cleanup_relation", [
          String(unreachable),
        ]);
      }
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
  if (error instanceof Phase20kFixtureSafetyError) {
    return error;
  }
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
}

async function insertSourceEvidence(
  admin: postgres.Sql,
  runTag: string,
  ids: FixtureIds,
  sourceKey: string,
): Promise<void> {
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
      1,
      ${admin.json(["x"])}::jsonb,
      'phase-20k-test',
      'manual_csv',
      'completed',
      1,
      ${new Date().toISOString()}::timestamptz
    )
  `;

  const sourceRowNumber =
    2 + (parseInt(sha256Hex(ids.ingestionEventId).slice(0, 8), 16) % 999_998);
  await admin`
    INSERT INTO shopee_csv_rows (
      id, batch_id, source, source_row_number, row_fingerprint_sha256, raw_row
    )
    VALUES (
      ${ids.csvRowId}::uuid,
      ${ids.batchId}::uuid,
      'manual_csv',
      ${sourceRowNumber},
      ${sourceKey},
      ${admin.json({ ok: true })}::jsonb
    )
  `;

  await admin`
    INSERT INTO shopee_ingestion_events (
      id, network, source_event_id, payload_sha256,
      processing_status, processed_at, raw_reference
    )
    VALUES (
      ${ids.ingestionEventId}::uuid,
      'shopee',
      ${"ci-" + runTag + "-event-" + ids.ingestionEventId},
      ${"a".repeat(64)},
      'succeeded',
      ${new Date().toISOString()}::timestamptz,
      ${admin.json({ ok: true })}::jsonb
    )
  `;
}

async function insertApprovedConversionWithPayable(
  admin: postgres.Sql,
  ids: FixtureIds,
  sourceKey: string,
  commission: number,
): Promise<void> {
  const userCashback = Math.floor((commission * 6000) / 10000);
  const platformProfit = commission - userCashback;
  const now = Date.now();
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
      ${ids.conversionId}::uuid,
      'shopee',
      ${"4f1c-" + ids.conversionId.slice(-8)},
      ${ids.publisherId}::uuid,
      ${ids.advertiserId},
      ${ids.campaignId},
      ${ids.offerId},
      ${ids.trackingLinkId},
      'approved',
      ${sourceKey},
      ${commission},
      ${commission},
      ${userCashback},
      ${platformProfit},
      ${new Date(now - 3 * 60 * 60 * 1000).toISOString()}::timestamptz,
      ${new Date(now - 2 * 60 * 60 * 1000).toISOString()}::timestamptz,
      ${null}::timestamptz,
      ${null}::timestamptz,
      ${new Date(now).toISOString()}::timestamptz,
      'approved',
      'payable',
      ${ids.ingestionEventId}::uuid
    )
  `;
}

async function dryRun(input: {
  readonly actorUserId: string;
  readonly sourceKey: string;
  readonly identifierPlan: DryRunReconciliationIdentifierPlan;
}): Promise<{
  readonly reconciliationRunId: string;
  readonly decisionsCount: number;
  readonly scannedRowCount: number;
  readonly skipped: ReadonlyArray<{
    readonly conversionId: string;
    readonly reasonCode: string;
  }>;
}> {
  const { dryRunReconciliationAsync } = await import(
    "../src/server/reconciliation/reconciliation.repository"
  );
  const { buildReconciliationAdminActor } = await import(
    "../src/lib/reconciliation/actor"
  );
  const result = await dryRunReconciliationAsync({
    actor: buildReconciliationAdminActor({
      actorUserId: input.actorUserId,
      actorRole: "admin",
    }),
    network: "shopee",
    sourceScope: { sourceConversionKeys: [input.sourceKey] },
    identifierPlan: input.identifierPlan,
  });
  return {
    reconciliationRunId: result.reconciliationRunId,
    decisionsCount: result.decisions.length,
    scannedRowCount: result.scannedRowCount,
    skipped: result.skipped.map((item) => ({
      conversionId: item.conversionId,
      reasonCode: item.reasonCode,
    })),
  };
}

async function commitRun(input: {
  readonly actorUserId: string;
  readonly reconciliationRunId: string;
  readonly identifierPlan: CommitReconciliationIdentifierPlan;
}): Promise<{
  readonly applied: ReadonlyArray<{ readonly conversionId: string }>;
  readonly skipped: ReadonlyArray<{
    readonly conversionId: string;
    readonly reasonCode: string;
  }>;
}> {
  const { commitReconciliationAsync } = await import(
    "../src/server/reconciliation/reconciliation.repository"
  );
  const result = await commitReconciliationAsync({
    actorUserId: input.actorUserId,
    actorRole: "admin",
    reconciliationRunId: input.reconciliationRunId,
    identifierPlan: input.identifierPlan,
  });
  return {
    applied: result.applied.map((item) => ({
      conversionId: item.conversionId,
    })),
    skipped: result.skipped.map((item) => ({
      conversionId: item.conversionId,
      reasonCode: item.reasonCode,
    })),
  };
}

test(
  "Phase 20K 4F1C: unverified payable value is blocked at dry-run and commit (hard-block + schema-valid outcome)",
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
    const fixtureRunId = `phase20k-4f1c-${uniqueToken}`;
    const runTag = `20k4f1c-${uniqueToken.replace(/-/g, "")}`;
    const ids: FixtureIds = {
      publisherId: randomUUID(),
      adminActorId: randomUUID(),
      trackingLinkId: randomUUID(),
      advertiserId: `ci-${runTag}-adv`,
      campaignId: `ci-${runTag}-cmp`,
      offerId: `ci-${runTag}-off`,
      batchId:
        "00000000-0000-4000-8000-" +
        sha256Hex(runTag + "-batch").slice(0, 12),
      csvRowId: randomUUID(),
      ingestionEventId: randomUUID(),
      conversionId: randomUUID(),
      dryRunId: randomUUID(),
      legacyRunId: randomUUID(),
      legacyCandidateId: randomUUID(),
    };
    const sourceKey = sourceKeyFromUuid(ids.conversionId);
    const commission = 24_000;
    const dryRunIdentifierPlan: DryRunReconciliationIdentifierPlan =
      Object.freeze({
        reconciliationRunId: ids.dryRunId,
        candidates: Object.freeze([]),
      });
    const commitIdentifierPlan: CommitReconciliationIdentifierPlan =
      Object.freeze({
        auditEvents: Object.freeze([]),
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
      await insertSourceEvidence(admin, runTag, ids, sourceKey);
      await insertApprovedConversionWithPayable(
        admin,
        ids,
        sourceKey,
        commission,
      );

      const dry = await dryRun({
        actorUserId: ids.adminActorId,
        sourceKey,
        identifierPlan: dryRunIdentifierPlan,
      });
      if (dry.reconciliationRunId !== ids.dryRunId) {
        throw new Phase20kFixtureSafetyError(
          "dry_run_identifier_result_mismatch",
        );
      }
      assert.equal(dry.scannedRowCount, 1);
      assert.equal(dry.decisionsCount, 0);
      assert.equal(
        dry.skipped.some(
          (item) =>
            item.conversionId === ids.conversionId &&
            item.reasonCode === "rejected_unverified_settlement_evidence",
        ),
        true,
      );

      const dryCandidates = await admin`
        SELECT id
        FROM reconciliation_run_candidates
        WHERE run_id = ${ids.dryRunId}::uuid
          AND conversion_id = ${ids.conversionId}::uuid
      `;
      assert.equal(
        dryCandidates.length,
        0,
        "Phase 20K 4F1C: dry-run must not plan a payable candidate for unverified settlement evidence",
      );
      const dryRunRows = await admin`
        SELECT id
        FROM reconciliation_runs
        WHERE id = ${ids.dryRunId}::uuid
      `;
      assert.equal(dryRunRows.length, 1);

      const afterDry = await admin`
        SELECT status, payable_at, paid_at, settlement_status
        FROM conversions
        WHERE id = ${ids.conversionId}::uuid
      `;
      assert.equal(afterDry[0]!.status, "approved");
      assert.equal(afterDry[0]!.payable_at, null);
      assert.equal(afterDry[0]!.paid_at, null);
      assert.equal(afterDry[0]!.settlement_status, "payable");

      const expectedFingerprint = sha256Hex(
        [
          "shopee",
          "approved",
          "approved",
          "payable",
          "confirmed_eligible",
          "unique",
          ids.conversionId,
          sourceKey,
          ids.ingestionEventId,
          "approved",
          String(commission),
        ].join("|"),
      );
      await admin`
        INSERT INTO reconciliation_runs (
          id, network, status, created_by_user_id, created_by_role,
          policy_version, candidate_fingerprint, created_at
        )
        VALUES (
          ${ids.legacyRunId}::uuid,
          'shopee',
          'draft',
          ${ids.adminActorId}::uuid,
          'admin',
          1,
          ${sha256Hex("4f1c-" + ids.legacyRunId)},
          ${new Date().toISOString()}::timestamptz
        )
      `;
      await admin`
        INSERT INTO reconciliation_run_candidates (
          id, run_id, conversion_id, network,
          expected_previous_status, intended_next_status,
          planned_reason_code,
          planned_money_network_commission,
          planned_money_user_cashback,
          planned_money_platform_profit,
          planned_idempotency_key,
          provenance_fingerprint,
          source_conversion_key,
          processing_outcome
        )
        VALUES (
          ${ids.legacyCandidateId}::uuid,
          ${ids.legacyRunId}::uuid,
          ${ids.conversionId}::uuid,
          'shopee',
          'approved',
          'payable',
          'approved_eligible_by_match',
          ${commission},
          ${Math.floor(commission * 0.6)},
          ${commission - Math.floor(commission * 0.6)},
          ${sha256Hex("idem-" + ids.legacyCandidateId)},
          ${expectedFingerprint},
          ${sourceKey},
          'pending'
        )
      `;

      const commit = await commitRun({
        actorUserId: ids.adminActorId,
        reconciliationRunId: ids.legacyRunId,
        identifierPlan: commitIdentifierPlan,
      });

      assert.equal(
        commit.applied.length,
        0,
        "Phase 20K 4F1C: commit must not apply an unverified payable candidate",
      );
      const skip = commit.skipped.find(
        (item) => item.conversionId === ids.conversionId,
      );
      assert.ok(skip, "Phase 20K 4F1C: blocked candidate must be reported");
      assert.equal(
        skip.reasonCode,
        "rejected_unverified_settlement_evidence",
      );

      const afterCommit = await admin`
        SELECT status, payable_at, paid_at,
               network_commission::text AS nc,
               user_cashback::text AS uc,
               platform_profit::text AS pp
        FROM conversions
        WHERE id = ${ids.conversionId}::uuid
      `;
      assert.equal(afterCommit[0]!.status, "approved");
      assert.equal(afterCommit[0]!.payable_at, null);
      assert.equal(afterCommit[0]!.paid_at, null);
      assert.equal(
        Number(afterCommit[0]!.nc),
        Number(afterCommit[0]!.uc) + Number(afterCommit[0]!.pp),
      );
      assert.equal(Number(afterCommit[0]!.nc), commission);

      const auditCount = await admin`
        SELECT
          (SELECT count(*)::int
           FROM reconciliation_audit_events
           WHERE reconciliation_run_id = ${ids.legacyRunId}::uuid) AS run_count,
          (SELECT count(*)::int
           FROM reconciliation_audit_events
           WHERE run_candidate_id = ${ids.legacyCandidateId}::uuid) AS candidate_count,
          (SELECT count(*)::int
           FROM reconciliation_audit_events
           WHERE reconciliation_run_id = ${ids.legacyRunId}::uuid
             AND conversion_id = ${ids.conversionId}::uuid) AS conversion_count
      `;
      assert.equal(Number(auditCount[0]!.run_count), 0);
      assert.equal(Number(auditCount[0]!.candidate_count), 0);
      assert.equal(Number(auditCount[0]!.conversion_count), 0);

      const candidateRow = await admin`
        SELECT processing_outcome, processing_reason_code,
               processing_completed_at
        FROM reconciliation_run_candidates
        WHERE id = ${ids.legacyCandidateId}::uuid
      `;
      assert.equal(candidateRow[0]!.processing_outcome, "skipped/blocked");
      assert.equal(
        candidateRow[0]!.processing_reason_code,
        "rejected_unverified_settlement_evidence",
      );
      assert.notEqual(candidateRow[0]!.processing_completed_at, null);

      const runRow = await admin`
        SELECT status
        FROM reconciliation_runs
        WHERE id = ${ids.legacyRunId}::uuid
      `;
      assert.equal(runRow[0]!.status, "committed");
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
