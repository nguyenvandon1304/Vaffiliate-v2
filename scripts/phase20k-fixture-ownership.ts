import {
  PHASE20K_EMPTY_BASELINE_RELATIONS,
  isPhase20kBaselineRelation,
  type Phase20kBaselineRelation,
} from "./phase20k-empty-baseline";

export const PHASE20K_CLEANUP_RELATION_ORDER = Object.freeze([
  "public.reconciliation_audit_events",
  "public.reconciliation_run_candidates",
  "public.reconciliation_runs",
  "public.conversions",
  "public.shopee_ingestion_events",
  "public.shopee_csv_rows",
  "public.shopee_csv_import_batches",
  "public.shopee_purchase_intents",
  "public.clicks",
  "public.tracking_links",
  "public.cashback_policies",
  "public.offers",
  "public.campaigns",
  "public.advertisers",
  "public.payout_accounts",
  "public.profiles",
  "auth.users",
] as const satisfies readonly Phase20kBaselineRelation[]);

export type Phase20kFixtureLifecycle =
  | "open"
  | "sealed"
  | "cleanup-planned"
  | "verified";

export type Phase20kExactKey = Readonly<Record<string, string>>;

export interface Phase20kOwnedFixtureRow {
  readonly primaryKey: Phase20kExactKey;
  readonly businessKey?: Phase20kExactKey;
}

export type Phase20kOwnedRows = Readonly<
  Record<Phase20kBaselineRelation, readonly Phase20kOwnedFixtureRow[]>
>;

export interface Phase20kFixtureOwnershipManifest {
  readonly version: 1;
  readonly runId: string;
  readonly targetIdentityHash: string;
  readonly createdAt: string;
  readonly lifecycle: Phase20kFixtureLifecycle;
  readonly ownedRows: Phase20kOwnedRows;
}

export interface Phase20kCleanupPlanStep {
  readonly relation: Phase20kBaselineRelation;
  readonly rows: readonly Phase20kOwnedFixtureRow[];
}

export interface Phase20kFixtureCleanupPlan {
  readonly runId: string;
  readonly targetIdentityHash: string;
  readonly steps: readonly Phase20kCleanupPlanStep[];
}

export type Phase20kOwnershipErrorCode =
  | "invalid_run_id"
  | "invalid_target_identity_hash"
  | "invalid_creation_timestamp"
  | "unknown_relation"
  | "invalid_primary_key"
  | "empty_primary_key"
  | "invalid_business_key"
  | "wildcard_identifier_forbidden"
  | "duplicate_ownership"
  | "manifest_not_open"
  | "manifest_not_sealed"
  | "manifest_not_cleanup_planned"
  | "cleanup_not_verified";

export class Phase20kOwnershipError extends Error {
  readonly code: Phase20kOwnershipErrorCode;

  constructor(code: Phase20kOwnershipErrorCode) {
    super(code);
    this.name = "Phase20kOwnershipError";
    this.code = code;
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const KEY_COLUMN_PATTERN = /^[a-z_][a-z0-9_]*$/;
const FORBIDDEN_WILDCARD_PATTERN = /[%*]/;

const PRIMARY_KEY_COLUMNS: Readonly<
  Record<Phase20kBaselineRelation, readonly string[]>
> = Object.freeze({
  "auth.users": Object.freeze(["id"]),
  "public.profiles": Object.freeze(["user_id"]),
  "public.payout_accounts": Object.freeze(["id"]),
  "public.tracking_links": Object.freeze(["id"]),
  "public.clicks": Object.freeze(["id"]),
  "public.shopee_csv_import_batches": Object.freeze(["id"]),
  "public.shopee_csv_rows": Object.freeze(["id"]),
  "public.shopee_ingestion_events": Object.freeze(["id"]),
  "public.conversions": Object.freeze(["id"]),
  "public.advertisers": Object.freeze(["id"]),
  "public.campaigns": Object.freeze(["id"]),
  "public.offers": Object.freeze(["id"]),
  "public.cashback_policies": Object.freeze(["offer_id"]),
  "public.shopee_purchase_intents": Object.freeze(["id"]),
  "public.reconciliation_audit_events": Object.freeze(["id"]),
  "public.reconciliation_runs": Object.freeze(["id"]),
  "public.reconciliation_run_candidates": Object.freeze(["id"]),
});

function emptyOwnedRows(): Phase20kOwnedRows {
  return Object.freeze(
    Object.fromEntries(
      PHASE20K_EMPTY_BASELINE_RELATIONS.map((relation) => [
        relation,
        Object.freeze([]),
      ]),
    ) as unknown as Record<
      Phase20kBaselineRelation,
      readonly Phase20kOwnedFixtureRow[]
    >,
  );
}

function canonicalExactKey(
  value: Phase20kExactKey,
  errorCode: "invalid_primary_key" | "invalid_business_key",
): Phase20kExactKey {
  const keys = Object.keys(value).sort();
  if (keys.length === 0) {
    throw new Phase20kOwnershipError(
      errorCode === "invalid_primary_key"
        ? "empty_primary_key"
        : "invalid_business_key",
    );
  }

  const entries: Array<readonly [string, string]> = [];
  for (const key of keys) {
    const item = value[key];
    if (
      !KEY_COLUMN_PATTERN.test(key) ||
      typeof item !== "string" ||
      item.trim().length === 0
    ) {
      throw new Phase20kOwnershipError(errorCode);
    }
    if (FORBIDDEN_WILDCARD_PATTERN.test(item)) {
      throw new Phase20kOwnershipError("wildcard_identifier_forbidden");
    }
    entries.push(Object.freeze([key, item] as const));
  }
  return Object.freeze(Object.fromEntries(entries));
}

function validatePrimaryKey(
  relation: Phase20kBaselineRelation,
  primaryKey: Phase20kExactKey,
): Phase20kExactKey {
  const canonical = canonicalExactKey(primaryKey, "invalid_primary_key");
  const actualColumns = Object.keys(canonical);
  const expectedColumns = PRIMARY_KEY_COLUMNS[relation];
  if (
    actualColumns.length !== expectedColumns.length ||
    actualColumns.some((column, index) => column !== expectedColumns[index])
  ) {
    throw new Phase20kOwnershipError("invalid_primary_key");
  }
  return canonical;
}

function canonicalRow(
  relation: Phase20kBaselineRelation,
  row: Phase20kOwnedFixtureRow,
): Phase20kOwnedFixtureRow {
  const primaryKey = validatePrimaryKey(relation, row.primaryKey);
  const businessKey = row.businessKey
    ? canonicalExactKey(row.businessKey, "invalid_business_key")
    : undefined;
  return Object.freeze({ primaryKey, ...(businessKey ? { businessKey } : {}) });
}

function primaryKeyIdentity(row: Phase20kOwnedFixtureRow): string {
  return JSON.stringify(row.primaryKey);
}

function sortedRows(
  rows: readonly Phase20kOwnedFixtureRow[],
): readonly Phase20kOwnedFixtureRow[] {
  return Object.freeze(
    [...rows].sort((a, b) =>
      primaryKeyIdentity(a).localeCompare(primaryKeyIdentity(b)),
    ),
  );
}

function withLifecycle(
  manifest: Phase20kFixtureOwnershipManifest,
  lifecycle: Phase20kFixtureLifecycle,
): Phase20kFixtureOwnershipManifest {
  return Object.freeze({ ...manifest, lifecycle });
}

export function createPhase20kFixtureOwnershipManifest(input: {
  readonly runId: string;
  readonly targetIdentityHash: string;
  readonly createdAt: string;
}): Phase20kFixtureOwnershipManifest {
  if (!RUN_ID_PATTERN.test(input.runId)) {
    throw new Phase20kOwnershipError("invalid_run_id");
  }
  const targetIdentityHash = input.targetIdentityHash.trim().toLowerCase();
  if (!SHA256_PATTERN.test(targetIdentityHash)) {
    throw new Phase20kOwnershipError("invalid_target_identity_hash");
  }
  const parsedTimestamp = new Date(input.createdAt);
  if (
    !input.createdAt.endsWith("Z") ||
    Number.isNaN(parsedTimestamp.getTime())
  ) {
    throw new Phase20kOwnershipError("invalid_creation_timestamp");
  }

  return Object.freeze({
    version: 1,
    runId: input.runId,
    targetIdentityHash,
    createdAt: parsedTimestamp.toISOString(),
    lifecycle: "open",
    ownedRows: emptyOwnedRows(),
  });
}

export function addPhase20kOwnedFixtureRow(
  manifest: Phase20kFixtureOwnershipManifest,
  relation: string,
  row: Phase20kOwnedFixtureRow,
): Phase20kFixtureOwnershipManifest {
  if (manifest.lifecycle !== "open") {
    throw new Phase20kOwnershipError("manifest_not_open");
  }
  if (!isPhase20kBaselineRelation(relation)) {
    throw new Phase20kOwnershipError("unknown_relation");
  }

  const ownedRow = canonicalRow(relation, row);
  const existing = manifest.ownedRows[relation];
  const identity = primaryKeyIdentity(ownedRow);
  if (existing.some((candidate) => primaryKeyIdentity(candidate) === identity)) {
    throw new Phase20kOwnershipError("duplicate_ownership");
  }

  const ownedRows = Object.freeze({
    ...manifest.ownedRows,
    [relation]: sortedRows([...existing, ownedRow]),
  });
  return Object.freeze({ ...manifest, ownedRows });
}

export function captureGeneratedPhase20kFixturePrimaryKey(
  manifest: Phase20kFixtureOwnershipManifest,
  relation: string,
  primaryKey: Phase20kExactKey,
  businessKey?: Phase20kExactKey,
): Phase20kFixtureOwnershipManifest {
  return addPhase20kOwnedFixtureRow(manifest, relation, {
    primaryKey,
    ...(businessKey ? { businessKey } : {}),
  });
}

export function sealPhase20kFixtureOwnershipManifest(
  manifest: Phase20kFixtureOwnershipManifest,
): Phase20kFixtureOwnershipManifest {
  if (manifest.lifecycle !== "open") {
    throw new Phase20kOwnershipError("manifest_not_open");
  }
  return withLifecycle(manifest, "sealed");
}

export function planPhase20kFixtureCleanup(
  manifest: Phase20kFixtureOwnershipManifest,
): {
  readonly manifest: Phase20kFixtureOwnershipManifest;
  readonly cleanupPlan: Phase20kFixtureCleanupPlan;
} {
  if (manifest.lifecycle !== "sealed") {
    throw new Phase20kOwnershipError("manifest_not_sealed");
  }

  const steps = PHASE20K_CLEANUP_RELATION_ORDER.flatMap((relation) => {
    const rows = sortedRows(manifest.ownedRows[relation]);
    return rows.length > 0 ? [Object.freeze({ relation, rows })] : [];
  });
  return Object.freeze({
    manifest: withLifecycle(manifest, "cleanup-planned"),
    cleanupPlan: Object.freeze({
      runId: manifest.runId,
      targetIdentityHash: manifest.targetIdentityHash,
      steps: Object.freeze(steps),
    }),
  });
}

export function verifyPhase20kFixtureCleanup(
  manifest: Phase20kFixtureOwnershipManifest,
  remainingOwnedRows: Readonly<Partial<Record<Phase20kBaselineRelation, number>>>,
): Phase20kFixtureOwnershipManifest {
  if (manifest.lifecycle !== "cleanup-planned") {
    throw new Phase20kOwnershipError("manifest_not_cleanup_planned");
  }
  for (const relation of PHASE20K_EMPTY_BASELINE_RELATIONS) {
    if (
      manifest.ownedRows[relation].length > 0 &&
      remainingOwnedRows[relation] !== 0
    ) {
      throw new Phase20kOwnershipError("cleanup_not_verified");
    }
  }
  return withLifecycle(manifest, "verified");
}

export function serializePhase20kFixtureOwnershipManifest(
  manifest: Phase20kFixtureOwnershipManifest,
): string {
  const ownedRows = Object.fromEntries(
    PHASE20K_EMPTY_BASELINE_RELATIONS.map((relation) => [
      relation,
      sortedRows(manifest.ownedRows[relation]),
    ]),
  );
  return JSON.stringify({
    version: manifest.version,
    runId: manifest.runId,
    targetIdentityHash: manifest.targetIdentityHash,
    createdAt: manifest.createdAt,
    lifecycle: manifest.lifecycle,
    ownedRows,
  });
}
