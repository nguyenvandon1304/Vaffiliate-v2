/**
 * Phase 20H.8 -- Addlivetag HTTP client (pure, server-only at the
 * production boundary).
 *
 * Phase 20I.3 -- aligned the request contract with the documented
 * Addlivetag Conversion API at
 * `https://addlivetag.com/api/v1/conversions.php`. The endpoint
 * path, the `account_id` query parameter, and the explicit `format`
 * parameter are now first-class in the request shape.
 *
 * Responsibilities:
 *
 *   1. Build the request URL with the documented query parameters:
 *        type, source, from, to, page, page_size, format=json,
 *        account_id (only when supplied)
 *   2. Inject the X-API-Key header from the dependency-injected
 *      `getApiKey()` accessor. The client NEVER logs the header
 *      value, NEVER throws an Error whose message contains the key,
 *      and NEVER echoes the key back to the caller. The api_key is
 *      NEVER placed in the URL query string.
 *   3. Retry on 429 and 5xx with exponential backoff and jitter. The
 *      retry counter and the max attempt count are configurable.
 *   4. Decode the JSON body and surface typed `AddlivetagApiError`
 *      codes on failure (timeout, non-2xx, content-type, body too
 *      large, parse error, redirect, etc).
 *   5. Support a pagination iterator. The caller passes a single
 *      request with `page = 1`; the client walks pages until the
 *      API returns fewer rows than `pageSize` (or `totalPages` is
 *      exhausted). A 5,000-page safety cap prevents runaway
 *      pagination.
 *
 * Security boundary:
 *
 *   - The file imports `server-only` only via the production
 *     wrapper. The pure module is exported without the guard so
 *     unit tests can run under plain `node --test`.
 *   - The production wrapper reads `ADDLIVETAG_API_KEY` from the
 *     environment. The pure client does NOT read it directly; tests
 *     pass an explicit `getApiKey()` accessor.
 *   - All error messages are constructed without the API key value.
 *     A test asserts that no thrown Error carries the key.
 *
 * Server-only at the production boundary (see
 * `addlivetag-staging.server.ts`); the pure module is exported
 * without the `server-only` guard so unit tests can run under
 * plain `node --test`.
 */

import type {
  AddlivetagPageRequest,
  AddlivetagPageResponse,
  AddlivetagRawClickRow,
  AddlivetagRawRow,
  AddlivetagResourceType,
} from "./addlivetag-types";

/**
 * Default Addlivetag account API endpoint.
 *
 * Phase 20I.3 -- aligned with the documented public endpoint at
 * `https://addlivetag.com/api/v1/conversions.php`. Configurable via
 * `ADDLIVETAG_CONVERSIONS_ENDPOINT` (preferred) or
 * `ADDLIVETAG_API_BASE_URL` (legacy alias preserved for Phase 20H.8
 * callers); the constant below is the documented public endpoint
 * used as a fallback so the pure client is self-contained for
 * tests.
 */
export const ADDLIVETAG_API_BASE_FALLBACK =
  "https://addlivetag.com/api/v1/conversions.php";

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 1_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024; // 4 MiB
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_RETRY_CAP_MS = 4_000;

const ACCEPTED_CONTENT_TYPES: ReadonlyArray<string> = [
  "application/json",
  "text/json",
  "application/vnd.api+json",
];

/**
 * Phase 20I.3 follow-up -- canonical regex for the optional
 * `account_id` query parameter. The pure client, the server action,
 * and the CLI script all share this exact rule so that any caller
 * that bypasses the higher layers still cannot inject malformed
 * account ids into the URL.
 *
 * Allowed: letters, digits, underscore, hyphen. Length: 1..64.
 * Empty after trim is treated as "omitted" (no error).
 */
const ADDLIVETAG_ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Minimal fetch contract for the Addlivetag client. Mirrors the
 * global `fetch` signature so production code can pass the built-in
 * fetch through, while unit tests supply a mock that returns a
 * hand-crafted Response.
 */
export type AddlivetagFetchLike = (
  input: URL,
  init: RequestInit,
) => Promise<Response>;

/**
 * Reasons the Addlivetag client rejected a request. Same family as
 * the Unikorn commission client so callers can collapse both
 * failure streams if they ever need a single switch.
 */
export type AddlivetagApiFailureCode =
  | "invalid_input"
  | "missing_api_key"
  | "provider_timeout"
  | "provider_response_invalid"
  | "non_2xx_response"
  | "rate_limited"
  | "unexpected_content_type"
  | "body_too_large"
  | "redirect_failed"
  | "unknown_source"
  | "unknown_resource_type";

export class AddlivetagApiError extends Error {
  readonly code: AddlivetagApiFailureCode;
  readonly status: number | null;
  readonly attempt: number;
  constructor(
    code: AddlivetagApiFailureCode,
    message: string,
    status: number | null = null,
    attempt: number = 1,
  ) {
    super(message);
    this.name = "AddlivetagApiError";
    this.code = code;
    this.status = status;
    this.attempt = attempt;
  }
}

export interface AddlivetagClientConfig {
  /**
   * Override the HTTP fetcher. Production passes the global
   * `fetch`; unit tests pass a recorder.
   */
  readonly fetchImpl: AddlivetagFetchLike;
  /**
   * Account API base URL. Defaults to the documented public
   * endpoint.
   */
  readonly baseUrl?: string;
  /**
   * Returns the API key for the current request. The client calls
   * this accessor AT MOST ONCE per HTTP attempt and never logs the
   * returned value.
   */
  readonly getApiKey: () => string;
  /**
   * Per-attempt timeout. Defaults to 10 seconds.
   */
  readonly timeoutMs?: number;
  /**
   * Maximum number of attempts (initial + retries) for 429 / 5xx.
   * Defaults to 4.
   */
  readonly maxAttempts?: number;
  /**
   * Base and cap for exponential backoff with jitter, in ms.
   */
  readonly retryBaseMs?: number;
  readonly retryCapMs?: number;
  /**
   * Sleep injected between attempts. Tests pass a no-op so they
   * run synchronously.
   */
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Optional now() override for tests.
   */
  readonly now?: () => number;
}

export interface AddlivetagClient {
  /**
   * Fetch a single page. Returns the decoded rows. Throws
   * `AddlivetagApiError` on any non-recoverable failure.
   */
  fetchPage(
    request: AddlivetagPageRequest,
  ): Promise<AddlivetagPageResponse>;
  /**
   * Walk every page from 1 until the API returns a page with
   * fewer rows than `pageSize` (or `totalPages` is exhausted).
   * The returned `pages` array preserves order.
   */
  fetchAllPages(
    request: Omit<AddlivetagPageRequest, "page">,
  ): Promise<ReadonlyArray<AddlivetagPageResponse>>;
}

function buildUrl(
  baseUrl: string,
  request: AddlivetagPageRequest,
): URL {
  const url = new URL(baseUrl);
  url.searchParams.set("type", request.type);
  url.searchParams.set("source", request.source);
  url.searchParams.set("from", request.from);
  url.searchParams.set("to", request.to);
  url.searchParams.set("page", String(request.page));
  url.searchParams.set(
    "page_size",
    String(Math.min(MAX_PAGE_SIZE, Math.max(1, request.pageSize))),
  );
  // Phase 20I.3 -- the documented `format` parameter. Defaults to
  // `json` when omitted; only `json` is exercised by the staging
  // pipeline in this phase.
  url.searchParams.set("format", request.format ?? "json");
  // Phase 20I.3 -- the optional `account_id` parameter. When the
  // caller does not pass an accountId the query is left untouched so
  // the API key's owning account remains the implicit filter.
  if (
    typeof request.accountId === "string" &&
    request.accountId.trim().length > 0
  ) {
    url.searchParams.set("account_id", request.accountId.trim());
  }
  return url;
}

function validateRequest(
  request: AddlivetagPageRequest,
): AddlivetagApiError | null {
  if (!request.from || request.from.trim().length === 0) {
    return new AddlivetagApiError(
      "invalid_input",
      "Addlivetag request: `from` is required",
    );
  }
  if (!request.to || request.to.trim().length === 0) {
    return new AddlivetagApiError(
      "invalid_input",
      "Addlivetag request: `to` is required",
    );
  }
  if (request.page < 1) {
    return new AddlivetagApiError(
      "invalid_input",
      "Addlivetag request: `page` must be >= 1",
    );
  }
  if (request.pageSize < 1) {
    return new AddlivetagApiError(
      "invalid_input",
      "Addlivetag request: `pageSize` must be >= 1",
    );
  }
  if (
    request.source !== "shopee" &&
    request.source !== "food"
  ) {
    return new AddlivetagApiError(
      "unknown_source",
      "Addlivetag request: unknown `source`",
    );
  }
  if (
    request.type !== "orders" &&
    request.type !== "items" &&
    request.type !== "clicks"
  ) {
    return new AddlivetagApiError(
      "unknown_resource_type",
      "Addlivetag request: unknown `type`",
    );
  }
  // Phase 20I.3 -- `account_id` is optional but, when present, must
  // match the canonical regex [A-Za-z0-9_-]{1,64}. An empty value
  // (after trim) is treated as "omitted" so that an uninitialised
  // form field does not error. A malformed value is rejected here
  // so the bad string never reaches `buildUrl`, never reaches the
  // outgoing URL, and never echoes back through an Error message.
  if (typeof request.accountId === "string") {
    const trimmed = request.accountId.trim();
    if (
      trimmed.length > 0 &&
      !ADDLIVETAG_ACCOUNT_ID_PATTERN.test(trimmed)
    ) {
      return new AddlivetagApiError(
        "invalid_input",
        "Addlivetag request: `accountId` is malformed",
      );
    }
  }
  if (
    typeof request.format === "string" &&
    request.format !== "json" &&
    request.format !== "csv"
  ) {
    return new AddlivetagApiError(
      "invalid_input",
      "Addlivetag request: `format` must be 'json' or 'csv'",
    );
  }
  return null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(
  attempt: number,
  baseMs: number,
  capMs: number,
  jitter: number,
): number {
  const exp = Math.min(capMs, baseMs * 2 ** (attempt - 1));
  return Math.min(capMs, Math.round(exp + jitter * exp));
}

/**
 * Create a pure Addlivetag client. The returned client is
 * dependency-injectable: every external side effect (HTTP, sleep,
 * clock) is parameterised.
 */
export function createAddlivetagClient(
  config: AddlivetagClientConfig,
): AddlivetagClient {
  const fetchImpl = config.fetchImpl;
  const baseUrl = config.baseUrl ?? ADDLIVETAG_API_BASE_FALLBACK;
  const getApiKey = config.getApiKey;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryBaseMs = config.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  const retryCapMs = config.retryCapMs ?? DEFAULT_RETRY_CAP_MS;
  const sleep = config.sleep ?? defaultSleep;
  const now = config.now ?? Date.now;

  function getApiKeyOrThrow(): string {
    const key = getApiKey();
    if (typeof key !== "string" || key.length === 0) {
      throw new AddlivetagApiError(
        "missing_api_key",
        "Addlivetag request: API key is required",
      );
    }
    return key;
  }

  async function attempt(
    request: AddlivetagPageRequest,
    attemptNo: number,
  ): Promise<AddlivetagPageResponse> {
    const validationError = validateRequest(request);
    if (validationError) {
      throw validationError;
    }
    const url = buildUrl(baseUrl, request);

    // Read the API key exactly once per attempt.
    const apiKey = getApiKeyOrThrow();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AddlivetagApiError(
          "provider_timeout",
          "Addlivetag request: timed out",
          null,
          attemptNo,
        );
      }
      throw new AddlivetagApiError(
        "provider_response_invalid",
        "Addlivetag request: fetch failed",
        null,
        attemptNo,
      );
    }
    clearTimeout(timer);

    if (response.status === 429) {
      throw new AddlivetagApiError(
        "rate_limited",
        "Addlivetag request: rate limited",
        429,
        attemptNo,
      );
    }
    if (response.status >= 500 && response.status <= 599) {
      throw new AddlivetagApiError(
        "non_2xx_response",
        `Addlivetag request: server error ${response.status}`,
        response.status,
        attemptNo,
      );
    }
    if (response.status < 200 || response.status > 299) {
      throw new AddlivetagApiError(
        "non_2xx_response",
        `Addlivetag request: non-2xx status ${response.status}`,
        response.status,
        attemptNo,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !ACCEPTED_CONTENT_TYPES.some((accepted) =>
        contentType.toLowerCase().includes(accepted),
      )
    ) {
      throw new AddlivetagApiError(
        "unexpected_content_type",
        `Addlivetag request: unexpected content-type ${contentType}`,
        response.status,
        attemptNo,
      );
    }

    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null) {
      const declared = Number(declaredLength);
      if (
        Number.isFinite(declared) &&
        declared > MAX_RESPONSE_BYTES
      ) {
        throw new AddlivetagApiError(
          "body_too_large",
          "Addlivetag request: declared body too large",
          response.status,
          attemptNo,
        );
      }
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new AddlivetagApiError(
        "body_too_large",
        "Addlivetag request: body too large",
        response.status,
        attemptNo,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AddlivetagApiError(
        "provider_response_invalid",
        "Addlivetag request: response was not valid JSON",
        response.status,
        attemptNo,
      );
    }
    if (!isObject(json)) {
      throw new AddlivetagApiError(
        "provider_response_invalid",
        "Addlivetag request: response was not a JSON object",
        response.status,
        attemptNo,
      );
    }

    const rows = extractRows(json, request.type);
    const totalPages = extractTotalPages(json);

    return {
      request,
      rows,
      pageSize: request.pageSize,
      totalPages,
    };
  }

  async function fetchPage(
    request: AddlivetagPageRequest,
  ): Promise<AddlivetagPageResponse> {
    let lastError: AddlivetagApiError | null = null;
    for (let attemptNo = 1; attemptNo <= maxAttempts; attemptNo++) {
      try {
        return await attempt(request, attemptNo);
      } catch (error) {
        if (!(error instanceof AddlivetagApiError)) {
          throw error;
        }
        lastError = error;
        const retryable =
          error.code === "rate_limited" ||
          error.code === "provider_timeout" ||
          (error.code === "non_2xx_response" &&
            error.status !== null &&
            error.status >= 500);
        if (!retryable || attemptNo === maxAttempts) {
          throw error;
        }
        const jitter = (now() % 100) / 100;
        const wait = backoffMs(
          attemptNo,
          retryBaseMs,
          retryCapMs,
          jitter,
        );
        await sleep(wait);
      }
    }
    throw (
      lastError ??
      new AddlivetagApiError(
        "provider_response_invalid",
        "Addlivetag request: unknown failure",
      )
    );
  }

  async function fetchAllPages(
    request: Omit<AddlivetagPageRequest, "page">,
  ): Promise<ReadonlyArray<AddlivetagPageResponse>> {
    const pages: AddlivetagPageResponse[] = [];
    let page = 1;
    while (true) {
      const result = await fetchPage({
        ...request,
        page,
        pageSize: request.pageSize ?? DEFAULT_PAGE_SIZE,
      });
      pages.push(result);
const isLast =
      result.totalPages !== null
        ? page >= result.totalPages
        : result.rows.length < result.pageSize;
    if (isLast) break;
    page += 1;
      // Defensive cap: an API that never reports empty pages must
      // not loop forever. 5,000 pages is well past any realistic
      // historical backfill.
      if (page > 5_000) {
        throw new AddlivetagApiError(
          "provider_response_invalid",
          "Addlivetag request: pagination exceeded safety cap",
        );
      }
    }
    return pages;
  }

  return { fetchPage, fetchAllPages };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function extractRows(
  body: Record<string, unknown>,
  type: AddlivetagResourceType,
): Array<AddlivetagRawRow | AddlivetagRawClickRow> {
  const candidates = [
    "data",
    "rows",
    "items",
    "orders",
    "clicks",
    "result",
    "results",
  ];
  for (const key of candidates) {
    const value = body[key];
    if (Array.isArray(value)) {
      return value.filter(isObject) as Array<
        AddlivetagRawRow | AddlivetagRawClickRow
      >;
    }
  }
  if (type === "clicks" && Array.isArray(body.clicks)) {
    return body.clicks.filter(isObject) as Array<AddlivetagRawClickRow>;
  }
  if (Array.isArray(body)) {
    return body.filter(isObject) as Array<
      AddlivetagRawRow | AddlivetagRawClickRow
    >;
  }
  return [];
}

function extractTotalPages(body: Record<string, unknown>): number | null {
  const candidates = [
    "total_pages",
    "totalPages",
    "totalPages",
    "page_count",
    "last_page",
  ];
  for (const key of candidates) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (
        Number.isFinite(parsed) &&
        parsed > 0 &&
        Number.isSafeInteger(parsed)
      ) {
        return parsed;
      }
    }
  }
  return null;
}
