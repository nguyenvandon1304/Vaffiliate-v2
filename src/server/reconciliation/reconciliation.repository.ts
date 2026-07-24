/**
 * Phase 20K follow-up 2 -- reconciliation repository (server-only).
 *
 * Layered on top of the Phase 20H.6 attribution ingestion. The
 * reconciliation repository consumes the canonical `conversions`
 * rows that Phase 20H.6 / 20J already produced. It does NOT touch
 * `shopee_csv_rows` directly; those rows are immutable source-of-
 * truth and are out of scope for Phase 20K.
 *
 * Architecture (Phase 20K follow-up 2):
 *
 *   1. dry-run creates a server-side `reconciliation_runs` row
 *      plus a `reconciliation_run_candidates` row per candidate.
 *      The run id is the ONLY identity the commit accepts.
 *   2. commit must be invoked with `reconciliationRunId`. It
 *      reloads ONLY candidates belonging to that run and applies
 *      them inside a single Drizzle transaction.
 *   3. The repository never UPDATEs every conversion whose status
 *      is in `pending | approved | payable` -- it always works off
 *      the candidate set persisted at planning time.
 *   4. Every applied audit row carries `run_candidate_id`. The
 *      partial UNIQUE index on `reconciliation_audit_events
 *      .run_candidate_id` plus the UNIQUE index on
 *      `reconciliation_run_candidates(run_id, conversion_id)`
 *      together enforce "same run + same candidate produces at
 *      most one applied audit event".
 *   5. Conflict handling: the repository uses
 *      `INSERT ... ON CONFLICT DO NOTHING RETURNING id` for the
 *      audit-event claim. A blank `RETURNING` result means the
 *      candidate has already been applied (same run replay) and
 *      the conversion is NOT touched.
 *   6. Source-evidence provenance: the snapshot the planner
 *      consumes carries `validation_status`, `settlement_status`,
 *      `ingestion_event_id`, `source_conversion_key`, and the
 *      source-status stamp from the ingestion layer. The pure
 *      `source-evidence.ts` mapper refuses to advance a row whose
 *      provenance is missing or inconsistent.
 *   7. No write to wallet / ledger / payout tables. No delete of
 *      source / staging rows. No `nextStatus = paid`.
 *   8. Actor is derived from `requireAdmin()` only -- never from
 *      FormData.
 */
import "server-only";

import { and, eq, sql, type SQL } from "drizzle-orm";
import { drizzle as drizzleClient } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { ConversionStatus } from "@/types/affiliate";

import { recordAdminAction } from "@/lib/auth/audit-log";
import {
  buildReconciliationAdminActor,
  type ReconciliationActor,
} from "@/lib/reconciliation/actor";
import {
  conversions,
  reconciliationAuditEvents,
  reconciliationRunCandidates,
  reconciliationRuns,
} from "@/db/schema";

import { assertCanTransition } from "@/lib/reconciliation/state-machine";
import {
  buildReconciliationIdempotencyKey,
  RECONCILIATION_POLICY_VERSION,
} from "@/lib/reconciliation/idempotency";
import {
  planRunScope,
  type RunScopeCandidateInput,
  type RunScopePlannedApply,
  type RunScopePlannedReject,
} from "@/lib/reconciliation/run-scope";
import {
  ALLOWED_RECONCILIATION_NETWORKS,
  type ReconciliationNetwork,
  type SourceEvidenceSnapshot,
} from "@/lib/reconciliation/source-evidence";
import {
  compareLiveEvidenceAgainstPlan,
  isCommitRevalidationStale,
  staleReasonFor,
  type CommitLiveEvidence,
  type CommitPlanSnapshot,
} from "@/lib/reconciliation/commit-revalidation";
import {
  assertCandidateIdentifierResults,
  assertReconciliationIdentifierResult,
  ReconciliationIdentifierPlanError,
  resolveCommitReconciliationIdentifierPlan,
  resolveDryRunReconciliationIdentifierPlan,
  validateCommitReconciliationIdentifierPlan,
  validateDryRunReconciliationIdentifierPlan,
  type CommitReconciliationAuditIdentifier,
  type CommitReconciliationIdentifierPlan,
  type DryRunReconciliationIdentifierPlan,
  type ReconciliationCandidateIdentifier,
  type ValidatedCommitReconciliationIdentifierPlan,
  type ValidatedDryRunReconciliationIdentifierPlan,
} from "./reconciliation.repository.test-helpers";

type ReconciliationDatabase = typeof import("@/db/client").db;

async function loadDefaultDatabase(): Promise<ReconciliationDatabase> {
  return (await import("@/db/client")).db;
}

export type {
  CommitReconciliationAuditIdentifier,
  CommitReconciliationIdentifierPlan,
  DryRunReconciliationIdentifierPlan,
  ReconciliationCandidateIdentifier,
} from "./reconciliation.repository.test-helpers";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ConversionDbRow {
  id: string;
  network: string;
  source_conversion_key: string | null;
  status: string;
  network_commission: string | number;
  cashback_share_bps_snapshot: string | number | null;
  user_cashback: string | number;
  platform_profit: string | number;
  occurred_at: Date | string;
  ingestion_event_id: string | null;
  advertiser_id: string;
  campaign_id: string;
  offer_id: string;
  tracking_link_id: string;
  publisher_id: string;
  validation_status: string | null;
  settlement_status: string | null;
}

function parseStatus(value: string): ConversionStatus {
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

function parseCommission(value: string | number | null): number {
  if (value === null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(
      "reconciliation.repository: commission is not an integer VND amount",
    );
  }
  return parsed;
}

function parseCashbackShareBps(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}

function toRows(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  const inner = (raw as { rows?: unknown[] }).rows;
  return Array.isArray(inner)
    ? (inner as Array<Record<string, unknown>>)
    : [];
}

interface SourceEvidenceDbFields {
  readonly sourceStatus: SourceEvidenceSnapshot["sourceStatus"];
  /**
   * Persisted attribution link-kind. Phase 20K checkpoint 4A2B
   * contract:
   *
   *   - `"unique"`             -- attribution is provably unique:
   *                              one source conversion row per
   *                              `(network, external_order_id)`
   *                              AND one per
   *                              `(network, source_conversion_key)`.
   *   - `"missing"`            -- publisher or tracking-link row is
   *                              absent.
   *   - `"owner_mismatch"`     -- tracking_link row exists but its
   *                              `publisher_id` differs from the
   *                              conversion's `publisher_id`.
   *   - `"source_key_collision"` --
   *                              same
   *                              `(network, source_conversion_key)`
   *                              appears on more than one conversion
   *                              row inside the scoped set
   *                              (schema-enforced unique violated).
   *   - `"order_id_collision"` --
   *                              same
   *                              `(network, external_order_id)`
   *                              appears on more than one conversion
   *                              row inside the scoped set
   *                              (schema-enforced unique violated).
   *
   * Only `"unique"` opens the apply gate in the mapper; everything
   * else is fail-closed.
   */
  readonly persistedLinkKind:
    | "unique"
    | "missing"
    | "owner_mismatch"
    | "source_key_collision"
    | "order_id_collision";
  readonly publisherPresent: boolean;
  readonly trackingLinkPresent: boolean;
  /**
   * The shopee_csv_rows.source value, when a matching CSV row
   * exists. Carried so the classifier can tell manual_csv /
   * addlivetag_api / official_shopee_api apart. Null when no CSV
   * row joined.
   */
  readonly csvSource: "manual_csv" | "addlivetag_api" | "official_shopee_api" | null;
  /**
   * The network read from the `conversions` row. Exposed on the
   * snapshot for diagnostic consumers; the mapper already has the
   * network on the source row itself.
   */
  readonly network: string;
}

/**
 * Look up the persisted source-evidence stamp for a batch of
 * conversion ids.
 *
 * Phase 20K checkpoint 4A2B -- the persisted attribution
 * uniqueness boundary is the source-conversion / source-order
 * identity, NOT the (publisher, tracking_link, network) tuple:
 *
 *   - `(network, external_order_id)` is unique-constrained in
 *     `conversions` (schema).
 *   - `(network, source_conversion_key)` is partially
 *     unique-constrained in `conversions` (when non-null).
 *   - A single (publisher, tracking_link, network) pair may
 *     produce any number of legitimate distinct orders; the
 *     loader never treats "many orders sharing one link" as
 *     ambiguous.
 *
 * The corrected loader reads the two schema-enforced unique
 * keys:
 *
 *   - `external_order_collision_count` -- count of rows in the
 *     scoped `conversions` set sharing the same
 *     `(network, external_order_id)`. >= 2 violates the schema
 *     UNIQUE constraint and is classified as
 *     `"order_id_collision"`.
 *
 *   - `source_conversion_key_collision_count` -- count of rows
 *     sharing the same `(network, source_conversion_key)` in the
 *     scoped set. >= 2 violates the partial UNIQUE and is
 *     classified as `"source_key_collision"`.
 *
 * The loader also exposes `tracking_link_publisher_match` so the
 * classifier can return `"owner_mismatch"` (instead of the
 * previously misleading `"duplicate"`) when the link exists but
 * belongs to a different publisher.
 *
 * Finally the joined `csv.source` is exposed so the classifier
 * can distinguish `manual_csv` from `addlivetag_api` and from
 * `official_shopee_api`.
 */
async function executeSourceEvidenceQuery(
  exec: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
  conversionIds: ReadonlyArray<string>,
): Promise<Array<Record<string, unknown>>> {
  if (conversionIds.length === 0) return [];
  const idArray =
    "ARRAY[" +
    conversionIds.map((id) => "'" + id + "'::uuid").join(",") +
    "]";
  const raw = await exec.execute(sql`
    SELECT
      c.id AS conversion_id,
      c.network AS network,
      c.external_order_id AS external_order_id,
      c.source_conversion_key AS source_conversion_key,
      c.publisher_id AS publisher_id,
      c.tracking_link_id AS tracking_link_id,
      c.validation_status AS validation_status,
      c.settlement_status AS settlement_status,
      ev.processing_status AS processing_status,
      csv.source AS csv_source,
      csv.order_status AS csv_order_status,
      EXISTS (
        SELECT 1 FROM profiles p WHERE p.user_id = c.publisher_id
      ) AS publisher_exists,
      EXISTS (
        SELECT 1 FROM tracking_links tl
        WHERE tl.id::text = c.tracking_link_id
      ) AS tracking_link_exists,
      -- Phase 20K 4A2B: tracking link ownership must match the
      -- conversion publisher, otherwise the loader returns
      -- "owner_mismatch" (not "duplicate") so the mapper can use
      -- the diagnostic reason code
      -- rejected_attribution_owner_mismatch.
      EXISTS (
        SELECT 1 FROM tracking_links tl
        WHERE tl.id::text = c.tracking_link_id
          AND tl.publisher_id = c.publisher_id
      ) AS tracking_link_publisher_match,
      -- Schema-enforced uniqueness key #1:
      -- (network, external_order_id). The conversions table has a
      -- full UNIQUE constraint on this pair; >= 2 rows in our
      -- scoped set with the same pair means the constraint has
      -- been bypassed (e.g. manual SQL) and the row is
      -- irrecoverably conflicted.
      (
        SELECT count(*)::int
        FROM conversions c2
        WHERE c2.network = c.network
          AND c2.external_order_id = c.external_order_id
          AND c2.id = ANY(${sql.raw(idArray)})
      ) AS external_order_collision_count,
      -- Schema-enforced uniqueness key #2:
      -- (network, source_conversion_key) when non-null. Same
      -- semantics as above.
      (
        SELECT count(*)::int
        FROM conversions c2
        WHERE c2.network = c.network
          AND c2.source_conversion_key IS NOT NULL
          AND c2.source_conversion_key = c.source_conversion_key
          AND c2.id = ANY(${sql.raw(idArray)})
      ) AS source_conversion_key_collision_count
    FROM conversions c
    LEFT JOIN shopee_ingestion_events ev
      ON ev.id = c.ingestion_event_id
    LEFT JOIN shopee_csv_rows csv
      ON csv.row_fingerprint_sha256 = c.source_conversion_key
    WHERE c.id = ANY(${sql.raw(idArray)})
  `);
  return toRows(raw);
}

function classifySourceEvidence(
  rows: ReadonlyArray<Record<string, unknown>>,
): Map<string, SourceEvidenceDbFields> {
  const out = new Map<string, SourceEvidenceDbFields>();
  for (const row of rows) {
    const id = String(row.conversion_id);
    const network = String(row.network ?? "").toLowerCase();
    const processingStatus = String(row.processing_status ?? "");
    const validationStatus = String(row.validation_status ?? "");
    const settlementStatus = String(row.settlement_status ?? "");
    const csvOrderStatus = String(row.csv_order_status ?? "").toUpperCase();
    const publisherPresent = row.publisher_exists === true;
    const trackingLinkPresent = row.tracking_link_exists === true;
    // Phase 20K checkpoint 4A2B -- the
    // `tracking_link_publisher_match` flag is true ONLY when
    // the tracking_link row exists AND its `publisher_id`
    // equals the conversion's `publisher_id`. A link that
    // exists but belongs to a different publisher fails closed
    // as `"owner_mismatch"`, never `"unique"`.
    const trackingLinkPublisherMatch =
      row.tracking_link_publisher_match === true;
    const externalOrderCollisionCount = Number(
      row.external_order_collision_count ?? 0,
    );
    const sourceConversionKeyCollisionCount = Number(
      row.source_conversion_key_collision_count ?? 0,
    );
    let csvSource: SourceEvidenceDbFields["csvSource"];
    if (
      row.csv_source === "manual_csv" ||
      row.csv_source === "addlivetag_api" ||
      row.csv_source === "official_shopee_api"
    ) {
      csvSource = row.csv_source;
    } else {
      csvSource = null;
    }

    // Persisted attribution link-kind. Only "unique" opens the
    // apply gate in the mapper. Phase 20K 4A2B contract:
    //
    //   - publisher or tracking-link row absent   -> "missing"
    //   - link exists but belongs to another
    //     publisher                                -> "owner_mismatch"
    //   - (network, external_order_id) violates the
    //     schema UNIQUE in the scoped set          -> "order_id_collision"
    //   - (network, source_conversion_key) violates
    //     the partial UNIQUE in the scoped set     -> "source_key_collision"
    //   - everything else                          -> "unique"
    let persistedLinkKind: SourceEvidenceDbFields["persistedLinkKind"];
    if (!publisherPresent || !trackingLinkPresent) {
      persistedLinkKind = "missing";
    } else if (!trackingLinkPublisherMatch) {
      persistedLinkKind = "owner_mismatch";
    } else if (externalOrderCollisionCount >= 2) {
      persistedLinkKind = "order_id_collision";
    } else if (sourceConversionKeyCollisionCount >= 2) {
      persistedLinkKind = "source_key_collision";
    } else {
      persistedLinkKind = "unique";
    }

    // Persisted source-status stamp. Mapped strictly from
    // fields that actually exist in the upstream tables. We do
    // NOT invent cancelled / refunded -- they are real fields
    // on `shopee_csv_rows.order_status`. Check order is critical
    // (Phase 20K 4A2B): the CANCELLED / REFUNDED evidence on
    // the joined CSV row takes precedence over the generic
    // "validated+approved" stamp that the rest of the loader
    // might have produced for the same row. A CANCELLED order
    // with a previously-stamped validation_status='approved'
    // MUST be classified as `cancelled` here so the mapper's
    // source_status gate refuses the apply.
    let sourceStatus: SourceEvidenceSnapshot["sourceStatus"] = "unknown";
    if (
      processingStatus === "succeeded" &&
      (csvOrderStatus === "CANCELLED" || csvOrderStatus === "IN_CANCELLED")
    ) {
      sourceStatus = "cancelled";
    } else if (
      processingStatus === "succeeded" &&
      csvOrderStatus === "REFUNDED"
    ) {
      sourceStatus = "refunded";
    } else if (
      processingStatus === "succeeded" &&
      validationStatus === "approved" &&
      persistedLinkKind === "unique"
    ) {
      sourceStatus = "confirmed_eligible";
    } else if (processingStatus === "skipped") {
      sourceStatus = "pending_source";
    } else if (settlementStatus === "payable") {
      sourceStatus = "pending_source";
    }
    // NOTE (Phase 20K 4E3B safety blocker): a non-null
    // `processing_status = 'failed'` row was previously mapped to
    // `sourceStatus = "confirmed_invalid"` so the mapper could
    // plan a `pending -> rejected` transition for the affected
    // conversion. That auto-classification was UNSAFE because
    // the persisted `failure_code` value is unvalidated free-form
    // text -- there is no allowlist that ties any specific code
    // to the meaning "the source explicitly says the
    // order/conversion is business-invalid", and the production
    // tree currently has zero code paths that ever write such a
    // code. Phase 20K 4E3B intentionally removes that auto-class-
    // ification: a `failed` ingestion event is treated as
    // insufficient business evidence and produces a fail-closed
    // skip (the default `sourceStatus = "unknown"` below, which
    // the mapper returns as `kind: "skip", reasonCode:
    // "rejected_source_not_confirmed"`). A future checkpoint may
    // re-introduce an explicit allowlist of business-invalid
    // failure codes (and only those) but it MUST NOT reuse this
    // generic auto-confirm branch.
    out.set(id, {
      sourceStatus,
      persistedLinkKind,
      publisherPresent,
      trackingLinkPresent,
      csvSource,
      network,
    });
    // The mapper already knows the network from the conversion
    // row; the snapshot value is exposed for diagnostic consumers.
    void network;
  }
  return out;
}

/**
 * Default source-evidence loader -- uses the singleton
 * `db.execute` connection pool. Safe to call OUTSIDE a
 * transaction. Inside a transaction, callers MUST use the
 * `tx`-aware variant below to avoid deadlock on the
 * single-connection pool.
 */
async function loadSourceEvidenceAsync(
  database: Pick<ReconciliationDatabase, "execute">,
  conversionIds: ReadonlyArray<string>,
): Promise<Map<string, SourceEvidenceDbFields>> {
  const rows = await executeSourceEvidenceQuery(database, conversionIds);
  return classifySourceEvidence(rows);
}

/**
 * Transaction-aware source-evidence loader. Uses the open
 * transaction's `tx.execute` so it shares the connection with the
 * surrounding `FOR UPDATE` lock on the conversion row. Calling the
 * default variant from inside a transaction would deadlock against
 * the singleton pool's `max: 1` setting.
 */
async function loadSourceEvidenceInTxAsync(
  tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
  conversionIds: ReadonlyArray<string>,
): Promise<Map<string, SourceEvidenceDbFields>> {
  const rows = await executeSourceEvidenceQuery(tx, conversionIds);
  return classifySourceEvidence(rows);
}

/**
 * Load all `conversions` rows in scope for Phase 20K -- the set
 * of rows the planner would consider. This is the ONLY step that
 * reads `conversions` globally; the planner still reduces this
 * list to a typed `plan` and only the candidates in that plan
 * are persisted to the run and acted on by commit.
 *
 * The status filter `pending | approved | payable` matches the
 * current Phase 20K scope. `payable` rows are loaded so the
 * mapper can refuse them with
 * `rejected_paid_out_of_phase_20k_scope`.
 */
/**
 * Phase 20K follow-up 3 -- server-validated, BOUNDED source scope.
 *
 * Money-impacting reconciliation must NEVER scan every row in
 * `conversions`. The repository refuses to plan a run unless the
 * caller supplies a scope that names an explicit server-side
 * boundary:
 *
 *   - `ingestionEventIds`     : shopee_ingestion_events ids (preferred)
 *   - `csvImportBatchIds`     : shopee_csv_import_batches ids;
 *                               resolves through the
 *                               shopee_ingestion_events join
 *   - `sourceConversionKeys`  : SHA-256 row fingerprints from a CSV import
 *   - `explicitConversionIds` : exact `conversions.id` list
 *   - `occurredAfter` + `occurredBefore` paired ISO timestamps
 *
 * At least ONE of the above must be present. The status filter
 * (`pending | approved | payable`) is preserved as a downstream
 * predicate, but the source scope is what reduces the working set.
 *
 * The scope is built from a typed object the server validates;
 * it is NEVER derived from raw `FormData` without going through
 * `assertSourceScope`.
 */
/**
 * Phase 20K follow-up 4 -- source scope hard limits.
 *
 * Money-impacting reconciliation must NEVER silently scan or
 * silently truncate. The repository enforces:
 *
 *   - MAX 200 entries per list (ingestionEventIds,
 *     csvImportBatchIds, sourceConversionKeys,
 *     explicitConversionIds).
 *   - MAX 30 days for the occurred window.
 *   - All sourceConversionKeys must look like sha256 hex
 *     (64 lowercase hex chars).
 *   - All ingestionEventIds, csvImportBatchIds and
 *     explicitConversionIds must be valid UUIDs (already
 *     validated by UUID_PATTERN).
 *   - Duplicate entries inside any single list are rejected
 *     at scope-validation time so the persisted scope cannot
 *     silently overlap itself.
 *   - 5001-row probe (Phase 20K 4G1): the candidate loader
 *     reads `MAX_CANDIDATE_COUNT + 1` rows and refuses to
 *     plan if more than MAX_CANDIDATE_COUNT rows are
 *     returned. A 5001st row triggers a fail-closed throw
 *     BEFORE any reconciliation_runs or
 *     reconciliation_run_candidates row is created -- the
 *     admin must narrow the scope and re-run.
 */
export const MAX_SCOPE_ITEMS = 200;
export const MAX_SCOPE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_CANDIDATE_COUNT = 5000;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

function assertUuidList(
  label: string,
  list: ReadonlyArray<string>,
): void {
  if (list.length > MAX_SCOPE_ITEMS) {
    throw new Error(
      "reconciliation.repository: scope '" +
        label +
        "' exceeds MAX_SCOPE_ITEMS=" +
        MAX_SCOPE_ITEMS +
        " (got " +
        list.length +
        ")",
    );
  }
  for (const item of list) {
    if (!UUID_PATTERN.test(item)) {
      throw new Error(
        "reconciliation.repository: scope '" +
          label +
          "' contains a non-UUID entry",
      );
    }
  }
}

function assertSha256List(
  label: string,
  list: ReadonlyArray<string>,
): void {
  if (list.length > MAX_SCOPE_ITEMS) {
    throw new Error(
      "reconciliation.repository: scope '" +
        label +
        "' exceeds MAX_SCOPE_ITEMS=" +
        MAX_SCOPE_ITEMS +
        " (got " +
        list.length +
        ")",
    );
  }
  const seen = new Set<string>();
  for (const item of list) {
    if (!SHA256_HEX_PATTERN.test(item)) {
      throw new Error(
        "reconciliation.repository: scope '" +
          label +
          "' contains a non-sha256 entry",
      );
    }
    if (seen.has(item)) {
      throw new Error(
        "reconciliation.repository: scope '" +
          label +
          "' contains duplicate entry",
      );
    }
    seen.add(item);
  }
}

function assertUniqueUuidList(
  label: string,
  list: ReadonlyArray<string>,
): void {
  assertUuidList(label, list);
  const seen = new Set<string>();
  for (const item of list) {
    if (seen.has(item)) {
      throw new Error(
        "reconciliation.repository: scope '" +
          label +
          "' contains duplicate entry",
      );
    }
    seen.add(item);
  }
}

export interface ReconciliationSourceScope {
  /**
   * Exact `shopee_ingestion_events.id` values (UUIDs). The
   * server-validated ingestion-event id list is the preferred
   * scope boundary when an operator is reconciling a known
   * ingestion event.
   */
  readonly ingestionEventIds?: ReadonlyArray<string>;
  /**
   * Exact `shopee_ingestion_events.batch_id` values (UUIDs).
   * Resolves via
   *   conversions.ingestion_event_id -> shopee_ingestion_events.id
   *   shopee_ingestion_events.batch_id -> shopee_csv_import_batches.id
   * so all conversions sourced from the given CSV import batch
   * are in scope. Server-validated; supports up to
   * `MAX_SCOPE_ITEMS` batch ids per scope.
   */
  readonly csvImportBatchIds?: ReadonlyArray<string>;
  /**
   * Exact SHA-256 source-conversion-key values. The
   * `row_fingerprint_sha256` value used by `conversions
   * .source_conversion_key`. Server-validated as 64 lowercase
   * hex chars; duplicates are rejected at scope-validation
   * time. Supports up to `MAX_SCOPE_ITEMS` keys per scope.
   */
  readonly sourceConversionKeys?: ReadonlyArray<string>;
  /**
   * Exact `conversions.id` values (UUIDs). The last-resort
   * scope when no source-side boundary applies. Server-validated;
   * supports up to `MAX_SCOPE_ITEMS` ids per scope.
   */
  readonly explicitConversionIds?: ReadonlyArray<string>;
  /**
   * Paired ISO-8601 timestamps bounding `conversions.occurred_at`.
   * Must satisfy `occurredAfter < occurredBefore` and the
   * difference must not exceed `MAX_SCOPE_WINDOW_MS` (30 days).
   */
  readonly occurredAfter?: string;
  readonly occurredBefore?: string;
}

const SCOPE_TOO_BROAD_ERROR =
  "reconciliation.repository: source scope is empty -- refusing to plan an unbounded run. " +
  "Provide at least one of: ingestionEventIds, csvImportBatchIds, sourceConversionKeys, explicitConversionIds, " +
  "or a paired (occurredAfter, occurredBefore) window.";

function assertSourceScope(scope: ReconciliationSourceScope): void {
  const hasEvents =
    Array.isArray(scope.ingestionEventIds) &&
    scope.ingestionEventIds.length > 0;
  const hasBatches =
    Array.isArray(scope.csvImportBatchIds) &&
    scope.csvImportBatchIds.length > 0;
  const hasKeys =
    Array.isArray(scope.sourceConversionKeys) &&
    scope.sourceConversionKeys.length > 0;
  const hasExplicit =
    Array.isArray(scope.explicitConversionIds) &&
    scope.explicitConversionIds.length > 0;
  const hasWindow =
    typeof scope.occurredAfter === "string" &&
    scope.occurredAfter.length > 0 &&
    typeof scope.occurredBefore === "string" &&
    scope.occurredBefore.length > 0;
  if (!(hasEvents || hasBatches || hasKeys || hasExplicit || hasWindow)) {
    throw new Error(SCOPE_TOO_BROAD_ERROR);
  }
  if (hasEvents) {
    assertUniqueUuidList("ingestionEventIds", scope.ingestionEventIds!);
  }
  if (hasBatches) {
    assertUniqueUuidList("csvImportBatchIds", scope.csvImportBatchIds!);
  }
  if (hasExplicit) {
    assertUniqueUuidList("explicitConversionIds", scope.explicitConversionIds!);
  }
  if (hasKeys) {
    assertSha256List("sourceConversionKeys", scope.sourceConversionKeys!);
  }
  if (hasWindow) {
    const a = Date.parse(scope.occurredAfter!);
    const b = Date.parse(scope.occurredBefore!);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      throw new Error(
        "reconciliation.repository: occurredAfter/occurredBefore must be ISO timestamps",
      );
    }
    if (a >= b) {
      throw new Error(
        "reconciliation.repository: occurredAfter must be strictly less than occurredBefore",
      );
    }
    if (b - a > MAX_SCOPE_WINDOW_MS) {
      throw new Error(
        "reconciliation.repository: scope window exceeds MAX_SCOPE_WINDOW_MS=30d",
      );
    }
  }
}

/**
 * Build the SQL WHERE clause that reduces `conversions` to the
 * bounded scope. The clause is constructed from sanitised,
 * server-validated identifiers -- never from raw FormData.
 *
 * Returns an array of SQL fragments that compose with `AND`.
 */
function buildScopeWhereFragments(scope: ReconciliationSourceScope): {
  readonly fragments: ReadonlyArray<ReturnType<typeof sql>>;
  readonly idsForEvidence: ReadonlyArray<string>;
} {
  const fragments: Array<ReturnType<typeof sql>> = [];
  const idsForEvidence = new Set<string>();
  if (
    Array.isArray(scope.ingestionEventIds) &&
    scope.ingestionEventIds.length > 0
  ) {
    const csv = scope.ingestionEventIds
      .map((id) => "'" + id.replace(/'/g, "''") + "'::uuid")
      .join(",");
    fragments.push(
      sql.raw("ingestion_event_id = ANY(ARRAY[" + csv + "])"),
    );
  }
  if (
    Array.isArray(scope.csvImportBatchIds) &&
    scope.csvImportBatchIds.length > 0
  ) {
    // Translate `shopee_csv_import_batches.id` values to the
    // matching `conversions.ingestion_event_id` set via the
    // join key on `shopee_ingestion_events.batch_id`. Each
    // batch id is server-validated as a UUID by
    // `assertUniqueUuidList` so the inlined literal is safe.
    const csv = scope.csvImportBatchIds
      .map((id) => "'" + id.replace(/'/g, "''") + "'::uuid")
      .join(",");
    fragments.push(
      sql.raw(
        "ingestion_event_id IN ("
          + "SELECT id FROM shopee_ingestion_events "
          + "WHERE batch_id = ANY(ARRAY[" + csv + "])"
          + ")",
      ),
    );
  }
  if (
    Array.isArray(scope.sourceConversionKeys) &&
    scope.sourceConversionKeys.length > 0
  ) {
    const csv = scope.sourceConversionKeys
      .map((k) => "'" + k.replace(/'/g, "''") + "'::text")
      .join(",");
    fragments.push(sql.raw("source_conversion_key = ANY(ARRAY[" + csv + "])"));
  }
  if (
    Array.isArray(scope.explicitConversionIds) &&
    scope.explicitConversionIds.length > 0
  ) {
    for (const id of scope.explicitConversionIds) {
      idsForEvidence.add(id);
    }
    const csv = scope.explicitConversionIds
      .map((id) => "'" + id.replace(/'/g, "''") + "'::uuid")
      .join(",");
    fragments.push(sql.raw("id = ANY(ARRAY[" + csv + "])"));
  }
  if (
    typeof scope.occurredAfter === "string" &&
    scope.occurredAfter.length > 0 &&
    typeof scope.occurredBefore === "string" &&
    scope.occurredBefore.length > 0
  ) {
    fragments.push(
      sql`occurred_at >= ${scope.occurredAfter}::timestamptz`,
      sql`occurred_at < ${scope.occurredBefore}::timestamptz`,
    );
  }
  return { fragments, idsForEvidence: Array.from(idsForEvidence) };
}

/**
 * Phase 20K follow-up 3 -- BOUNDED candidate loader. Replaces the
 * follow-up 2 global scan. The caller MUST pass a server-validated
 * `scope`; `loadAllInScopeConversionsAsync` remains ONLY for the
 * reconciliation integration test fixtures that explicitly seed a
 * pre-scope-set of rows. The production paths go through this.
 */
async function loadScopedConversionsAsync(
  database: Pick<ReconciliationDatabase, "execute">,
  network: ReconciliationNetwork,
  scope: ReconciliationSourceScope,
): Promise<
  ReadonlyArray<{
    readonly row: ConversionDbRow;
    readonly evidence: SourceEvidenceDbFields;
  }>
> {
  assertSourceScope(scope);
  const { fragments, idsForEvidence } = buildScopeWhereFragments(scope);
  const networkClause = sql`network = ${network}::text`;
  const statusClause = sql`status = ANY(ARRAY['pending'::text, 'approved'::text, 'payable'::text])`;
  const allFragments = [networkClause, statusClause, ...fragments];
  const where = sql.join(allFragments, sql` AND `);
  // Fail-closed candidate probe -- Phase 20K checkpoint 4G1.
  //
  // We deliberately read at most `MAX_CANDIDATE_COUNT + 1` rows
  // so the loader can detect "more candidates than the
  // supported maximum" WITHOUT silently truncating to the
  // first MAX_CANDIDATE_COUNT rows and presenting a partial
  // run. Concretely:
  //
  //   rows.length === MAX_CANDIDATE_COUNT (e.g. 5000)
  //     -> within supported scope. Proceed.
  //   rows.length === MAX_CANDIDATE_COUNT + 1 (e.g. 5001)
  //     -> AT LEAST one extra candidate exists outside the
  //        scope window. Refuse to plan; the operator MUST
  //        narrow the scope (smaller list, narrower time
  //        window, etc.) and re-run.
  //
  // The throw happens BEFORE `reconciliation_runs` and
  // `reconciliation_run_candidates` are touched, so a 5001st
  // row never results in a partial run. The error message
  // carries the actual count and a closed-action hint so the
  // operator can correct the scope without guessing.
  const rows = toRows(
    await database.execute(sql`
      SELECT
        id,
        network,
        source_conversion_key,
        status,
        network_commission::text AS network_commission,
        cashback_share_bps_snapshot,
        user_cashback::text AS user_cashback,
        platform_profit::text AS platform_profit,
        occurred_at,
        ingestion_event_id,
        advertiser_id,
        campaign_id,
        offer_id,
        tracking_link_id,
        publisher_id,
        validation_status,
        settlement_status
      FROM conversions
      WHERE ${where}
      ORDER BY occurred_at ASC, id ASC
      LIMIT ${sql.raw(String(MAX_CANDIDATE_COUNT + 1))}
    `),
  );
  const ids = rows.map((r) => String(r.id));
  if (idsForEvidence.length > 0) {
    for (const id of idsForEvidence) ids.push(id);
  }
  // Fail-closed: if the loader selected MORE than the
  // documented candidate cap, refuse to plan. Silently
  // truncating would drop candidates that the admin
  // explicitly selected. The probe above uses LIMIT
  // (MAX_CANDIDATE_COUNT + 1), so the only way `rows.length`
  // exceeds MAX_CANDIDATE_COUNT is if there is genuinely an
  // N+1th row in the underlying set -- exactly the case the
  // user-facing 5001-probe is designed to surface.
  if (rows.length > MAX_CANDIDATE_COUNT) {
    throw new Error(
      "reconciliation.repository: scope selected " +
        rows.length +
        " or more candidates which exceeds MAX_CANDIDATE_COUNT=" +
        MAX_CANDIDATE_COUNT +
        "; refusing to plan a partial run -- narrow the scope and re-run dry-run",
    );
  }
  const evidenceById = await loadSourceEvidenceAsync(database, ids);
  return rows.map((r) => ({
    row: r as unknown as ConversionDbRow,
    evidence: evidenceById.get(String(r.id)) ?? {
      sourceStatus: "unknown",
      persistedLinkKind: "missing",
      publisherPresent: false,
      trackingLinkPresent: false,
      csvSource: null,
      network: "",
    },
  }));
}

function buildCandidateInput(args: {
  readonly row: ConversionDbRow;
  readonly evidence: SourceEvidenceDbFields;
}): RunScopeCandidateInput {
  const { row, evidence } = args;
  const networkCommission = parseCommission(row.network_commission);
  return {
    conversionId: row.id,
    snapshot: {
      network: row.network,
      currentStatus: parseStatus(row.status),
      validationStatus: (row.validation_status ?? undefined) as never,
      settlementStatus: (row.settlement_status ?? undefined) as never,
      sourceConversionKey: row.source_conversion_key ?? undefined,
      ingestionEventId: row.ingestion_event_id ?? undefined,
      persistedLinkKind: evidence.persistedLinkKind,
      sourceStatus: evidence.sourceStatus,
    },
    commission: {
      networkCommission,
      cashbackShareBpsSnapshot: parseCashbackShareBps(
        row.cashback_share_bps_snapshot,
      ),
      userCashback: parseCommission(row.user_cashback),
      platformProfit: parseCommission(row.platform_profit),
    },
  };
}

function assertNotPaid(decision: RunScopePlannedApply): void {
  if ((decision.nextStatus as string) === "paid") {
    throw new Error(
      "reconciliation.repository: refused to apply a transition to 'paid' -- Phase 20K does not implement payout",
    );
  }
}

export interface DryRunReconciliationResult {
  readonly summary: ReconciliationRunScopeSummary;
  readonly decisions: ReadonlyArray<RunScopePlannedApply | RunScopePlannedReject>;
  readonly skipped: ReadonlyArray<{
    readonly conversionId: string;
    readonly reasonCode: string;
  }>;
  readonly scannedAt: string;
  readonly scannedRowCount: number;
  readonly reconciliationRunId: string;
  readonly network: ReconciliationNetwork;
}

export interface ReconciliationRunScopeSummary {
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

export interface CommitReconciliationInput {
  readonly actorUserId: string;
  readonly actorRole: "admin" | "super_admin";
  readonly reconciliationRunId: string;
  readonly identifierPlan?: CommitReconciliationIdentifierPlan;
}

/**
 * Phase 20K follow-up 4 -- dependency-injection seam for
 * concurrency tests. The production path always passes the
 * shared `db` singleton; tests can substitute a fresh
 * `postgres()` client with `max: 1` per call so two independent
 * physical connections can race the same reconciliationRunId.
 *
 * The interface is intentionally minimal: only the operations
 * the commit path actually performs.
 */
export interface ReconciliationExecutor {
  transaction<T>(
    fn: (tx: ReconciliationExecutorTx) => Promise<T>,
  ): Promise<T>;
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

export interface ReconciliationExecutorTx {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
  /**
   * Phase 20K follow-up 4 -- Drizzle `update(...).set().where()`
   * is the only path used by the commit to mutate the
   * `conversions` table. The executor exposes it through the
   * shared Drizzle instance; the production default uses
   * `db.update`, the test executor wires a parallel
   * `postgres()` client through a freshly-constructed Drizzle.
   */
  updateConversions(
    payload: Partial<typeof import("@/db/schema").conversions.$inferInsert>,
    where: SQL<unknown> | undefined,
  ): Promise<unknown>;
}

export interface CommitReconciliationResult {
  readonly summary: ReconciliationRunScopeSummary;
  readonly applied: ReadonlyArray<RunScopePlannedApply | RunScopePlannedReject>;
  readonly skipped: ReadonlyArray<{
    readonly conversionId: string;
    readonly reasonCode: string;
    readonly idempotentReplay?: boolean;
  }>;
  readonly committedAt: string;
  readonly scannedRowCount: number;
  readonly reconciliationRunId: string;
}

interface DryRunReconciliationDependencies {
  readonly database: ReconciliationDatabase;
}

/**
 * Dry-run: load every in-scope conversion, run the source-evidence
 * mapper + run-scope planner, persist the run + candidate set,
 * return the typed plan.
 *
 * Persisting the run + candidates on dry-run is REQUIRED by the
 * BLK A contract: the commit path never accepts a candidate set
 * the dry-run did not author. The persisted rows are not money
 * mutations -- they only pin the candidate set + planned decision
 * for the audit trail.
 */
export async function dryRunReconciliationAsync(args: {
  readonly network: ReconciliationNetwork;
  readonly actor: ReconciliationActor;
  readonly identifierPlan?: DryRunReconciliationIdentifierPlan;
  /**
   * Phase 20K follow-up 3 -- server-validated, bounded source
   * scope. The repository refuses to plan a run without a scope;
   * see `assertSourceScope` for the closed list of accepted
   * boundaries.
   */
  readonly sourceScope: ReconciliationSourceScope;
}, dependencies?: DryRunReconciliationDependencies): Promise<DryRunReconciliationResult> {
  const network = args.network;
  const validatedIdentifierPlan =
    validateDryRunReconciliationIdentifierPlan(args.identifierPlan);
  if (!ALLOWED_RECONCILIATION_NETWORKS.includes(network)) {
    throw new Error(
      "reconciliation.repository: unknown network '" + String(network) + "'",
    );
  }
  assertSourceScope(args.sourceScope);
  const database = dependencies?.database ?? (await loadDefaultDatabase());
  const filtered = await loadScopedConversionsAsync(
    database,
    network,
    args.sourceScope,
  );
  const candidateInputs = filtered.map(({ row, evidence }) =>
    buildCandidateInput({ row, evidence }),
  );

  let reconciliationRunId: string;
  if (validatedIdentifierPlan) {
    reconciliationRunId = validatedIdentifierPlan.reconciliationRunId;
  } else {
    const runIdRow = toRows(
      await database.execute(sql`SELECT gen_random_uuid()::text AS run_id`),
    );
    reconciliationRunId =
      typeof runIdRow[0]?.run_id === "string"
        ? (runIdRow[0]!.run_id as string)
        : "";
  }

  const plan = planRunScope({
    network,
    runId: reconciliationRunId,
    candidates: candidateInputs,
    policyVersion: RECONCILIATION_POLICY_VERSION,
  });

  const persisted = await persistRunAsync({
    network,
    actor: args.actor,
    reconciliationRunId,
    plan,
    sourceScope: args.sourceScope,
    identifierPlan: validatedIdentifierPlan,
    database,
  });

  const applied: Array<RunScopePlannedApply | RunScopePlannedReject> = [];
  const skipped: Array<{ conversionId: string; reasonCode: string }> = [];
  let totalCommission = 0;
  let totalUserCashback = 0;
  let totalPlatformProfit = 0;
  for (const candidate of plan.candidates) {
    if (candidate.kind === "skip") {
      skipped.push({
        conversionId: candidate.conversionId,
        reasonCode: candidate.reasonCode,
      });
    } else {
      applied.push(candidate);
      totalCommission += candidate.plannedMoneyNetworkCommission;
      totalUserCashback += candidate.plannedMoneyUserCashback;
      totalPlatformProfit += candidate.plannedMoneyPlatformProfit;
    }
  }

  return {
    summary: {
      scannedRows: candidateInputs.length,
      applied: applied.length,
      skipped: skipped.length,
      reject: applied.filter((d) => d.kind === "reject").length,
      totals: {
        networkCommission: totalCommission,
        userCashback: totalUserCashback,
        platformProfit: totalPlatformProfit,
      },
    },
    decisions: applied,
    skipped,
    scannedAt: new Date().toISOString(),
    scannedRowCount: candidateInputs.length,
    reconciliationRunId,
    network,
  };
}

async function persistRunAsync(args: {
  readonly network: ReconciliationNetwork;
  readonly actor: ReconciliationActor;
  readonly reconciliationRunId: string;
  readonly plan: {
    readonly candidates: ReadonlyArray<unknown>;
    readonly candidateFingerprint: string;
  };
  readonly sourceScope: ReconciliationSourceScope;
  readonly identifierPlan?: ValidatedDryRunReconciliationIdentifierPlan;
  readonly database: ReconciliationDatabase;
}): Promise<{ readonly candidateCount: number }> {
  if (!UUID_PATTERN.test(args.reconciliationRunId)) {
    throw new Error(
      "reconciliation.repository: reconciliationRunId must be a UUID",
    );
  }
  if (args.actor.actorKind !== "admin") {
    throw new Error(
      "reconciliation.repository: dry-run requires an 'admin' actor",
    );
  }
  // Phase 20K follow-up 4 -- run creation is atomic: either the
  // reconciliation_runs row AND every reconciliation_run_candidates
  // row land together, or the whole dry-run is rolled back. A
  // partially-created run is forbidden.
  //
  // Phase 20K checkpoint 4D1 -- bounded row-count validation. The
  // candidate INSERT uses `.returning({ id })` so the transaction
  // can assert the number of persisted rows exactly equals the
  // number of planned rows. Drizzle would otherwise throw on a
  // constraint violation; this assertion is the belt-and-braces
  // check that no path between drizzle and the SQL driver can
  // silently drop a row.
  const plannedCandidates = args.plan.candidates.filter(
    (candidate) => (candidate as { readonly kind?: unknown }).kind !== "skip",
  ) as ReadonlyArray<RunScopePlannedApply | RunScopePlannedReject>;
  const resolvedCandidateIdentifiers =
    resolveDryRunReconciliationIdentifierPlan(
      args.identifierPlan,
      plannedCandidates.map((candidate) => ({
        conversionId: candidate.conversionId,
        sourceConversionKey: candidate.sourceConversionKey,
      })),
    );
  const candidateRows: Array<typeof reconciliationRunCandidates.$inferInsert> = [];
  for (const c of plannedCandidates) {
    const suppliedIdentifier = resolvedCandidateIdentifiers?.find(
      (candidate) =>
        candidate.conversionId === c.conversionId.toLowerCase() &&
        candidate.sourceConversionKey === c.sourceConversionKey,
    );
    candidateRows.push({
      ...(suppliedIdentifier ? { id: suppliedIdentifier.candidateId } : {}),
      runId: args.reconciliationRunId,
      conversionId: c.conversionId,
      sourceConversionKey: c.sourceConversionKey,
      network: args.network,
      expectedPreviousStatus: c.previousStatus,
      intendedNextStatus: c.nextStatus,
      plannedReasonCode: c.reasonCode,
      plannedMoneyNetworkCommission: c.plannedMoneyNetworkCommission,
      plannedCashbackShareBps: c.plannedCashbackShareBps,
      plannedMoneyUserCashback: c.plannedMoneyUserCashback,
      plannedMoneyPlatformProfit: c.plannedMoneyPlatformProfit,
      plannedIdempotencyKey: c.plannedIdempotencyKey,
      provenanceFingerprint: c.provenanceFingerprint,
    });
  }
  try {
    await args.database.transaction(async (tx) => {
      const runValues = {
        id: args.reconciliationRunId,
        network: args.network,
        createdByUserId: args.actor.actorUserId ?? "",
        createdByRole: args.actor.actorRole ?? "admin",
        policyVersion: RECONCILIATION_POLICY_VERSION,
        candidateFingerprint: args.plan.candidateFingerprint,
        scope: args.sourceScope as never,
        scopeCandidateCount: candidateRows.length,
        status: "draft" as const,
      };

      if (args.identifierPlan) {
        const persistedRunIds = await tx
          .insert(reconciliationRuns)
          .values(runValues)
          .returning({ id: reconciliationRuns.id });
        if (persistedRunIds.length !== 1) {
          throw new Error(
            "reconciliation.repository: persisted run count does not equal one",
          );
        }
        assertReconciliationIdentifierResult(
          args.reconciliationRunId,
          persistedRunIds[0]?.id,
        );

        let persistedCandidateRows: ReadonlyArray<{
          readonly id: string;
          readonly conversionId: string;
          readonly sourceConversionKey: string | null;
        }> = [];
        if (candidateRows.length > 0) {
          persistedCandidateRows = await tx
            .insert(reconciliationRunCandidates)
            .values(candidateRows)
            .returning({
              id: reconciliationRunCandidates.id,
              conversionId: reconciliationRunCandidates.conversionId,
              sourceConversionKey:
                reconciliationRunCandidates.sourceConversionKey,
            });
        }
        const persistedCandidateIdentifiers = persistedCandidateRows.map(
          (row) => {
            if (row.sourceConversionKey === null) {
              throw new Error(
                "reconciliation.repository: persisted candidate source identity is missing",
              );
            }
            return Object.freeze({
              conversionId: row.conversionId.toLowerCase(),
              sourceConversionKey: row.sourceConversionKey,
              candidateId: row.id.toLowerCase(),
            });
          },
        );
        assertCandidateIdentifierResults(
          resolvedCandidateIdentifiers ?? [],
          persistedCandidateIdentifiers,
        );
        return;
      }

      await tx.insert(reconciliationRuns).values(runValues);
      let persistedCandidateIds: ReadonlyArray<{ readonly id: string }> = [];
      if (candidateRows.length > 0) {
        persistedCandidateIds = await tx
          .insert(reconciliationRunCandidates)
          .values(candidateRows)
          .returning({ id: reconciliationRunCandidates.id });
      }
      if (persistedCandidateIds.length !== candidateRows.length) {
        // Phase 20K checkpoint 4D1 -- refused to commit a partial
        // candidate set. Throw so the surrounding drizzle
        // transaction rolls back BOTH the run row and the
        // already-persisted candidate rows.
        throw new Error(
          "reconciliation.repository: persisted candidate count " +
            "(" +
            String(persistedCandidateIds.length) +
            ") does not match planned candidate count " +
            "(" +
            String(candidateRows.length) +
            "); rolling back run creation",
        );
      }
    });
  } catch (e) {
    throw new Error(
      "reconciliation.repository: failed to persist run atomically; rolled back. " +
        ((e as Error).message ?? String(e)),
    );
  }
  return { candidateCount: candidateRows.length };
}

/**
 * Default executor wrapping the shared `db` singleton. The
 * integration tests construct a parallel executor from a fresh
 * `postgres()` client so the concurrency test exercises the
 * ACTUAL production commit path on a second physical
 * connection.
 */
function buildDefaultExecutor(database: ReconciliationDatabase): ReconciliationExecutor {
  return {
    transaction<T>(fn: (tx: ReconciliationExecutorTx) => Promise<T>): Promise<T> {
      return database.transaction(async (rawTx) => {
        const tx: ReconciliationExecutorTx = {
          execute: async (q) =>
            (await rawTx.execute(q as never)) as unknown,
          updateConversions: async (payload, where) =>
            (await rawTx
              .update(conversions)
              .set(payload)
              .where(where)
              .returning({ id: conversions.id })) as unknown,
        };
        return fn(tx);
      });
    },
    execute: async (q) => (await database.execute(q as never)) as unknown,
  };
}

/**
 * Phase 20K follow-up 4 -- public dependency-injection factory
 * for the production commit path. Returns an executor that owns
 * a fresh `postgres()` connection (independent from the shared
 * `db` singleton) so two concurrent callers can race on the same
 * `reconciliationRunId` via `Promise.all`. Always `await
 * closeAsync()` to release the connection.
 *
 * The default executor (used when callers pass `undefined`) is
 * the singleton `db` with `max: 1` and never needs to be
 * closed.
 */
export function buildReconciliationExecutor(): ReconciliationExecutor & {
  readonly closeAsync: () => Promise<void>;
} {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  const client = postgres(url, { max: 1, prepare: false });
  const drizzle = drizzleClient(client, {
    schema: {
      conversions,
      reconciliationAuditEvents,
      reconciliationRuns,
      reconciliationRunCandidates,
    },
  });
  return {
    transaction<T>(
      fn: (tx: ReconciliationExecutorTx) => Promise<T>,
    ): Promise<T> {
      return drizzle.transaction(async (tx) => {
        return fn({
          execute: async (q) =>
            (await tx.execute(q as never)) as unknown,
          updateConversions: async (payload, where) =>
            (await tx
              .update(conversions)
              .set(payload)
              .where(where)
              .returning({ id: conversions.id })) as unknown,
        });
      });
    },
    execute: async (q) => (await drizzle.execute(q as never)) as unknown,
    closeAsync: async () => {
      await client.end({ timeout: 5 });
    },
  };
}

/**
 * Phase 20K checkpoint 4D2B -- immediate-return for a
 * request that did NOT acquire the run lifecycle.
 *
 * Closed outcomes:
 *   status = 'committing' -> in-progress; another request owns
 *                            the lifecycle. Return a
 *                            zero-applied / zero-skipped
 *                            result with the run id + scanned
 *                            row count. The caller observes
 *                            the same response shape as an
 *                            idempotent replay.
 *   status = 'committed'   -> already-committed idempotent
 *                            replay. Identical shape to a
 *                            same-run replay after a
 *                            successful first commit.
 *   anything else          -> fail closed; the only valid
 *                            transitions we expect to see
 *                            here are `committing` and
 *                            `committed`. A status of
 *                            `failed` here would mean the
 *                            previous attempt marked the run
 *                            failed and we have not yet
 *                            retried; this caller still
 *                            loses the race -- fail closed
 *                            with a typed error so the
 *                            caller can distinguish.
 *
 * The function performs ONLY a SELECT on the run row. It does
 * NOT touch any conversion, any audit row, any candidate row,
 * or any conversion lock. The run status is unchanged.
 */
async function returnImmediateLifecycleLoss(args: {
  readonly exec: ReconciliationExecutor;
  readonly runId: string;
  readonly committedAtIso: string;
  readonly candidateRows: ReadonlyArray<Record<string, unknown>>;
}): Promise<CommitReconciliationResult> {
  const rows = toRows(
    await args.exec.execute(sql`
      SELECT status FROM reconciliation_runs
      WHERE id = ${args.runId}::uuid
    `),
  );
  const currentStatus = String(rows[0]?.status ?? "");
  const summary = {
    scannedRows: args.candidateRows.length,
    applied: 0,
    skipped: 0,
    reject: 0,
    totals: {
      networkCommission: 0,
      userCashback: 0,
      platformProfit: 0,
    },
  };
  if (currentStatus === "committing" || currentStatus === "committed") {
    // In-progress or already-committed: idempotent return.
    //
    // Phase 20K checkpoint 4J2-B -- the caller must receive a
    // deterministic representation of the idempotent result so
    // the integration test (BLK B, BLK 4) can observe exactly
    // one skipped entry per candidate carrying
    //   { conversionId, reasonCode: "rejected_duplicate_conversion",
    //     idempotentReplay: true }
    // instead of an empty `skipped` array. The durable boundary
    // is unchanged: no second transition, no second audit event,
    // no second candidate UPDATE -- the loser / replay caller
    // observes the idempotent result, performs zero candidate
    // work, and exits.
    const skipped: Array<{
      readonly conversionId: string;
      readonly reasonCode: string;
      readonly idempotentReplay?: boolean;
    }> = [];
    for (const cr of args.candidateRows) {
      if (cr.conversion_id === null || cr.conversion_id === undefined) {
        continue;
      }
      skipped.push({
        conversionId: String(cr.conversion_id),
        reasonCode: "rejected_duplicate_conversion",
        idempotentReplay: true,
      });
    }
    return {
      summary: { ...summary, skipped: skipped.length },
      applied: [],
      skipped,
      committedAt: args.committedAtIso,
      scannedRowCount: args.candidateRows.length,
      reconciliationRunId: args.runId,
    };
  }
  // Anything else (including 'failed', 'superseded', or a
  // missing row) is a closed failure for this caller. The
  // run may legitimately be in 'failed' (the previous
  // attempt failed before this caller observed it) or in
  // some other unsupported terminal state; this caller did
  // not acquire the lifecycle so it MUST NOT proceed.
  throw new Error(
    "reconciliation.repository: commit acquire failed and current run status '" +
      currentStatus +
      "' is unsupported for an immediate-return (expected 'committing' or 'committed'); refusing to process candidates without lifecycle ownership",
  );
}

type PlannedCommitMoney = Readonly<{
  networkCommission: number;
  userCashback: number;
  platformProfit: number;
}>;

interface PlannedCommitCandidateBase {
  readonly candidateId: string;
  readonly conversionId: string;
  readonly sourceConversionKey: string;
  readonly expectedPrevious: ConversionStatus;
  readonly intendedNext: ConversionStatus;
  readonly reasonCode: string;
  readonly plannedIdempotencyKey: string;
  readonly plannedMoney: PlannedCommitMoney;
  readonly plannedCashbackShareBps: number | null;
}

interface PlannedCommitSkip extends PlannedCommitCandidateBase {
  readonly kind: "skip";
  readonly processingOutcome:
    | "failed"
    | "skipped/blocked"
    | "skipped/idempotent"
    | "skipped/stale";
  readonly processingReasonCode: string;
  readonly idempotentReplay?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ClassifiedCommitAudit extends PlannedCommitCandidateBase {
  readonly kind: "audit";
  readonly decisionKind: "approve" | "reject";
}

type ClassifiedCommitOutcome = PlannedCommitSkip | ClassifiedCommitAudit;

function buildPlannedCommitBase(
  candidateRow: Record<string, unknown>,
): PlannedCommitCandidateBase {
  return Object.freeze({
    candidateId: String(candidateRow.id),
    conversionId: String(candidateRow.conversion_id),
    sourceConversionKey: String(candidateRow.source_conversion_key ?? ""),
    expectedPrevious: parseStatus(
      String(candidateRow.expected_previous_status),
    ),
    intendedNext: parseStatus(String(candidateRow.intended_next_status)),
    reasonCode: String(candidateRow.planned_reason_code),
    plannedIdempotencyKey: String(candidateRow.planned_idempotency_key),
    plannedCashbackShareBps: parseCashbackShareBps(
      candidateRow.planned_cashback_share_bps,
    ),
    plannedMoney: Object.freeze({
      networkCommission: parseCommission(
        candidateRow.planned_money_network_commission as
          | string
          | number
          | null,
      ),
      userCashback: parseCommission(
        candidateRow.planned_money_user_cashback as string | number | null,
      ),
      platformProfit: parseCommission(
        candidateRow.planned_money_platform_profit as string | number | null,
      ),
    }),
  });
}

function plannedSkip(
  base: PlannedCommitCandidateBase,
  processingOutcome: PlannedCommitSkip["processingOutcome"],
  processingReasonCode: string,
  options?: Pick<PlannedCommitSkip, "idempotentReplay" | "metadata">,
): PlannedCommitSkip {
  return Object.freeze({
    ...base,
    kind: "skip",
    processingOutcome,
    processingReasonCode,
    ...(options?.idempotentReplay
      ? { idempotentReplay: true as const }
      : {}),
    ...(options?.metadata ? { metadata: options.metadata } : {}),
  });
}

async function classifyPlannedCommitCandidate(args: {
  readonly tx: ReconciliationExecutorTx;
  readonly candidateRow: Record<string, unknown>;
  readonly runNetwork: ReconciliationNetwork;
  readonly runPolicyVersion: number;
}): Promise<ClassifiedCommitOutcome> {
  const base = buildPlannedCommitBase(args.candidateRow);
  if (base.intendedNext === "paid") {
    return plannedSkip(
      base,
      "failed",
      "rejected_paid_out_of_phase_20k_scope",
    );
  }
  if (
    base.expectedPrevious === "rejected" ||
    base.expectedPrevious === "paid"
  ) {
    return plannedSkip(base, "failed", "rejected_terminal_state");
  }

  const lockedRows = toRows(
    await args.tx.execute(sql`
      SELECT id, status, network, network_commission::text AS network_commission,
             cashback_share_bps_snapshot,
             user_cashback::text AS user_cashback,
             platform_profit::text AS platform_profit,
             validation_status, settlement_status,
             source_conversion_key, ingestion_event_id,
             publisher_id, tracking_link_id, occurred_at
      FROM conversions
      WHERE id = ${base.conversionId}::uuid
      FOR UPDATE
    `),
  );
  if (lockedRows.length === 0) {
    return plannedSkip(base, "failed", "rejected_source_not_ready");
  }
  const lockedRow = lockedRows[0]!;

  const existingClaimRows = toRows(
    await args.tx.execute(sql`
      SELECT id FROM reconciliation_audit_events
      WHERE run_candidate_id = ${base.candidateId}::uuid
      LIMIT 1
    `),
  );
  if (existingClaimRows.length > 0) {
    return plannedSkip(
      base,
      "skipped/idempotent",
      "rejected_duplicate_conversion",
      { idempotentReplay: true },
    );
  }

  const currentDbStatus = parseStatus(String(lockedRow.status));
  assertCanTransition(base.expectedPrevious, base.intendedNext);
  if (base.intendedNext === "payable") {
    return plannedSkip(
      base,
      "skipped/blocked",
      "rejected_unverified_settlement_evidence",
      { metadata: { driftReason: "unverified_settlement_evidence" } },
    );
  }

  const liveEvidence = await loadSourceEvidenceInTxAsync(args.tx, [
    base.conversionId,
  ]);
  const live = liveEvidence.get(base.conversionId);
  if (!live) {
    return plannedSkip(base, "failed", "rejected_source_status_unknown");
  }
  if (
    (live.sourceStatus === "cancelled" || live.sourceStatus === "refunded") &&
    base.intendedNext !== "rejected"
  ) {
    return plannedSkip(
      base,
      "skipped/stale",
      "rejected_stale_source_evidence",
      { metadata: { driftReason: "stale_source_status" } },
    );
  }

  const liveEvidenceForDiff: CommitLiveEvidence = {
    conversionId: base.conversionId,
    currentStatus: currentDbStatus,
    network: String(lockedRow.network ?? ""),
    sourceConversionKey:
      lockedRow.source_conversion_key === null ||
      lockedRow.source_conversion_key === undefined
        ? null
        : String(lockedRow.source_conversion_key),
    ingestionEventId:
      lockedRow.ingestion_event_id === null ||
      lockedRow.ingestion_event_id === undefined
        ? null
        : String(lockedRow.ingestion_event_id),
    validationStatus:
      lockedRow.validation_status === null ||
      lockedRow.validation_status === undefined
        ? null
        : String(lockedRow.validation_status),
    settlementStatus:
      lockedRow.settlement_status === null ||
      lockedRow.settlement_status === undefined
        ? null
        : String(lockedRow.settlement_status),
    sourceStatus: live.sourceStatus,
    persistedLinkKind: live.persistedLinkKind,
    publisherId:
      lockedRow.publisher_id === null || lockedRow.publisher_id === undefined
        ? null
        : String(lockedRow.publisher_id),
    trackingLinkId:
      lockedRow.tracking_link_id === null ||
      lockedRow.tracking_link_id === undefined
        ? null
        : String(lockedRow.tracking_link_id),
    csvRowIdentity:
      lockedRow.source_conversion_key === null ||
      lockedRow.source_conversion_key === undefined
        ? null
        : String(lockedRow.source_conversion_key),
    networkCommission: parseCommission(
      lockedRow.network_commission as string | number,
    ),
    cashbackShareBpsSnapshot: parseCashbackShareBps(
      lockedRow.cashback_share_bps_snapshot,
    ),
    userCashback: parseCommission(
      lockedRow.user_cashback as string | number | null,
    ),
    platformProfit: parseCommission(
      lockedRow.platform_profit as string | number | null,
    ),
  };
  const persistedPlan: CommitPlanSnapshot = {
    conversionId: base.conversionId,
    network: args.runNetwork,
    expectedPreviousStatus: base.expectedPrevious,
    intendedNextStatus: base.intendedNext,
    sourceConversionKey: base.sourceConversionKey,
    plannedMoneyNetworkCommission: base.plannedMoney.networkCommission,
    plannedCashbackShareBps: base.plannedCashbackShareBps,
    plannedMoneyUserCashback: base.plannedMoney.userCashback,
    plannedMoneyPlatformProfit: base.plannedMoney.platformProfit,
    plannedIdempotencyKey: base.plannedIdempotencyKey,
    provenanceFingerprint: String(
      args.candidateRow.provenance_fingerprint ?? "",
    ),
    policyVersion: args.runPolicyVersion,
  };
  const revalidation = compareLiveEvidenceAgainstPlan(
    liveEvidenceForDiff,
    persistedPlan,
  );
  if (isCommitRevalidationStale(revalidation)) {
    return plannedSkip(
      base,
      "skipped/stale",
      "rejected_stale_source_evidence",
      { metadata: { driftReason: staleReasonFor(revalidation) } },
    );
  }

  return Object.freeze({
    ...base,
    kind: "audit" as const,
    decisionKind:
      base.intendedNext === "approved" ? ("approve" as const) : ("reject" as const),
  });
}

interface CommitIdentifierPlanPreflight {
  readonly auditIdByCandidate: Readonly<Record<string, string>>;
}

const FINALIZATION_FAILURE_REASON = "reconciliation_finalization_failed";

function sanitizedFinalizationFailure(
  code: "finalization_operation_failed" | "finalization_recovery_failed",
): Error {
  return new Error("reconciliation.repository: " + code);
}

function combinedFinalizationRecoveryError(): AggregateError {
  return new AggregateError(
    [
      sanitizedFinalizationFailure("finalization_operation_failed"),
      sanitizedFinalizationFailure("finalization_recovery_failed"),
    ],
    "reconciliation.repository: finalization recovery failed",
  );
}

async function loadExactRunStatusAsync(
  exec: ReconciliationExecutor,
  runId: string,
): Promise<string> {
  const rows = toRows(
    await exec.execute(sql`
      SELECT status FROM reconciliation_runs
      WHERE id = ${runId}::uuid
    `),
  );
  if (rows.length !== 1) {
    throw new Error("reconciliation.repository: finalization run state unavailable");
  }
  return String(rows[0]!.status);
}

async function recoverFinalizationFailureAsync(args: {
  readonly exec: ReconciliationExecutor;
  readonly runId: string;
  readonly failedAtIso: string;
  readonly finalizationError: unknown;
}): Promise<"committed"> {
  let status: string;
  try {
    status = await loadExactRunStatusAsync(args.exec, args.runId);
  } catch {
    throw combinedFinalizationRecoveryError();
  }

  if (status === "committed") return "committed";
  if (status === "failed") throw args.finalizationError;
  if (status !== "committing") {
    throw combinedFinalizationRecoveryError();
  }

  let recoveredRows: Array<Record<string, unknown>>;
  try {
    recoveredRows = toRows(
      await args.exec.execute(sql`
        UPDATE reconciliation_runs
        SET status = 'failed',
            failed_at = ${args.failedAtIso}::timestamptz,
            failed_reason = ${FINALIZATION_FAILURE_REASON}::text
        WHERE id = ${args.runId}::uuid
          AND status = 'committing'
        RETURNING id
      `),
    );
  } catch {
    throw combinedFinalizationRecoveryError();
  }

  if (recoveredRows.length === 1) throw args.finalizationError;
  if (recoveredRows.length > 1) {
    throw combinedFinalizationRecoveryError();
  }

  try {
    status = await loadExactRunStatusAsync(args.exec, args.runId);
  } catch {
    throw combinedFinalizationRecoveryError();
  }
  if (status === "committed") return "committed";
  if (status === "failed") throw args.finalizationError;
  throw combinedFinalizationRecoveryError();
}

function immutableAuditIdLookup(
  identifiers: readonly CommitReconciliationAuditIdentifier[],
): Readonly<Record<string, string>> {
  const lookup = Object.create(null) as Record<string, string>;
  for (const identifier of identifiers) {
    lookup[identifier.runCandidateId] = identifier.auditEventId;
  }
  return Object.freeze(lookup);
}

async function preflightCommitIdentifierPlanAsync(
  input: CommitReconciliationInput,
  exec: ReconciliationExecutor,
  validatedIdentifierPlan: ValidatedCommitReconciliationIdentifierPlan,
): Promise<CommitIdentifierPlanPreflight> {
  return exec.transaction(async (tx) => {
    const runRows = toRows(
      await tx.execute(sql`
        SELECT id, network, status, policy_version
        FROM reconciliation_runs
        WHERE id = ${input.reconciliationRunId}::uuid
        FOR UPDATE
      `),
    );
    if (runRows.length === 0) {
      throw new Error("reconciliation.repository: reconciliationRunId not found");
    }
    const runRow = runRows[0]!;
    const runNetwork = String(runRow.network);
    if (
      !ALLOWED_RECONCILIATION_NETWORKS.includes(
        runNetwork as ReconciliationNetwork,
      )
    ) {
      throw new Error("reconciliation.repository: run network is not allowed");
    }

    const candidateRows = toRows(
      await tx.execute(sql`
        SELECT
          id,
          conversion_id,
          network,
          source_conversion_key,
          expected_previous_status,
          intended_next_status,
          planned_reason_code,
          planned_money_network_commission::text AS planned_money_network_commission,
          planned_cashback_share_bps,
          planned_money_user_cashback::text AS planned_money_user_cashback,
          planned_money_platform_profit::text AS planned_money_platform_profit,
          planned_idempotency_key,
          provenance_fingerprint,
          processing_outcome
        FROM reconciliation_run_candidates
        WHERE run_id = ${input.reconciliationRunId}::uuid
        ORDER BY created_at ASC, id ASC
        FOR UPDATE
      `),
    );

    const runStatus = String(runRow.status);
    if (runStatus === "committed" || runStatus === "committing") {
      resolveCommitReconciliationIdentifierPlan(validatedIdentifierPlan, []);
      return Object.freeze({
        auditIdByCandidate: immutableAuditIdLookup([]),
      });
    }
    if (runStatus === "superseded") {
      throw new Error(
        "reconciliation.repository: run is in terminal 'superseded' state and cannot be committed",
      );
    }
    if (runStatus !== "draft" && runStatus !== "failed") {
      throw new Error("reconciliation.repository: unsupported run status");
    }

    const runPolicyVersion =
      runRow.policy_version === null || runRow.policy_version === undefined
        ? RECONCILIATION_POLICY_VERSION
        : Number(runRow.policy_version);
    const pendingCandidateRows = candidateRows.filter(
      (row) => String(row.processing_outcome ?? "pending") === "pending",
    );
    const classified: ClassifiedCommitOutcome[] = [];
    for (const candidateRow of pendingCandidateRows) {
      classified.push(
        await classifyPlannedCommitCandidate({
          tx,
          candidateRow,
          runNetwork: runNetwork as ReconciliationNetwork,
          runPolicyVersion,
        }),
      );
    }

    const auditProducingCandidateIds = classified
      .filter(
        (outcome): outcome is ClassifiedCommitAudit =>
          outcome.kind === "audit",
      )
      .map((outcome) => outcome.candidateId);
    const resolvedAuditIdentifiers =
      resolveCommitReconciliationIdentifierPlan(
        validatedIdentifierPlan,
        auditProducingCandidateIds,
      ) ?? [];

    return Object.freeze({
      auditIdByCandidate: immutableAuditIdLookup(resolvedAuditIdentifiers),
    });
  });
}

/**
 * Commit: accept only a server-generated reconciliationRunId.
 * Reload the run + candidates the dry-run persisted.
 *
 * Phase 20K checkpoint 4D2 -- durable, resumable run lifecycle
 * with per-candidate processing outcomes.
 *
 * The closed lifecycle is:
 *
 *   draft        -> committing      (committed_by acquisition,
 *                                    atomic compare-and-set)
 *   committing   -> committed       (finalize, only when every
 *                                    persisted candidate has a
 *                                    non-`pending` outcome)
 *   committing   -> failed          (any unhandled per-candidate
 *                                    throw; recorded reason)
 *   failed       -> committing      (retry transition, recorded
 *                                    reason cleared)
 *
 * Per-candidate invariants preserved by the existing per-
 * candidate sub-transaction:
 *
 *   1. SELECT FOR UPDATE on the conversion row.
 *   2. Verify expected current status + source evidence.
 *   3. INSERT INTO reconciliation_audit_events ... ON CONFLICT
 *      (run_candidate_id) DO NOTHING RETURNING id.
 *   4. If RETURNING is blank: idempotent replay -- do not UPDATE.
 *   5. If RETURNING has a row: UPDATE conversion with
 *      expected-status predicate.
 *   6. If UPDATE returns zero rows: throw so the transaction
 *      rolls back the audit row too.
 *
 * Step 7 -- 4D2: every terminal branch (skip or apply) MUST
 * persist the candidate's `processing_outcome` ATOMICALLY with
 * the conversion mutation (or skip decision) inside the same
 * sub-transaction. The run-level `committing -> committed`
 * transition fires only after every persisted candidate has a
 * non-`pending` outcome.
 */
export async function commitReconciliationAsync(
  input: CommitReconciliationInput,
  /**
   * Phase 20K follow-up 4 -- dependency injection seam for
   * production-path concurrency tests. Defaults to the shared
   * `db` executor.
   */
  executor?: ReconciliationExecutor,
): Promise<CommitReconciliationResult> {
  if (!UUID_PATTERN.test(input.reconciliationRunId)) {
    throw new Error(
      "reconciliation.repository: reconciliationRunId must be a UUID",
    );
  }
  const validatedIdentifierPlan =
    validateCommitReconciliationIdentifierPlan(input.identifierPlan);
  const actor: ReconciliationActor = buildReconciliationAdminActor({
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
  });
  const exec =
    executor ?? buildDefaultExecutor(await loadDefaultDatabase());
  const plannedAuditIdByCandidate =
    validatedIdentifierPlan === undefined
      ? undefined
      : (
          await preflightCommitIdentifierPlanAsync(
            input,
            exec,
            validatedIdentifierPlan,
          )
        ).auditIdByCandidate;

  const committedAt = new Date();
  const committedAtIso = committedAt.toISOString();
  const applied: Array<RunScopePlannedApply | RunScopePlannedReject> = [];
  const skipped: Array<{
    conversionId: string;
    reasonCode: string;
    idempotentReplay?: boolean;
    metadata?: Readonly<Record<string, unknown>>;
  }> = [];

  const runRows = toRows(
    await exec.execute(sql`
      SELECT id, network, status, policy_version
      FROM reconciliation_runs
      WHERE id = ${input.reconciliationRunId}::uuid
    `),
  );
  if (runRows.length === 0) {
    throw new Error(
      "reconciliation.repository: reconciliationRunId not found",
    );
  }
  const runRow = runRows[0]!;
  const runNetwork = String(runRow.network);
  const runPolicyVersion =
    runRow.policy_version === null || runRow.policy_version === undefined
      ? RECONCILIATION_POLICY_VERSION
      : Number(runRow.policy_version);
  if (!ALLOWED_RECONCILIATION_NETWORKS.includes(runNetwork as ReconciliationNetwork)) {
    throw new Error(
      "reconciliation.repository: run network '" + runNetwork + "' is not allowed",
    );
  }

  const candidateRows = toRows(
    await exec.execute(sql`
      SELECT
        id,
        conversion_id,
        network,
        source_conversion_key,
        expected_previous_status,
        intended_next_status,
        planned_reason_code,
        planned_money_network_commission::text AS planned_money_network_commission,
        planned_cashback_share_bps,
        planned_money_user_cashback::text AS planned_money_user_cashback,
        planned_money_platform_profit::text AS planned_money_platform_profit,
        planned_idempotency_key,
        provenance_fingerprint
      FROM reconciliation_run_candidates
      WHERE run_id = ${input.reconciliationRunId}::uuid
      ORDER BY created_at ASC, id ASC
    `),
  );
  // Phase 20K checkpoint 4D2 -- load the durable outcome for
  // every persisted candidate so the loop can skip already-
  // terminal candidates on resume / idempotent replay. The
  // `processing_outcome` column is the boundary that makes the
  // run lifecycle resumable: a candidate that landed with
  // outcome `applied`, `skipped/idempotent`, `skipped/stale`,
  // or `failed` from a previous attempt is never reprocessed.
  const candidateOutcomes = new Map<string, string>();
  for (const cr of candidateRows) {
    candidateOutcomes.set(String(cr.id), "pending");
  }
  const persistedOutcomeRows = toRows(
    await exec.execute(sql`
      SELECT id::text AS id, processing_outcome
      FROM reconciliation_run_candidates
      WHERE run_id = ${input.reconciliationRunId}::uuid
    `),
  );
  for (const r of persistedOutcomeRows) {
    candidateOutcomes.set(String(r.id), String(r.processing_outcome));
  }

  // Phase 20K checkpoint 4D2C -- resume boundary.
  //
  // When the run is being retried after a failure, only
  // candidates whose durable `processing_outcome` is still
  // `pending` may enter the production candidate-processing
  // transaction. Candidates that already landed with a
  // terminal outcome (`applied`, `skipped/idempotent`,
  // `skipped/stale`, `failed`) are partitioned out here so
  // the loop performs zero work on them: no `SELECT FOR
  // UPDATE` on the conversion row, no source-evidence reload,
  // no audit-claim attempt, no conversion UPDATE, no
  // candidate-outcome rewrite.
  //
  // The persisted outcomes are still observable via the
  // `reconciliation_run_candidates` table and via the durable
  // audit rows. We pre-accumulate the planned money totals
  // from already-`applied` completed candidates below so the
  // summary's totals reflect the run's cumulative state, not
  // only what this attempt processed.
  const pendingCandidateRows: typeof candidateRows = [];
  const completedCandidateRows: typeof candidateRows = [];
  for (const cr of candidateRows) {
    const id = String(cr.id);
    const outcome = candidateOutcomes.get(id) ?? "pending";
    if (outcome === "pending") {
      pendingCandidateRows.push(cr);
    } else {
      completedCandidateRows.push(cr);
    }
  }

  // Phase 20K checkpoint 4D2 -- run lifecycle acquisition.
  //
  // The lifecycle is acquired with an atomic compare-and-set so
  // two concurrent callers cannot both transition the same run
  // from `draft` to `committing`. A failed run may be retried by
  // transitioning `failed -> committing` (resume).
  const initialRunStatus = String(runRow.status);
  if (initialRunStatus === "committed") {
    // Idempotent replay: the run is already terminal-committed.
    // The durable state already reflects the completed commit
    // so no new transition / no new audit event / no new
    // candidate UPDATE is performed -- the partial UNIQUE index
    // on `reconciliation_audit_events.run_candidate_id` is the
    // boundary that enforces this. Phase 20K checkpoint 4J2-B:
    // the caller must still receive a deterministic
    // representation of the idempotent result so it can observe
    //   applied.length === 0
    //   skipped.find((s) => s.conversionId === id) ===
    //     { reasonCode: "rejected_duplicate_conversion",
    //       idempotentReplay: true }
    // mirroring the per-candidate replay contract that fires
    // inside the candidate-processing loop when an existing
    // audit claim is detected.
    const replaySkipped: Array<{
      readonly conversionId: string;
      readonly reasonCode: string;
      readonly idempotentReplay?: boolean;
    }> = [];
    for (const cr of candidateRows) {
      if (cr.conversion_id === null || cr.conversion_id === undefined) {
        continue;
      }
      replaySkipped.push({
        conversionId: String(cr.conversion_id),
        reasonCode: "rejected_duplicate_conversion",
        idempotentReplay: true,
      });
    }
    return {
      summary: {
        scannedRows: candidateRows.length,
        applied: 0,
        skipped: replaySkipped.length,
        reject: 0,
        totals: {
          networkCommission: 0,
          userCashback: 0,
          platformProfit: 0,
        },
      },
      applied: [],
      skipped: replaySkipped,
      committedAt: committedAtIso,
      scannedRowCount: candidateRows.length,
      reconciliationRunId: input.reconciliationRunId,
    };
  }
  if (initialRunStatus === "superseded") {
    throw new Error(
      "reconciliation.repository: run is in terminal 'superseded' state and cannot be committed",
    );
  }
  // Phase 20K checkpoint 4D2B -- lifecycle ownership boundary.
  //
  // The run-acquisition UPDATE is the durable compare-and-set
  // that determines which concurrent request owns the
  // lifecycle. A request whose UPDATE returns zero rows has
  // NOT acquired the lifecycle and MUST return immediately --
  // it must not enter the candidate-processing loop, must not
  // attempt any FOR UPDATE, must not write any candidate
  // outcome, and must not write any audit row. Relying on
  // the audit-claim UNIQUE index to stop the loser is
  // unacceptable for this checkpoint: the loser would still
  // execute the per-candidate sub-transactions, holding
  // conversion locks and reloading source evidence.
  //
  // The closed branches are:
  //   * 1 row returned  -> this caller OWNS the lifecycle.
  //                        Proceed to the candidate loop.
  //   * 0 rows returned -> this caller did NOT acquire the
  //                        lifecycle. Reload the current run
  //                        status and return immediately with
  //                        a closed shape:
  //                          status = 'committing' -> in-progress
  //                          status = 'committed'   -> idempotent replay
  //                          anything else         -> fail closed.
  if (initialRunStatus === "draft") {
    // Compare-and-set: draft -> committing.
    const acquiredRows = toRows(
      await exec.execute(sql`
        UPDATE reconciliation_runs
        SET status = 'committing',
            failed_at = NULL,
            failed_reason = NULL
        WHERE id = ${input.reconciliationRunId}::uuid
          AND status = 'draft'
        RETURNING id
      `),
    );
    if (acquiredRows.length === 0) {
      return await returnImmediateLifecycleLoss({
        exec,
        runId: input.reconciliationRunId,
        committedAtIso,
        candidateRows,
      });
    }
  } else if (initialRunStatus === "failed") {
    // Phase 20K checkpoint 4D2 -- resume a failed run.
    // Compare-and-set: failed -> committing.
    const retryRows = toRows(
      await exec.execute(sql`
        UPDATE reconciliation_runs
        SET status = 'committing',
            failed_at = NULL,
            failed_reason = NULL
        WHERE id = ${input.reconciliationRunId}::uuid
          AND status = 'failed'
        RETURNING id
      `),
    );
    if (retryRows.length === 0) {
      return await returnImmediateLifecycleLoss({
        exec,
        runId: input.reconciliationRunId,
        committedAtIso,
        candidateRows,
      });
    }
  } else if (initialRunStatus === "committing") {
    // Resume path -- another request already holds the
    // lifecycle. Per the 4D2B contract, this is an
    // immediate-return: do NOT enter the candidate loop.
    return await returnImmediateLifecycleLoss({
      exec,
      runId: input.reconciliationRunId,
      committedAtIso,
      candidateRows,
    });
  }

  // Phase 20K checkpoint 4D2 -- wrap the per-candidate loop
  // in a try/catch so an unhandled per-candidate throw
  // transitions the run to `failed` (NEVER leaves it in
  // `draft`, NEVER moves it to `committed`).
  try {
  for (const candidateRow of pendingCandidateRows) {
    const candidateId = String(candidateRow.id);
    const conversionId = String(candidateRow.conversion_id);
    const expectedPrevious = parseStatus(
      String(candidateRow.expected_previous_status),
    );
    const intendedNext = parseStatus(String(candidateRow.intended_next_status));
    if (intendedNext === "paid") {
      // Phase 20K checkpoint 4D2 -- persist the durable
      // `processing_outcome` for this terminal-by-phase-guard
      // skip so a later resume does not redo the guard and
      // the run-level finalization can see it.
      await exec.execute(sql`
        UPDATE reconciliation_run_candidates
        SET processing_outcome = 'failed',
            processing_completed_at = ${committedAtIso}::timestamptz,
            processing_reason_code = 'rejected_paid_out_of_phase_20k_scope'::text
        WHERE id = ${candidateId}::uuid
          AND processing_outcome = 'pending'
      `);
      skipped.push({
        conversionId,
        reasonCode: "rejected_paid_out_of_phase_20k_scope",
      });
      continue;
    }
    // `rejected` is a VALID intended_next_status for transitions
    // such as pending -> rejected (or approved -> rejected) when
    // the source evidence is cancelled / refunded / invalid.
    // Only a row whose expected previous status is already
    // `rejected` (or `paid`) is terminal and must be skipped.
    if (expectedPrevious === "rejected" || expectedPrevious === "paid") {
      // Phase 20K checkpoint 4D2 -- see above.
      await exec.execute(sql`
        UPDATE reconciliation_run_candidates
        SET processing_outcome = 'failed',
            processing_completed_at = ${committedAtIso}::timestamptz,
            processing_reason_code = 'rejected_terminal_state'::text
        WHERE id = ${candidateId}::uuid
          AND processing_outcome = 'pending'
      `);
      skipped.push({
        conversionId,
        reasonCode: "rejected_terminal_state",
      });
      continue;
    }
    const plannedMoney = {
      networkCommission: parseCommission(
        candidateRow.planned_money_network_commission as string | number | null,
      ),
      userCashback: parseCommission(
        candidateRow.planned_money_user_cashback as string | number | null,
      ),
      platformProfit: parseCommission(
        candidateRow.planned_money_platform_profit as string | number | null,
      ),
    };
    const plannedCashbackShareBps = parseCashbackShareBps(
      candidateRow.planned_cashback_share_bps,
    );
    const decisionKind =
      intendedNext === "approved"
        ? "approve"
        : intendedNext === "payable"
          ? "mark_payable"
          : "reject";
    const plannedIdempotencyKey = String(candidateRow.planned_idempotency_key);
    const reasonCode = String(candidateRow.planned_reason_code);

    try {
      await exec.transaction(async (tx) => {
        // Phase 20K follow-up 4 -- serialization boundary fix.
        //
        // The follow-up 2 implementation checked the existing
        // audit claim BEFORE taking the FOR UPDATE lock. Two
        // concurrent clients racing the same run id could both
        // see "no claim" and both proceed to INSERT, leaving the
        // second one to crash on the unique-key violation.
        //
        // The fix is the same-race-boundary sequence used by
        // every other money-safety step in Phase 20K:
        //
        //   1. SELECT FOR UPDATE on the conversion row first.
        //      Postgres serializes the two clients: only one
        //      reaches step 2 at a time.
        //   2. SELECT for an existing audit claim by run_candidate_id.
        //      If found, the prior commit consumed the slot; this
        //      request is an idempotent replay -- bail without
        //      mutating.
        //   3. INSERT ... ON CONFLICT DO NOTHING RETURNING id.
        //      Because the claim check happened AFTER the FOR
        //      UPDATE lock, two truly concurrent requests can no
        //      longer both reach step 3; the loser sees step 2 as
        //      "claim exists".
        //   4. UPDATE conversion with expected-status predicate.
        //
        // The run-status lifecycle is owned by the OUTER
        // commit path (acquisition + finalization), not by
        // this per-candidate sub-transaction. Keeping the
        // run-status UPDATEs out of this sub-tx ensures that
        // a single per-candidate failure does not prematurely
        // commit or fail the run.

        const lockedRows = toRows(
          await tx.execute(sql`
            SELECT id, status, network, network_commission::text AS network_commission,
                   cashback_share_bps_snapshot,
                   user_cashback::text AS user_cashback,
                   platform_profit::text AS platform_profit,
                   validation_status, settlement_status,
                   source_conversion_key, ingestion_event_id,
                   publisher_id, tracking_link_id, occurred_at
            FROM conversions
            WHERE id = ${conversionId}::uuid
            FOR UPDATE
          `),
        );
        if (lockedRows.length === 0) {
          // Phase 20K checkpoint 4D2 -- persist outcome.
          await tx.execute(sql`
            UPDATE reconciliation_run_candidates
            SET processing_outcome = 'failed',
                processing_completed_at = ${committedAtIso}::timestamptz,
                processing_reason_code = 'rejected_source_not_ready'::text
            WHERE id = ${candidateId}::uuid
              AND processing_outcome = 'pending'
          `);
          skipped.push({
            conversionId,
            reasonCode: "rejected_source_not_ready",
          });
          return;
        }
        const lockedRow = lockedRows[0]!;

        // Phase 20K follow-up 4 -- claim check AFTER FOR UPDATE.
        //
        // The existing audit claim is the durable boundary for
        // "this run already produced its event for this
        // candidate". Once we hold the conversion lock, only one
        // transaction at a time can reach this branch. We check
        // the claim BEFORE the expectedPrevious check so a same
        // run replay returns `rejected_duplicate_conversion`
        // (idempotent), not `rejected_terminal_state`. The
        // conversion's status has legitimately advanced since the
        // first commit; reporting "terminal state" would mislead
        // the operator.
        const existingClaimRows = toRows(
          await tx.execute(sql`
            SELECT id FROM reconciliation_audit_events
            WHERE run_candidate_id = ${candidateId}::uuid
            LIMIT 1
          `),
        );
        if (existingClaimRows.length > 0) {
          // Phase 20K checkpoint 4D2 -- persist outcome.
          await tx.execute(sql`
            UPDATE reconciliation_run_candidates
            SET processing_outcome = 'skipped/idempotent',
                processing_completed_at = ${committedAtIso}::timestamptz,
                processing_reason_code = 'rejected_duplicate_conversion'::text
            WHERE id = ${candidateId}::uuid
              AND processing_outcome = 'pending'
          `);
          skipped.push({
            conversionId,
            reasonCode: "rejected_duplicate_conversion",
            idempotentReplay: true,
          });
          return;
        }

        const currentDbStatus = parseStatus(String(lockedRow.status));
        // Phase 20K checkpoint 4B4 -- the legacy
        // `currentDbStatus !== expectedPrevious` shortcut was
        // REMOVED. That gate fired BEFORE the 4B revalidation
        // block and short-circuited any persisted-run
        // expected-status mismatch with `rejected_terminal_state`,
        // which is the WRONG closed reason for a run candidate:
        // a status flip between dry-run and commit is stale RUN
        // evidence (the plan was correct when recorded, the live
        // row drifted underneath it), not a fresh lifecycle
        // decision. The 4B revalidation block below compares
        // `live.currentStatus` against `plan.expectedPreviousStatus`
        // via `compareLiveEvidenceAgainstPlan`, which returns
        // `{ kind: "stale", reason: "stale_current_status" }` and
        // surfaces it as
        //   reasonCode: "rejected_stale_source_evidence"
        //   metadata:  { driftReason: "stale_current_status" }
        // before any audit-claim INSERT or conversion UPDATE.
        //
        // The same-run idempotency contract is preserved because
        // the audit-claim check above (the
        // `existingClaimRows.length > 0` branch) still fires
        // BEFORE this point and returns
        // `rejected_duplicate_conversion` for a replay whose
        // audit row already exists. The state machine is also
        // preserved: `assertCanTransition` is still called below
        // for the legitimate `expectedPrevious -> intendedNext`
        // edge, and no invalid transition can be applied
        // because the revalidation block returns BEFORE that
        // call whenever status drift is detected.
        assertCanTransition(expectedPrevious, intendedNext);

        // Phase 20K checkpoint 4F1B -- commit-time defense-in-
        // depth. The mapper refuses `approved -> payable`
        // unless a real upstream settlement producer has wired
        // the transition (which it has not -- see the Phase 20K
        // 4F1 inventory). This second-layer guard exists so an
        // OLD or MANUALLY-CRAFTED run candidate intending
        // `payable` cannot reach the audit-claim INSERT or the
        // conversion UPDATE, even if it somehow made it past
        // the dry-run / planner gate. Such a candidate is
        // treated as drift: skip with the distinct closed
        // reason code `rejected_unverified_settlement_evidence`,
        // surface the gate in the candidate's
        // `processing_reason_code` + `processing_outcome`, and
        // preserve the conversion row's `status`, `payable_at`,
        // and `paid_at` exactly as they were. Phase 20K
        // continues to forbid `payable -> paid` via the
        // mapper's terminal-state skip (reason code
        // `rejected_paid_out_of_phase_20k_scope`).
        if (intendedNext === "payable") {
          await tx.execute(sql`
            UPDATE reconciliation_run_candidates
            SET processing_outcome = 'skipped/blocked',
                processing_completed_at = ${committedAtIso}::timestamptz,
                processing_reason_code = 'rejected_unverified_settlement_evidence'::text
            WHERE id = ${candidateId}::uuid
              AND processing_outcome = 'pending'
          `);
          skipped.push({
            conversionId,
            reasonCode: "rejected_unverified_settlement_evidence",
            metadata: { driftReason: "unverified_settlement_evidence" },
          });
          return;
        }

        // Phase 20K checkpoint 4B -- commit-time source-evidence
        // revalidation.
        //
        // The dry-run planner persisted a candidate row in
        // `reconciliation_run_candidates` with a
        // `provenance_fingerprint`. Between dry-run and commit the
        // conversion row + its supporting source evidence may have
        // drifted (validation/settlement/order_status flipped,
        // tracking-link ownership moved, commission adjusted, the
        // 60/40 split recomputed to a different value, etc.).
        //
        // The contract is:
        //
        //   1. Lock the conversion row (already done via FOR UPDATE
        //      above).
        //   2. Reload the live source evidence + provenance through
        //      the transaction-scoped loader so the SELECT shares
        //      the same locked connection. Calling the default
        //      loader would deadlock against the singleton pool.
        //   3. Recompute the 60/40 money split from the live
        //      network_commission.
        //   4. Build a CommitLiveEvidence view that captures every
        //      field the planner recorded.
        //   5. Diff against the persisted plan via
        //      `compareLiveEvidenceAgainstPlan`. ANY drift -> skip
        //      with `rejected_stale_source_evidence`. The diff
        //      includes the rebuilt normalised fingerprint, so an
        //      upstream field flip that the planner saw as "ok" is
        //      caught here.
        //   6. Only on a clean match do we claim the audit row and
        //      UPDATE the conversion.
        const liveEvidence = await loadSourceEvidenceInTxAsync(tx, [conversionId]);
        const live = liveEvidence.get(conversionId);
        if (!live) {
          // Phase 20K checkpoint 4D2 -- persist outcome.
          await tx.execute(sql`
            UPDATE reconciliation_run_candidates
            SET processing_outcome = 'failed',
                processing_completed_at = ${committedAtIso}::timestamptz,
                processing_reason_code = 'rejected_source_status_unknown'::text
            WHERE id = ${candidateId}::uuid
              AND processing_outcome = 'pending'
          `);
          skipped.push({
            conversionId,
            reasonCode: "rejected_source_status_unknown",
          });
          return;
        }
        // Phase 20K checkpoint 4B1 -- explicit terminal-source
        // refusal. The plan-vs-live diff in
        // `compareLiveEvidenceAgainstPlan` also catches this via
        // the `stale_source_status` reason, but we duplicate the
        // check inline so a CANCELLED / REFUNDED source row can
        // NEVER advance to an APPROVED / PAYABLE status. The
        // transaction-scoped loader reads the committed
        // `shopee_csv_rows.order_status` value, so if the
        // dry-run planner saw an eligible row and the row
        // flipped to cancelled before commit, this is the
        // single-source-of-truth guard. A new dry-run is
        // required to re-plan from the current source state.
        //
        // Phase 20K checkpoint 4E1 -- exception for the
        // REJECTED path. A planned REJECTED transition is
        // anchored on a cancelled / refunded / invalid source
        // in the first place; the live `cancelled` /
        // `refunded` status is the durable evidence the
        // rejection plan was based on, NOT drift. The
        // per-candidate sub-transaction proceeds for the
        // reject path so the conversion UPDATE stamps
        // `status = 'rejected'`, `rejected_at`, and
        // `rejected_reason` and the audit-event INSERT lands
        // with `next_status = 'rejected'`. The revalidator
        // gate above has already confirmed the evidence
        // fingerprint is unchanged; the rejection itself
        // only mutates the conversion row.
        if (
          (live.sourceStatus === "cancelled" ||
            live.sourceStatus === "refunded") &&
          intendedNext !== "rejected"
        ) {
          // Phase 20K checkpoint 4D2 -- persist outcome.
          await tx.execute(sql`
            UPDATE reconciliation_run_candidates
            SET processing_outcome = 'skipped/stale',
                processing_completed_at = ${committedAtIso}::timestamptz,
                processing_reason_code = 'rejected_stale_source_evidence'::text
            WHERE id = ${candidateId}::uuid
              AND processing_outcome = 'pending'
          `);
          skipped.push({
            conversionId,
            reasonCode: "rejected_stale_source_evidence",
            metadata: { driftReason: "stale_source_status" },
          });
          return;
        }
        const liveNetworkCommission = parseCommission(
          lockedRow.network_commission as string | number,
        );
        const liveEvidenceForDiff: CommitLiveEvidence = {
          conversionId,
          currentStatus: currentDbStatus,
          network: String(lockedRow.network ?? ""),
          sourceConversionKey:
            lockedRow.source_conversion_key === null ||
            lockedRow.source_conversion_key === undefined
              ? null
              : String(lockedRow.source_conversion_key),
          ingestionEventId:
            lockedRow.ingestion_event_id === null ||
            lockedRow.ingestion_event_id === undefined
              ? null
              : String(lockedRow.ingestion_event_id),
          validationStatus:
            lockedRow.validation_status === null ||
            lockedRow.validation_status === undefined
              ? null
              : String(lockedRow.validation_status),
          settlementStatus:
            lockedRow.settlement_status === null ||
            lockedRow.settlement_status === undefined
              ? null
              : String(lockedRow.settlement_status),
          sourceStatus: live.sourceStatus,
          persistedLinkKind: live.persistedLinkKind,
          publisherId:
            lockedRow.publisher_id === null ||
            lockedRow.publisher_id === undefined
              ? null
              : String(lockedRow.publisher_id),
          trackingLinkId:
            lockedRow.tracking_link_id === null ||
            lockedRow.tracking_link_id === undefined
              ? null
              : String(lockedRow.tracking_link_id),
          csvRowIdentity:
            lockedRow.source_conversion_key === null ||
            lockedRow.source_conversion_key === undefined
              ? null
              : String(lockedRow.source_conversion_key),
          networkCommission: liveNetworkCommission,
          cashbackShareBpsSnapshot: parseCashbackShareBps(
            lockedRow.cashback_share_bps_snapshot,
          ),
          userCashback: parseCommission(
            lockedRow.user_cashback as string | number | null,
          ),
          platformProfit: parseCommission(
            lockedRow.platform_profit as string | number | null,
          ),
        };
        const persistedPlan: CommitPlanSnapshot = {
          conversionId,
          network: runNetwork as ReconciliationNetwork,
          expectedPreviousStatus: expectedPrevious,
          intendedNextStatus: intendedNext,
          sourceConversionKey: String(
            candidateRow.source_conversion_key ?? "",
          ),
          plannedMoneyNetworkCommission: plannedMoney.networkCommission,
          plannedCashbackShareBps,
          plannedMoneyUserCashback: plannedMoney.userCashback,
          plannedMoneyPlatformProfit: plannedMoney.platformProfit,
          plannedIdempotencyKey,
          provenanceFingerprint: String(
            candidateRow.provenance_fingerprint ?? "",
          ),
          policyVersion: runPolicyVersion,
        };
        const revalidation = compareLiveEvidenceAgainstPlan(
          liveEvidenceForDiff,
          persistedPlan,
        );
        if (isCommitRevalidationStale(revalidation)) {
          const driftReason = staleReasonFor(revalidation);
          // Phase 20K checkpoint 4B -- fail closed. Drift = skip +
          // typed closed reason. No mutation of conversion status,
          // no mutation of conversion money, no applied audit row.
          // The drift reason is surfaced only via the server-side
          // skip queue metadata; the buyer-facing UI never sees it.
          //
          // Phase 20K checkpoint 4D2 -- persist outcome.
          await tx.execute(sql`
            UPDATE reconciliation_run_candidates
            SET processing_outcome = 'skipped/stale',
                processing_completed_at = ${committedAtIso}::timestamptz,
                processing_reason_code = 'rejected_stale_source_evidence'::text
            WHERE id = ${candidateId}::uuid
              AND processing_outcome = 'pending'
          `);
          skipped.push({
            conversionId,
            reasonCode: "rejected_stale_source_evidence",
            metadata: { driftReason },
          });
          return;
        }
        if (plannedCashbackShareBps === null) {
          throw new Error(
            "reconciliation.repository: matched revalidation without cashback policy evidence",
          );
        }

        // Insert audit claim with ON CONFLICT DO NOTHING. The
        // partial UNIQUE index on
        // `reconciliation_audit_events.run_candidate_id` is the
        // durable boundary for "same run + same candidate
        // produces at most one applied audit event".
        const plannedAuditEventId =
          plannedAuditIdByCandidate?.[candidateId.toLowerCase()];
        if (
          plannedAuditIdByCandidate !== undefined &&
          plannedAuditEventId === undefined
        ) {
          throw new ReconciliationIdentifierPlanError(
            "missing_audit_identifier",
          );
        }
        const claimRows = toRows(
          plannedAuditEventId === undefined
            ? await tx.execute(sql`
                INSERT INTO reconciliation_audit_events (
                  network,
                  source_conversion_key,
                  idempotency_key,
                  conversion_id,
                  previous_status,
                  next_status,
                  decision,
                  reason_code,
                  human_reason,
                  network_commission,
                  cashback_share_bps_snapshot,
                  user_cashback,
                  platform_profit,
                  actor_kind,
                  actor_user_id,
                  actor_role,
                  reconciliation_run_id,
                  run_candidate_id
                ) VALUES (
                  ${runNetwork}::text,
                  ${String(candidateRow.source_conversion_key ?? "")}::text,
                  ${plannedIdempotencyKey}::text,
                  ${conversionId}::uuid,
                  ${expectedPrevious}::text,
                  ${intendedNext}::text,
                  ${decisionKind}::text,
                  ${reasonCode}::text,
                  ${reasonCode}::text,
                  ${plannedMoney.networkCommission}::bigint,
                  ${plannedCashbackShareBps}::integer,
                  ${plannedMoney.userCashback}::bigint,
                  ${plannedMoney.platformProfit}::bigint,
                  ${actor.actorKind}::text,
                  ${actor.actorUserId ?? null}::uuid,
                  ${actor.actorRole ?? null}::text,
                  ${input.reconciliationRunId}::uuid,
                  ${candidateId}::uuid
                )
                ON CONFLICT (run_candidate_id) WHERE run_candidate_id IS NOT NULL DO NOTHING
                RETURNING id
              `)
            : await tx.execute(sql`
                INSERT INTO reconciliation_audit_events (
                  id,
                  network,
                  source_conversion_key,
                  idempotency_key,
                  conversion_id,
                  previous_status,
                  next_status,
                  decision,
                  reason_code,
                  human_reason,
                  network_commission,
                  cashback_share_bps_snapshot,
                  user_cashback,
                  platform_profit,
                  actor_kind,
                  actor_user_id,
                  actor_role,
                  reconciliation_run_id,
                  run_candidate_id
                ) VALUES (
                  ${plannedAuditEventId}::uuid,
                  ${runNetwork}::text,
                  ${String(candidateRow.source_conversion_key ?? "")}::text,
                  ${plannedIdempotencyKey}::text,
                  ${conversionId}::uuid,
                  ${expectedPrevious}::text,
                  ${intendedNext}::text,
                  ${decisionKind}::text,
                  ${reasonCode}::text,
                  ${reasonCode}::text,
                  ${plannedMoney.networkCommission}::bigint,
                  ${plannedCashbackShareBps}::integer,
                  ${plannedMoney.userCashback}::bigint,
                  ${plannedMoney.platformProfit}::bigint,
                  ${actor.actorKind}::text,
                  ${actor.actorUserId ?? null}::uuid,
                  ${actor.actorRole ?? null}::text,
                  ${input.reconciliationRunId}::uuid,
                  ${candidateId}::uuid
                )
                ON CONFLICT (run_candidate_id) WHERE run_candidate_id IS NOT NULL DO NOTHING
                RETURNING id
              `),
        );
        if (plannedAuditEventId !== undefined && claimRows.length === 1) {
          assertReconciliationIdentifierResult(
            plannedAuditEventId,
            claimRows[0]?.id,
          );
        }
        if (claimRows.length === 0) {
          // A second concurrent client won the INSERT race --
          // their claim row landed first. The other client must
          // report idempotent replay and not UPDATE the
          // conversion.
          //
          // Phase 20K checkpoint 4D2 -- persist outcome.
          await tx.execute(sql`
            UPDATE reconciliation_run_candidates
            SET processing_outcome = 'skipped/idempotent',
                processing_completed_at = ${committedAtIso}::timestamptz,
                processing_reason_code = 'rejected_duplicate_conversion'::text
            WHERE id = ${candidateId}::uuid
              AND processing_outcome = 'pending'
          `);
          skipped.push({
            conversionId,
            reasonCode: "rejected_duplicate_conversion",
            idempotentReplay: true,
          });
          return;
        }
        // Apply the conversion UPDATE with the
        // expected-status predicate so a stale snapshot cannot
        // silently regress the row. Money is rewritten from the
        // authoritative recomputed split so an inconsistent
        // pre-existing split cannot survive a transition.
        const updatePayload: Partial<typeof conversions.$inferInsert> = {
          status: intendedNext,
          updatedAt: committedAt,
          networkCommission: plannedMoney.networkCommission,
          cashbackShareBpsSnapshot: plannedCashbackShareBps,
          userCashback: plannedMoney.userCashback,
          platformProfit: plannedMoney.platformProfit,
        };
        if (intendedNext === "approved") {
          (updatePayload as Record<string, unknown>).approvedAt = committedAt;
        }
        // Phase 20K 4F1B -- `intendedNext === "payable"` is
        // unreachable here: the gate at line 1759 returns the
        // sub-tx with `rejected_unverified_settlement_evidence`
        // for every payable candidate, so the update payload
        // branch above no longer needs to set `payable_at`.
        // Phase 20K continues to forbid `payable -> paid`
        // via the mapper's `currentStatus === "payable"` skip
        // and the engine's `intendedNext === "paid"` guard at
        // line 1547.
        if ((intendedNext as string) === "rejected") {
          (updatePayload as Record<string, unknown>).rejectedAt = committedAt;
          (updatePayload as Record<string, unknown>).rejectedReason =
            reasonCode;
        }
        const updated = (await tx.updateConversions(
          updatePayload,
          and(
            eq(conversions.id, conversionId),
            eq(conversions.status, expectedPrevious),
          ),
        )) as Array<{ id: string }>;
        if (updated.length === 0) {
          // Status drift between the FOR UPDATE check and the
          // UPDATE: the row advanced. Throw so the audit row we
          // just inserted rolls back too.
          throw new Error(
            "reconciliation.repository: conversion status drift for " +
              conversionId +
              "; expected " +
              expectedPrevious,
          );
        }

        // Phase 20K checkpoint 4D2 -- mark the candidate's
        // `processing_outcome = 'applied'` atomically with the
        // conversion UPDATE above. This is the durable record
        // the outer finalization step relies on to decide
        // whether the run may transition to `committed`.
        await tx.execute(sql`
          UPDATE reconciliation_run_candidates
          SET processing_outcome = 'applied',
              processing_completed_at = ${committedAtIso}::timestamptz,
              processing_reason_code = ${reasonCode}::text
          WHERE id = ${candidateId}::uuid
            AND processing_outcome = 'pending'
        `);

        recordAdminAction({
          kind: "admin.reconciliation.commit",
          actorUserId: actor.actorUserId ?? "",
          actorRole: actor.actorRole ?? "admin",
          targetType: "conversion",
          targetId: conversionId,
          metadata: {
            previousStatus: expectedPrevious,
            nextStatus: intendedNext,
            reasonCode,
            idempotencyKey: plannedIdempotencyKey,
            idempotencyKeyShort: plannedIdempotencyKey.slice(0, 16),
            reconciliationRunId: input.reconciliationRunId,
            runCandidateId: candidateId,
            networkCommission: plannedMoney.networkCommission,
            cashbackShareBpsSnapshot: plannedCashbackShareBps,
            userCashback: plannedMoney.userCashback,
            platformProfit: plannedMoney.platformProfit,
          },
        });

        if ((intendedNext as string) === "rejected") {
          applied.push({
            kind: "reject",
            conversionId,
            network: runNetwork as ReconciliationNetwork,
            sourceConversionKey: String(candidateRow.source_conversion_key ?? ""),
            previousStatus: expectedPrevious,
            nextStatus: "rejected",
            reasonCode: reasonCode as never,
            plannedMoneyNetworkCommission: plannedMoney.networkCommission,
            plannedCashbackShareBps,
            plannedMoneyUserCashback: plannedMoney.userCashback,
            plannedMoneyPlatformProfit: plannedMoney.platformProfit,
            plannedIdempotencyKey,
            provenanceFingerprint: "",
          });
        } else {
          applied.push({
            kind: "apply",
            conversionId,
            network: runNetwork as ReconciliationNetwork,
            sourceConversionKey: String(candidateRow.source_conversion_key ?? ""),
            previousStatus: expectedPrevious,
            nextStatus: intendedNext as Exclude<ConversionStatus, "paid">,
            reasonCode: reasonCode as never,
            plannedMoneyNetworkCommission: plannedMoney.networkCommission,
            plannedCashbackShareBps,
            plannedMoneyUserCashback: plannedMoney.userCashback,
            plannedMoneyPlatformProfit: plannedMoney.platformProfit,
            plannedIdempotencyKey,
            provenanceFingerprint: "",
          });
        }
        // Suppress unused-import warning: `assertNotPaid` is
        // exercised by the static-source safety test that scans
        // this file; calling it here would otherwise be dead
        // code at runtime.
        void assertNotPaid;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("rejected_duplicate_conversion") ||
        message.includes("idempotent")
      ) {
        // Phase 20K checkpoint 4D2 -- persist outcome on a
        // swallowed-idempotent error. The outcome was already
        // written inside the sub-tx by the `claimRows.length
        // === 0` branch in the normal path; this catch path
        // handles sub-tx aborts that raised the same
        // idempotent marker. Idempotent: optimistic no-op.
        await exec.execute(sql`
          UPDATE reconciliation_run_candidates
          SET processing_outcome = COALESCE(
            NULLIF(processing_outcome, 'pending'),
            'skipped/idempotent'
          ),
          processing_completed_at = COALESCE(
            processing_completed_at,
            ${committedAtIso}::timestamptz
          ),
          processing_reason_code = COALESCE(
            NULLIF(processing_reason_code, ''),
            'rejected_duplicate_conversion'
          )
          WHERE id = ${candidateId}::uuid
        `);
        skipped.push({
          conversionId,
          reasonCode: "rejected_duplicate_conversion",
          idempotentReplay: true,
        });
      } else {
        // Phase 20K checkpoint 4D2 -- the per-candidate
        // sub-tx threw an UNEXPECTED error. The throw
        // propagates so the outer lifecycle handler can
        // transition the run to `failed`. We do NOT mark
        // the candidate as anything here -- the inner
        // sub-tx already rolled back any UPDATE it may
        // have made to `processing_outcome`, leaving it
        // `pending`. The outer handler will mark the run
        // `failed` so the run is never falsely committed.
        throw error;
      }
    }
  }
  } catch (unexpectedErr) {
    // Phase 20K checkpoint 4D2 -- an unhandled throw escaped
    // the per-candidate loop. Mark the run `failed` and
    // rethrow so the caller observes the failure. The run
    // is NEVER left in `draft` (because the lifecycle was
    // already moved to `committing` by the outer acquire)
    // and NEVER moved to `committed`.
    const reason =
      unexpectedErr instanceof Error
        ? unexpectedErr.message
        : String(unexpectedErr);
    await exec.execute(sql`
      UPDATE reconciliation_runs
      SET status = 'failed',
          failed_at = ${committedAtIso}::timestamptz,
          failed_reason = ${reason.slice(0, 500)}::text
      WHERE id = ${input.reconciliationRunId}::uuid
        AND status = 'committing'
    `);
    throw unexpectedErr;
  }

  // Phase 20K checkpoint 4D2 -- run-level finalization.
  //
  // After the per-candidate loop completes WITHOUT an
  // unhandled throw, count the remaining `pending`
  // candidates. If zero, transition the run to `committed`
  // and stamp `committed_at`. If non-zero, mark the run
  // `failed` with a reason -- this branch covers the case
  // where a candidate had `processing_outcome = 'failed'`
  // (e.g., `rejected_paid_out_of_phase_20k_scope`,
  // `rejected_terminal_state`, `rejected_source_not_ready`,
  // `rejected_source_status_unknown`) and the loop
  // finished without throwing, or a `skipped/stale` was
  // applied but the run cannot legally commit a partial
  // plan. Note: `skipped/idempotent` and `skipped/stale`
  // outcomes ARE considered "complete" candidates: the run
  // may still transition to `committed` if those are the
  // only non-`pending` outcomes left, because the
  // corresponding money/status mutations either never
  // happened (replay) or were fail-closed (stale).
  const pendingRows = toRows(
    await exec.execute(sql`
      SELECT count(*)::int AS pending FROM reconciliation_run_candidates
      WHERE run_id = ${input.reconciliationRunId}::uuid
        AND processing_outcome = 'pending'
    `),
  );
  const pendingCount = Number(pendingRows[0]?.pending ?? 0);
  if (pendingCount === 0) {
    let finalRows: Array<Record<string, unknown>>;
    let finalizationRecovered = false;
    try {
      finalRows = toRows(
        await exec.execute(sql`
          UPDATE reconciliation_runs
          SET status = 'committed',
              committed_at = ${committedAtIso}::timestamptz
          WHERE id = ${input.reconciliationRunId}::uuid
            AND status = 'committing'
          RETURNING id
        `),
      );
    } catch (finalizationError) {
      await recoverFinalizationFailureAsync({
        exec,
        runId: input.reconciliationRunId,
        failedAtIso: committedAtIso,
        finalizationError,
      });
      finalRows = [];
      finalizationRecovered = true;
    }
    if (!finalizationRecovered && finalRows.length !== 1) {
      await recoverFinalizationFailureAsync({
        exec,
        runId: input.reconciliationRunId,
        failedAtIso: committedAtIso,
        finalizationError: new Error(
          "reconciliation.repository: finalization affected an unexpected row count",
        ),
      });
    }
  } else {
    await exec.execute(sql`
      UPDATE reconciliation_runs
      SET status = 'failed',
          failed_at = ${committedAtIso}::timestamptz,
          failed_reason = ${("pending candidates: " + pendingCount).slice(0, 500)}::text
      WHERE id = ${input.reconciliationRunId}::uuid
        AND status = 'committing'
    `);
  }

  // Phase 20K follow-up 4 -- no post-hoc UPDATE on the run
  // status. The status moved to `committed` inside the per-
  // candidate transaction above (or stayed `draft` if nothing
  // landed). The legacy best-effort `try { ... } catch {
  // ignore }` block was removed: a run can never remain in
  // `draft` after a money mutation was applied, and no error
  // here is ever silently swallowed.

  // Phase 20K checkpoint 4D2C -- cumulative totals.
  //
  // When a retry enters the loop, only `pending` candidates
  // produce new entries in the local `applied` array. To keep
  // the summary accurate, pre-accumulate the planned money
  // totals from already-`applied` completed candidates so the
  // returned totals reflect what was actually applied to the
  // database across the entire run lifecycle, not just this
  // attempt.
  let totalCommission = 0;
  let totalUserCashback = 0;
  let totalPlatformProfit = 0;
  for (const cr of completedCandidateRows) {
    if (candidateOutcomes.get(String(cr.id)) !== "applied") continue;
    totalCommission += parseCommission(
      cr.planned_money_network_commission as string | number | null,
    );
    totalUserCashback += parseCommission(
      cr.planned_money_user_cashback as string | number | null,
    );
    totalPlatformProfit += parseCommission(
      cr.planned_money_platform_profit as string | number | null,
    );
  }
  for (const decision of applied) {
    totalCommission += decision.plannedMoneyNetworkCommission;
    totalUserCashback += decision.plannedMoneyUserCashback;
    totalPlatformProfit += decision.plannedMoneyPlatformProfit;
  }
  return {
    summary: {
      scannedRows: candidateRows.length,
      applied: applied.length,
      skipped: skipped.length,
      reject: applied.filter((d) => d.kind === "reject").length,
      totals: {
        networkCommission: totalCommission,
        userCashback: totalUserCashback,
        platformProfit: totalPlatformProfit,
      },
    },
    applied,
    skipped,
    committedAt: committedAtIso,
    scannedRowCount: candidateRows.length,
    reconciliationRunId: input.reconciliationRunId,
  };
}

/**
 * Internal helper exported for tests.
 */
export const __testOnlyHelpers = Object.freeze({
  parseStatus,
  parseCommission,
  toRows,
  classifySourceEvidence,
});

export { buildReconciliationIdempotencyKey };
