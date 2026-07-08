/**
 * Phase 20H.8 -- Addlivetag import service (server-only).
 *
 * High-level orchestrator. Fetches pages from the Addlivetag client
 * and feeds them into the staging service. The split is deliberate:
 *
 *   - `addlivetag-client.ts` is the pure HTTP layer (no DB).
 *   - `addlivetag-staging.ts` is the pure DB algorithm.
 *   - `addlivetag-staging.server.ts` adds the live DB client and
 *     the reconciliation repository.
 *   - This file composes them and exposes the server-bound entry
 *     points for the admin action and the dry-run script.
 *
 * Server-only. Production wiring reads the API key from
 * `ADDLIVETAG_API_KEY` and the optional base URL from
 * `ADDLIVETAG_API_BASE_URL`.
 */
import "server-only";

import {
  ADDLIVETAG_API_BASE_FALLBACK,
  createAddlivetagClient,
  type AddlivetagClient,
  type AddlivetagFetchLike,
} from "@/reporting/addlivetag-client";
import {
  insertAddlivetagReportAsync,
} from "@/reporting/addlivetag-staging.server";
import type {
  AddlivetagImportResult,
  AddlivetagResourceType,
  AddlivetagSource,
} from "@/reporting/addlivetag-types";

export interface RunAddlivetagImportInput {
  readonly source: AddlivetagSource;
  readonly type: AddlivetagResourceType;
  readonly from: string;
  readonly to: string;
  readonly pageSize: number;
  readonly dryRun: boolean;
}

export interface BuildAddlivetagClientDependencies {
  readonly fetchImpl: AddlivetagFetchLike;
  readonly getApiKey: () => string;
  readonly baseUrl?: string;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/**
 * Read the API key from the process environment. The production
 * wrapper at the boundary is the only place that touches
 * `process.env.ADDLIVETAG_API_KEY`.
 */
export function readAddlivetagApiKeyFromEnv(): string {
  const value = process.env.ADDLIVETAG_API_KEY;
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }
  return value;
}

/**
 * Build an Addlivetag client. Production callers use the
 * `createProductionAddlivetagClient` factory below; the dry-run
 * script and the tests pass their own dependencies through
 * `BuildAddlivetagClientDependencies`.
 */
export function buildAddlivetagClient(
  deps: BuildAddlivetagClientDependencies,
): AddlivetagClient {
  return createAddlivetagClient({
    fetchImpl: deps.fetchImpl,
    getApiKey: deps.getApiKey,
    baseUrl: deps.baseUrl ?? ADDLIVETAG_API_BASE_FALLBACK,
    sleep: deps.sleep,
    now: deps.now,
  });
}

/**
 * Production factory. Returns a client wired to the global
 * `fetch`, the `ADDLIVETAG_API_KEY` env var, and the optional
 * `ADDLIVETAG_API_BASE_URL` env var.
 */
export function createProductionAddlivetagClient(): AddlivetagClient {
  return createAddlivetagClient({
    fetchImpl: (input, init) => fetch(input, init),
    getApiKey: () => process.env.ADDLIVETAG_API_KEY ?? "",
    baseUrl:
      typeof process.env.ADDLIVETAG_API_BASE_URL === "string" &&
      process.env.ADDLIVETAG_API_BASE_URL.length > 0
        ? process.env.ADDLIVETAG_API_BASE_URL
        : ADDLIVETAG_API_BASE_FALLBACK,
  });
}

/**
 * Single end-to-end import entry point. Fetches all pages, then
 * runs staging + reconciliation through the live DB inserter
 * and the Phase 20H.6 reconciliation repository.
 */
export async function runAddlivetagImportAsync(
  input: RunAddlivetagImportInput,
  deps: BuildAddlivetagClientDependencies,
): Promise<AddlivetagImportResult> {
  const client = buildAddlivetagClient(deps);
  const pages = await client.fetchAllPages({
    from: input.from,
    to: input.to,
    source: input.source,
    type: input.type,
    pageSize: input.pageSize,
  });
  return insertAddlivetagReportAsync({
    source: input.source,
    type: input.type,
    from: input.from,
    to: input.to,
    pages,
    dryRun: input.dryRun,
  });
}
