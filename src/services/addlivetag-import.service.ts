/**
 * Phase 20H.8 -- Addlivetag import service (server-only).
 *
 * Phase 20I.3 -- aligned with the documented Addlivetag Conversion
 * API at `https://addlivetag.com/api/v1/conversions.php`. The
 * production factory now reads the new `ADDLIVETAG_CONVERSIONS_ENDPOINT`
 * env var (preferred) and falls back to the legacy
 * `ADDLIVETAG_API_BASE_URL` alias and the documented
 * `ADDLIVETAG_API_BASE_FALLBACK` constant in that order. The optional
 * `account_id` is threaded through `RunAddlivetagImportInput` to
 * the HTTP client without ever leaking the API key.
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
 * `ADDLIVETAG_API_KEY`.
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
  /**
   * Optional Addlivetag `account_id`. When omitted the API key's
   * owning account is the implicit filter. The HTTP client never
   * emits `account_id` unless this field is a non-empty string.
   */
  readonly accountId?: string;
}

export interface BuildAddlivetagClientDependencies {
  readonly fetchImpl: AddlivetagFetchLike;
  readonly getApiKey: () => string;
  readonly baseUrl?: string;
  readonly accountId?: string;
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
 * Phase 20I.3 -- resolve the production endpoint URL.
 *
 * Precedence:
 *
 *   1. `ADDLIVETAG_CONVERSIONS_ENDPOINT` (preferred, semantically
 *      matches the documented `/api/v1/conversions.php` path).
 *   2. `ADDLIVETAG_API_BASE_URL` (Phase 20H.8 alias preserved for
 *      backward compatibility; if the legacy value is set, it
 *      wins).
 *   3. `ADDLIVETAG_API_BASE_FALLBACK` constant (the documented
 *      public endpoint).
 *
 * Never logs the resolved URL because the URL itself is not
 * sensitive; it does include the host so we keep it out of logs by
 * convention.
 */
function readAddlivetagEndpointFromEnv(): string {
  const explicit =
    typeof process.env.ADDLIVETAG_CONVERSIONS_ENDPOINT === "string" &&
    process.env.ADDLIVETAG_CONVERSIONS_ENDPOINT.trim().length > 0
      ? process.env.ADDLIVETAG_CONVERSIONS_ENDPOINT.trim()
      : null;
  if (explicit !== null) {
    return explicit;
  }
  const legacy =
    typeof process.env.ADDLIVETAG_API_BASE_URL === "string" &&
    process.env.ADDLIVETAG_API_BASE_URL.trim().length > 0
      ? process.env.ADDLIVETAG_API_BASE_URL.trim()
      : null;
  if (legacy !== null) {
    return legacy;
  }
  return ADDLIVETAG_API_BASE_FALLBACK;
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
 * `fetch` and the `ADDLIVETAG_API_KEY` env var. The endpoint is
 * resolved through `readAddlivetagEndpointFromEnv` so the new
 * `ADDLIVETAG_CONVERSIONS_ENDPOINT` env var is preferred over the
 * legacy `ADDLIVETAG_API_BASE_URL` alias.
 */
export function createProductionAddlivetagClient(): AddlivetagClient {
  return createAddlivetagClient({
    fetchImpl: (input, init) => fetch(input, init),
    getApiKey: () => process.env.ADDLIVETAG_API_KEY ?? "",
    baseUrl: readAddlivetagEndpointFromEnv(),
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
    accountId: input.accountId ?? deps.accountId,
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
