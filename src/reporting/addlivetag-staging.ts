/**
 * Phase 20H.8 -- Addlivetag staging algorithm (pure).
 *
 * This module is intentionally framework-agnostic: it does not
 * import `server-only`, does not import `@/db/client`, and does
 * not import the reconciliation repository. The pure module
 * exposes the algorithm as a single function
 * `stageAddlivetagReportAsync(input, deps)` that takes explicit
 * dependencies for DB writes and reconciliation calls.
 *
 * Splitting this from the production wrapper means the unit
 * tests run under plain `node --test` without the `react-server`
 * condition. The production wrapper
 * `addlivetag-staging.server.ts` adds `server-only`, the DB
 * client, and the reconciliation repository, and delegates to
 * this module.
 *
 * Hard rules (the algorithm itself enforces these):
 *
 *   - Adapter never re-implements the reconciliation engine.
 *   - A row with a missing or malformed sub_id NEVER triggers a
 *     `shopee_purchase_intents` lookup.
 *   - A duplicate row (same fingerprint already inserted) is
 *     counted and skipped.
 *   - Click rows are recorded through the click-audit writer and
 *     NEVER reach the staging or reconciliation layer.
 *   - The `dryRun` mode performs every compute step EXCEPT the
 *     actual DB write.
 */

import type {
  AddlivetagImportResult,
  AddlivetagNormalizedClickRow,
  AddlivetagNormalizedRow,
  AddlivetagPageResponse,
  AddlivetagRawClickRow,
  AddlivetagRawRow,
  AddlivetagResourceType,
  AddlivetagRowOutcome,
  AddlivetagSource,
} from "@/reporting/addlivetag-types";

import {
  computeAddlivetagRowFingerprintAsync,
  normalizeAddlivetagClickRow,
  normalizeAddlivetagRowToStaging,
} from "@/reporting/addlivetag-normalizer";

/**
 * Optional click audit writer. The algorithm calls this for every
 * normalized click row. The default is an in-memory no-op; the
 * production wiring would record into a real audit table in a
 * later phase.
 */
export type AddlivetagClickAuditWriter = (
  row: AddlivetagNormalizedClickRow,
) => Promise<{ readonly clickId: string }>;

const defaultClickAuditWriter: AddlivetagClickAuditWriter = async (row) => ({
  clickId: row.clickId,
});

/**
 * Row insert interface. The production wrapper implements this
 * with a real `shopee_csv_rows` insert; the unit test supplies a
 * no-op stub.
 */
export interface AddlivetagRowInserter {
  insertStagedRow(args: {
    readonly batchId: string;
    readonly source: AddlivetagSource;
    readonly sourceRowNumber: number;
    readonly row: AddlivetagNormalizedRow;
    readonly rowFingerprintSha256: string;
  }): Promise<
    | { readonly kind: "inserted"; readonly rowId: string }
    | { readonly kind: "duplicate"; readonly rowId: string }
  >;
}

/**
 * Batch upsert interface. The production wrapper implements this
 * with a real `shopee_csv_import_batches` upsert; the unit test
 * supplies a no-op stub that returns a deterministic id.
 */
export interface AddlivetagBatchUpserter {
  upsertBatch(args: {
    readonly batchName: string;
    readonly batchSha: string;
    readonly from: string;
    readonly to: string;
    readonly type: AddlivetagResourceType;
    readonly source: AddlivetagSource;
  }): Promise<string>;
}

export interface ImportAddlivetagReportInput {
  readonly source: AddlivetagSource;
  readonly type: AddlivetagResourceType;
  readonly from: string;
  readonly to: string;
  readonly pages: ReadonlyArray<AddlivetagPageResponse>;
  readonly dryRun: boolean;
  readonly batchName?: string;
}

export interface StageAddlivetagReportDependencies {
  readonly insertStagedRow: AddlivetagRowInserter["insertStagedRow"];
  readonly upsertBatch: AddlivetagBatchUpserter["upsertBatch"];
  readonly writeClick?: AddlivetagClickAuditWriter;
  readonly reconcileStagedRow?: (
    stagedRowId: string,
  ) => Promise<{
    readonly kind: "promoted" | "duplicate" | "skip" | "attribution_invalid";
    readonly conversionId?: string;
    readonly reason?: string;
  }>;
}

/**
 * Build the canonical batch name for a fetch window.
 *
 * Format: `<source>:<type>:<from>:<to>:<sha-prefix>` where the
 * SHA prefix is the first 12 hex characters of the canonical batch
 * SHA. The full batch SHA is the file-level idempotency boundary.
 */
export function deriveAddlivetagBatchName(
  source: AddlivetagSource,
  type: AddlivetagResourceType,
  from: string,
  to: string,
  batchSha: string,
): string {
  return `addlivetag:${source}:${type}:${from}:${to}:${batchSha.slice(0, 12)}`;
}

/**
 * Build a deterministic 64-char lowercase hex SHA-256 of the fetch
 * window. This is the file-level idempotency boundary.
 */
export async function computeAddlivetagBatchShaAsync(args: {
  readonly source: AddlivetagSource;
  readonly type: AddlivetagResourceType;
  readonly from: string;
  readonly to: string;
  readonly pages: ReadonlyArray<AddlivetagPageResponse>;
}): Promise<string> {
  const pageFingerprints: string[][] = [];
  for (const p of args.pages) {
    const fps: string[] = [];
    for (const row of p.rows) {
      const fp = await fingerprintForRawRow(row, args.type);
      fps.push(fp);
    }
    pageFingerprints.push(fps);
  }
  const canonical = JSON.stringify({
    source: args.source,
    type: args.type,
    from: args.from,
    to: args.to,
    pages: args.pages.map((p, i) => ({
      request: p.request,
      rowCount: p.rows.length,
      rowFingerprints: pageFingerprints[i] ?? [],
    })),
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  let out = "";
  const buf = new Uint8Array(digest);
  for (let i = 0; i < buf.length; i++) {
    out += buf[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

async function fingerprintForRawRow(
  row: AddlivetagRawRow | AddlivetagRawClickRow,
  type: AddlivetagResourceType,
): Promise<string> {
  if (type === "clicks") {
    const normalized = normalizeAddlivetagClickRow(row);
    if (normalized.kind === "ok_click") {
      return computeAddlivetagRowFingerprintAsync(normalized.row, type);
    }
    return "";
  }
  const normalized = normalizeAddlivetagRowToStaging(row);
  if (normalized.kind === "ok") {
    return computeAddlivetagRowFingerprintAsync(normalized.row, type);
  }
  return "";
}

interface Counters {
  fetched: number;
  staged: number;
  duplicate: number;
  reconciled: number;
  rejected: number;
}

/**
 * Public entry point. Paginates the staging service through the
 * supplied pages (the client is responsible for fetching) and
 * returns a per-row summary.
 */
export async function stageAddlivetagReportAsync(
  input: ImportAddlivetagReportInput,
  deps: StageAddlivetagReportDependencies,
): Promise<AddlivetagImportResult> {
  const writeClick = deps.writeClick ?? defaultClickAuditWriter;
  const reconcile =
    deps.reconcileStagedRow ??
    (async () => {
      throw new Error(
        "Addlivetag staging: reconcileStagedRow dependency is required",
      );
    });

  const outcomes: AddlivetagRowOutcome[] = [];
  const counters: Counters = {
    fetched: 0,
    staged: 0,
    duplicate: 0,
    reconciled: 0,
    rejected: 0,
  };

  // Click rows: do NOT touch shopee_csv_* or the reconciliation
  // engine. Just record the safe internal audit model.
  if (input.type === "clicks") {
    let rowNumber = 0;
    for (const page of input.pages) {
      for (const raw of page.rows) {
        rowNumber += 1;
        counters.fetched += 1;
        const normalized = normalizeAddlivetagClickRow(
          raw as AddlivetagRawClickRow,
        );
        if (normalized.kind === "malformed_row") {
          counters.rejected += 1;
          outcomes.push({
            kind: "malformed_row",
            rowNumber,
            reason: normalized.reason,
          });
          continue;
        }
        if (normalized.kind !== "ok_click") {
          // Order-shaped rows do not reach the click-audit path.
          // We surface this as a structural error so the
          // orchestrator never silently drops a row.
          throw new Error(
            "Addlivetag staging: clicks page produced a non-click row",
          );
        }
        const written = await writeClick(normalized.row);
        outcomes.push({
          kind: "click_recorded",
          clickId: written.clickId,
        });
      }
    }
    return {
      batchId: "",
      source: input.source,
      type: input.type,
      pagesFetched: input.pages.length,
      rowsFetched: counters.fetched,
      rowsStaged: 0,
      rowsDuplicate: 0,
      rowsReconciled: 0,
      rowsRejected: counters.rejected,
      dryRun: input.dryRun,
      outcome: outcomes,
    };
  }

  const batchSha = await computeAddlivetagBatchShaAsync({
    source: input.source,
    type: input.type,
    from: input.from,
    to: input.to,
    pages: input.pages,
  });
  const batchName =
    input.batchName ??
    deriveAddlivetagBatchName(
      input.source,
      input.type,
      input.from,
      input.to,
      batchSha,
    );

  let batchId = "";
  if (!input.dryRun) {
    batchId = await deps.upsertBatch({
      batchName,
      batchSha,
      from: input.from,
      to: input.to,
      type: input.type,
      source: input.source,
    });
  }

  let sourceRowNumber = 1; // row 1 reserved as virtual "header"
  for (const page of input.pages) {
    for (const raw of page.rows) {
      sourceRowNumber += 1;
      counters.fetched += 1;
      const normalized = normalizeAddlivetagRowToStaging(
        raw as AddlivetagRawRow,
      );
      if (normalized.kind === "missing_sub_id") {
        counters.rejected += 1;
        outcomes.push({
          kind: "missing_sub_id",
          rowNumber: sourceRowNumber,
        });
        continue;
      }
      if (normalized.kind === "malformed_sub_id") {
        counters.rejected += 1;
        outcomes.push({
          kind: "malformed_sub_id",
          rowNumber: sourceRowNumber,
        });
        continue;
      }
      if (normalized.kind === "malformed_row") {
        counters.rejected += 1;
        outcomes.push({
          kind: "malformed_row",
          rowNumber: sourceRowNumber,
          reason: normalized.reason,
        });
        continue;
      }
      if (normalized.kind !== "ok") {
        // The orchestrator routes click-shaped rows to the click
        // branch above; reaching here with anything other than
        // "ok" indicates a routing bug.
        throw new Error(
          "Addlivetag staging: order page produced a non-ok row",
        );
      }

      const fingerprint = await computeAddlivetagRowFingerprintAsync(
        normalized.row,
        input.type,
      );

      if (input.dryRun) {
        counters.staged += 1;
        outcomes.push({
          kind: "promoted",
          stagedRowId: `dryrun:${fingerprint.slice(0, 12)}`,
          conversionId: "",
        });
        continue;
      }

      const inserted = await deps.insertStagedRow({
        batchId,
        source: input.source,
        sourceRowNumber,
        row: normalized.row,
        rowFingerprintSha256: fingerprint,
      });
      if (inserted.kind === "duplicate") {
        counters.duplicate += 1;
        outcomes.push({
          kind: "duplicate",
          stagedRowId: inserted.rowId,
        });
        continue;
      }
      counters.staged += 1;
      const reconciliation = await reconcile(inserted.rowId);
      if (reconciliation.kind === "promoted") {
        counters.reconciled += 1;
        outcomes.push({
          kind: "promoted",
          stagedRowId: inserted.rowId,
          conversionId: reconciliation.conversionId ?? "",
        });
        continue;
      }
      if (reconciliation.kind === "duplicate") {
        counters.duplicate += 1;
        outcomes.push({
          kind: "duplicate",
          stagedRowId: inserted.rowId,
        });
        continue;
      }
      if (reconciliation.kind === "attribution_invalid") {
        counters.rejected += 1;
        outcomes.push({
          kind: "rejected",
          reason: reconciliation.reason ?? "attribution_invalid",
          rowNumber: sourceRowNumber,
        });
        continue;
      }
      counters.duplicate += 1;
      outcomes.push({
        kind: "duplicate",
        stagedRowId: inserted.rowId,
      });
    }
  }

  return {
    batchId,
    source: input.source,
    type: input.type,
    pagesFetched: input.pages.length,
    rowsFetched: counters.fetched,
    rowsStaged: counters.staged,
    rowsDuplicate: counters.duplicate,
    rowsReconciled: counters.reconciled,
    rowsRejected: counters.rejected,
    dryRun: input.dryRun,
    outcome: outcomes,
  };
}
