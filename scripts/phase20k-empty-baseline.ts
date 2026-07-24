export const PHASE20K_EMPTY_BASELINE_RELATIONS = Object.freeze([
  "auth.users",
  "public.profiles",
  "public.payout_accounts",
  "public.tracking_links",
  "public.clicks",
  "public.shopee_csv_import_batches",
  "public.shopee_csv_rows",
  "public.shopee_ingestion_events",
  "public.conversions",
  "public.advertisers",
  "public.campaigns",
  "public.offers",
  "public.cashback_policies",
  "public.shopee_purchase_intents",
  "public.reconciliation_audit_events",
  "public.reconciliation_runs",
  "public.reconciliation_run_candidates",
] as const);

export type Phase20kBaselineRelation =
  (typeof PHASE20K_EMPTY_BASELINE_RELATIONS)[number];

export interface Phase20kRelationSnapshot {
  readonly count: number | string;
  readonly stableHash: string;
}

export type Phase20kBaselineSnapshot = Readonly<
  Record<string, Phase20kRelationSnapshot | undefined>
>;

export type Phase20kBaselineFailureCode =
  | "missing_relation"
  | "invalid_count"
  | "non_zero_count"
  | "missing_stable_hash"
  | "invalid_stable_hash"
  | "unknown_relation";

export interface Phase20kBaselineFailure {
  readonly relation: string;
  readonly code: Phase20kBaselineFailureCode;
}

export interface Phase20kEmptyBaselineValidation {
  readonly approved: boolean;
  readonly relationCount: number;
  readonly failures: readonly Phase20kBaselineFailure[];
}

const RELATION_SET = new Set<string>(PHASE20K_EMPTY_BASELINE_RELATIONS);
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function isPhase20kBaselineRelation(
  value: string,
): value is Phase20kBaselineRelation {
  return RELATION_SET.has(value);
}

export function validatePhase20kEmptyBaseline(
  snapshot: Phase20kBaselineSnapshot,
  options: { readonly strict?: boolean } = {},
): Phase20kEmptyBaselineValidation {
  const failures: Phase20kBaselineFailure[] = [];

  for (const relation of PHASE20K_EMPTY_BASELINE_RELATIONS) {
    const state = snapshot[relation];
    if (!state) {
      failures.push({ relation, code: "missing_relation" });
      continue;
    }

    const countIsValid =
      typeof state.count === "string"
        ? /^(0|[1-9][0-9]*)$/.test(state.count)
        : Number.isSafeInteger(state.count) && state.count >= 0;
    if (!countIsValid) {
      failures.push({ relation, code: "invalid_count" });
      continue;
    }
    if (state.count !== 0 && state.count !== "0") {
      failures.push({ relation, code: "non_zero_count" });
      continue;
    }

    const stableHash = state.stableHash?.trim() ?? "";
    if (stableHash.length === 0) {
      failures.push({ relation, code: "missing_stable_hash" });
      continue;
    }
    if (!SHA256_PATTERN.test(stableHash)) {
      failures.push({ relation, code: "invalid_stable_hash" });
    }
  }

  if (options.strict !== false) {
    const unknownRelations = Object.keys(snapshot)
      .filter((relation) => !RELATION_SET.has(relation))
      .sort();
    for (const relation of unknownRelations) {
      failures.push({ relation, code: "unknown_relation" });
    }
  }

  return Object.freeze({
    approved: failures.length === 0,
    relationCount: PHASE20K_EMPTY_BASELINE_RELATIONS.length,
    failures: Object.freeze(
      failures.map((failure) => Object.freeze({ ...failure })),
    ),
  });
}
