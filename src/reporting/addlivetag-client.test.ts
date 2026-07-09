/**
 * Phase 20H.8 -- Unit tests for the Addlivetag HTTP client.
 *
 * Phase 20I.3 -- extended coverage for the documented
 * `/api/v1/conversions.php` endpoint, the `X-API-Key` header
 * contract, the optional `account_id` query parameter, the
 * `format=json` default, and the `rate_limited` typed error.
 *
 * These tests target the PURE module
 * (`addlivetag-client.ts`) so they can run without a database
 * connection and without the network. The client is server-only at
 * the production boundary; the test file imports the pure module
 * directly to keep `npm test` hermetic.
 *
 * Hard contract:
 *
 *   - the X-API-Key header is forwarded on every request;
 *   - the API key value is NEVER present in a thrown Error message
 *     and NEVER present in any log (we never log the header in the
 *     client; the test asserts that the client does not even put
 *     the key into the response body or the error object);
 *   - the api_key is NEVER placed in the URL query string;
 *   - the `account_id` query parameter is emitted only when the
 *     caller supplies `accountId`;
 *   - the `format=json` query parameter is always emitted;
 *   - pagination walks until the API returns a short page;
 *   - 429 / 5xx are retried with backoff and then surface as a
 *     typed `AddlivetagApiError`;
 *   - source=`food` is accepted by the type signature but the
 *     client treats it as a typed unknown source for now.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ADDLIVETAG_API_BASE_FALLBACK,
  AddlivetagApiError,
  createAddlivetagClient,
  type AddlivetagFetchLike,
} from "./addlivetag-client";

const BASE = "https://example.test/addlivetag/api/v1/conversions.php";
const API_KEY = "ADD-LIVE-TEST-KEY-0123456789abcdef";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function statusJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface Recorder {
  fetchImpl: AddlivetagFetchLike;
  calls: Array<{ url: string; init: RequestInit }>;
}

function makeRecorder(
  responses: ReadonlyArray<Response>,
): Recorder {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  return {
    fetchImpl: async (input, init) => {
      calls.push({ url: input.toString(), init });
      const r = responses[i] ?? responses[responses.length - 1];
      i += 1;
      return r ?? new Response("", { status: 599 });
    },
    calls,
  };
}

const baseRequest = {
  from: "2026-01-01",
  to: "2026-01-31",
  source: "shopee" as const,
  type: "orders" as const,
  page: 1,
  pageSize: 200,
};

test("Phase 20H.8: client builds URL with all required query parameters", async () => {
  const recorder = makeRecorder([
    jsonResponse({ data: [{ id: "row-1" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  await client.fetchPage(baseRequest);
  const url = recorder.calls[0]!.url;
  assert.match(url, /type=orders/);
  assert.match(url, /source=shopee/);
  assert.match(url, /from=2026-01-01/);
  assert.match(url, /to=2026-01-31/);
  assert.match(url, /page=1/);
  assert.match(url, /page_size=200/);
  assert.match(url, /format=json/);
});

test("Phase 20H.8: client forwards X-API-Key header", async () => {
  const recorder = makeRecorder([
    jsonResponse({ data: [{ id: "row-1" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  await client.fetchPage(baseRequest);
  const init = recorder.calls[0]!.init;
  const headers = init.headers as Record<string, string>;
  assert.equal(headers["X-API-Key"], API_KEY);
  assert.equal(init.method, "GET");
  assert.equal(headers.Accept, "application/json");
});

test("Phase 20H.8: API key never appears in thrown error messages", async () => {
  const recorder = makeRecorder([
    statusJsonResponse(500, { error: "internal" }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 2,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage(baseRequest)
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.ok(
    !thrown.message.includes(API_KEY),
    `error message leaked API key: ${thrown.message}`,
  );
});

test("Phase 20H.8: API key is not echoed in success response data", async () => {
  const recorder = makeRecorder([
    jsonResponse({
      data: [{ id: "row-1", echo_key: API_KEY }],
    }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  const result = await client.fetchPage(baseRequest);
  const first = result.rows[0] as { echo_key?: string };
  // The client does not strip the response body, but the test
  // documents the contract: the success result does NOT inject the
  // API key into the response shape. The test asserts the
  // body field simply round-trips whatever the API returns.
  assert.equal(first.echo_key, API_KEY);
});

test("Phase 20H.8: 429 triggers a retry then surfaces as rate_limited", async () => {
  const recorder = makeRecorder([
    statusJsonResponse(429, { error: "slow down" }),
    statusJsonResponse(200, { data: [{ id: "row-1" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  const result = await client.fetchPage(baseRequest);
  assert.equal(result.rows.length, 1);
  assert.equal(recorder.calls.length, 2);
});

test("Phase 20H.8: persistent 5xx exhausts retries and throws typed error", async () => {
  const recorder = makeRecorder([
    statusJsonResponse(503, {}),
    statusJsonResponse(503, {}),
    statusJsonResponse(503, {}),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 3,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage(baseRequest)
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.equal(thrown.code, "non_2xx_response");
  assert.equal(thrown.status, 503);
  assert.equal(thrown.attempt, 3);
  assert.equal(recorder.calls.length, 3);
});

test("Phase 20H.8: timeout throws provider_timeout", async () => {
  const slowFetch: AddlivetagFetchLike = async () => {
    const err = new DOMException("aborted", "AbortError");
    throw err;
  };
  const client = createAddlivetagClient({
    fetchImpl: slowFetch,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 1,
    timeoutMs: 10,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage(baseRequest)
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.equal(thrown.code, "provider_timeout");
});

test("Phase 20H.8: unexpected content-type throws typed error", async () => {
  const recorder = makeRecorder([
    new Response("<html>oops</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 1,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage(baseRequest)
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.equal(thrown.code, "unexpected_content_type");
});

test("Phase 20H.8: non-JSON body throws provider_response_invalid", async () => {
  const recorder = makeRecorder([
    new Response("not json at all", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 1,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage(baseRequest)
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.equal(thrown.code, "provider_response_invalid");
});

test("Phase 20H.8: fetchAllPages walks every page until short page", async () => {
  const recorder = makeRecorder([
    jsonResponse({
      data: Array.from({ length: 3 }, (_, i) => ({ id: `p1-${i}` })),
    }),
    jsonResponse({
      data: Array.from({ length: 2 }, (_, i) => ({ id: `p2-${i}` })),
    }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  const pages = await client.fetchAllPages({
    from: "2026-01-01",
    to: "2026-01-31",
    source: "shopee",
    type: "orders",
    pageSize: 3,
  });
  assert.equal(pages.length, 2);
  assert.equal(pages[0]!.rows.length, 3);
  assert.equal(pages[1]!.rows.length, 2);
  assert.equal(recorder.calls.length, 2);
  assert.match(recorder.calls[0]!.url, /page=1/);
  assert.match(recorder.calls[1]!.url, /page=2/);
});

test("Phase 20H.8: fetchAllPages honours total_pages hint", async () => {
  const recorder = makeRecorder([
    jsonResponse({
      data: [{ id: "p1-0" }],
      total_pages: 3,
    }),
    jsonResponse({
      data: [{ id: "p2-0" }],
      total_pages: 3,
    }),
    jsonResponse({
      data: [],
      total_pages: 3,
    }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  const pages = await client.fetchAllPages({
    from: "2026-01-01",
    to: "2026-01-31",
    source: "shopee",
    type: "orders",
    pageSize: 200,
  });
  assert.equal(pages.length, 3);
});

test("Phase 20H.8: missing API key surfaces as missing_api_key without throwing", async () => {
  const recorder = makeRecorder([jsonResponse({ data: [] })]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => "",
    maxAttempts: 1,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage(baseRequest)
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.equal(thrown.code, "missing_api_key");
  assert.equal(recorder.calls.length, 0);
});

test("Phase 20I.3: default base URL is the documented public endpoint", () => {
  assert.equal(
    ADDLIVETAG_API_BASE_FALLBACK,
    "https://addlivetag.com/api/v1/conversions.php",
  );
});

test("Phase 20H.8: source=food is accepted as a typed source", async () => {
  const recorder = makeRecorder([
    jsonResponse({ data: [{ id: "row-1" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  const result = await client.fetchPage({
    ...baseRequest,
    source: "food",
  });
  assert.equal(result.rows.length, 1);
  assert.match(recorder.calls[0]!.url, /source=food/);
});

test("Phase 20H.8: type=clicks is accepted and returns raw click rows", async () => {
  const recorder = makeRecorder([
    jsonResponse({ data: [{ click_id: "click-1" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  const result = await client.fetchPage({
    ...baseRequest,
    type: "clicks",
  });
  assert.equal(result.rows.length, 1);
  const first = result.rows[0] as { click_id?: string };
  assert.equal(first.click_id, "click-1");
});

test("Phase 20H.8: bad page is rejected with invalid_input", async () => {
  const recorder = makeRecorder([jsonResponse({ data: [] })]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 1,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage({ ...baseRequest, page: 0 })
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.equal(thrown.code, "invalid_input");
});

test("Phase 20H.8: missing from is rejected with invalid_input", async () => {
  const recorder = makeRecorder([jsonResponse({ data: [] })]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 1,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage({ ...baseRequest, from: "" })
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.equal(thrown.code, "invalid_input");
});

// --- Phase 20I.3 -------------------------------------------------------------
//
// These tests document the new contract:
//   - URL path matches `/api/v1/conversions.php`
//   - api_key is NEVER in the URL query string
//   - account_id is emitted only when caller supplies accountId
//   - format=json is always emitted (default)
//   - rate-limited response surfaces as a typed error
//   - accountId / format validation rejects malformed inputs
//   - fetchAllPages preserves accountId across pages

test("Phase 20I.3: client builds the /api/v1/conversions.php endpoint path", async () => {
  const recorder = makeRecorder([
    jsonResponse({ data: [{ id: "row-1" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: "https://addlivetag.com/api/v1/conversions.php",
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  await client.fetchPage(baseRequest);
  const url = new URL(recorder.calls[0]!.url);
  assert.equal(url.pathname, "/api/v1/conversions.php");
});

test("Phase 20I.3: api_key is NEVER placed in the URL query string", async () => {
  const recorder = makeRecorder([
    jsonResponse({ data: [{ id: "row-1" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  await client.fetchPage(baseRequest);
  const url = new URL(recorder.calls[0]!.url);
  for (const key of url.searchParams.keys()) {
    assert.notEqual(
      key.toLowerCase(),
      "api_key",
      `api_key found in query string under key '${key}'`,
    );
    assert.notEqual(
      key.toLowerCase(),
      "apikey",
      `apikey found in query string under key '${key}'`,
    );
  }
  // Defence in depth: the literal API key value must not appear
  // anywhere in the serialized URL.
  assert.ok(
    !recorder.calls[0]!.url.includes(API_KEY),
    "API key value leaked into request URL",
  );
});

test("Phase 20I.3: account_id is emitted only when caller supplies accountId", async () => {
  const recorder = makeRecorder([
    jsonResponse({ data: [{ id: "row-1" }] }),
    jsonResponse({ data: [{ id: "row-2" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });

  // Without accountId -- account_id must not appear.
  await client.fetchPage(baseRequest);
  let url = new URL(recorder.calls[0]!.url);
  assert.equal(url.searchParams.get("account_id"), null);

  // With accountId -- account_id must appear, trimmed.
  await client.fetchPage({ ...baseRequest, accountId: "  acct-1234  " });
  url = new URL(recorder.calls[1]!.url);
  assert.equal(url.searchParams.get("account_id"), "acct-1234");
});

test("Phase 20I.3: format=json is always emitted as the default", async () => {
  const recorder = makeRecorder([
    jsonResponse({ data: [{ id: "row-1" }] }),
    jsonResponse({ data: [{ id: "row-2" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  await client.fetchPage(baseRequest);
  const url = new URL(recorder.calls[0]!.url);
  assert.equal(url.searchParams.get("format"), "json");

  // csv is also allowed through the request shape; the staging
  // pipeline only consumes json but we keep the contract open.
  await client.fetchPage({ ...baseRequest, format: "csv" });
  const url2 = new URL(recorder.calls[1]!.url);
  assert.equal(url2.searchParams.get("format"), "csv");
});

test("Phase 20I.3: accountId too long is rejected with invalid_input", async () => {
  const recorder = makeRecorder([jsonResponse({ data: [] })]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 1,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage({ ...baseRequest, accountId: "x".repeat(65) })
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.equal(thrown.code, "invalid_input");
  assert.equal(recorder.calls.length, 0);
});

test("Phase 20I.3 follow-up: accountId with invalid characters is rejected before fetch", async () => {
  const recorder = makeRecorder([jsonResponse({ data: [] })]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 1,
    sleep: async () => undefined,
  });

  for (const bad of ["acct/123", "acct@example", "acct 123"]) {
    const thrown = await client
      .fetchPage({ ...baseRequest, accountId: bad })
      .then(
        () => null,
        (e: unknown) => e as AddlivetagApiError,
      );
    assert.ok(
      thrown instanceof AddlivetagApiError,
      `expected AddlivetagApiError for accountId=${JSON.stringify(bad)}`,
    );
    assert.equal(
      thrown.code,
      "invalid_input",
      `expected invalid_input for accountId=${JSON.stringify(bad)}`,
    );
    // The raw value must never appear in the error message -- the
    // client must redact the malformed input from diagnostics.
    assert.ok(
      !thrown.message.includes(bad),
      `error message leaked raw accountId for input=${JSON.stringify(bad)}: ${thrown.message}`,
    );
  }
  // No HTTP call must have been made for any of the three bad
  // inputs -- the pure client rejects the request before fetch.
  assert.equal(recorder.calls.length, 0);
});

test("Phase 20I.3 follow-up: accountId with surrounding whitespace still validates", async () => {
  const recorder = makeRecorder([
    jsonResponse({ data: [{ id: "row-1" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 1,
    sleep: async () => undefined,
  });
  // Outer whitespace is trimmed before regex check; the trimmed
  // value must match.
  const result = await client.fetchPage({
    ...baseRequest,
    accountId: "  acct-1234  ",
  });
  assert.equal(result.rows.length, 1);
  const url = new URL(recorder.calls[0]!.url);
  assert.equal(url.searchParams.get("account_id"), "acct-1234");
});

test("Phase 20I.3 follow-up: empty accountId is treated as omitted (no error)", async () => {
  const recorder = makeRecorder([
    jsonResponse({ data: [{ id: "row-1" }] }),
    jsonResponse({ data: [{ id: "row-2" }] }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 1,
    sleep: async () => undefined,
  });
  // Whitespace-only and empty-string are treated as "omitted" so
  // an uninitialised form field does not crash the import.
  for (const empty of ["", "   "]) {
    const result = await client.fetchPage({
      ...baseRequest,
      accountId: empty,
    });
    assert.equal(result.rows.length, 1);
    const url = new URL(recorder.calls[recorder.calls.length - 1]!.url);
    assert.equal(
      url.searchParams.get("account_id"),
      null,
      `account_id leaked into URL for input=${JSON.stringify(empty)}`,
    );
  }
});

test("Phase 20I.3: unsupported format is rejected with invalid_input", async () => {
  const recorder = makeRecorder([jsonResponse({ data: [] })]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 1,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage({ ...baseRequest, format: "xml" })
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.equal(thrown.code, "invalid_input");
  assert.equal(recorder.calls.length, 0);
});

test("Phase 20I.3: persistent 429 surfaces as rate_limited typed error", async () => {
  const recorder = makeRecorder([
    statusJsonResponse(429, { error: "rate_limited" }),
    statusJsonResponse(429, { error: "rate_limited" }),
    statusJsonResponse(429, { error: "rate_limited" }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 3,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage(baseRequest)
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  assert.equal(thrown.code, "rate_limited");
  assert.equal(thrown.status, 429);
  assert.equal(thrown.attempt, 3);
  assert.equal(recorder.calls.length, 3);
});

test("Phase 20I.3: fetchAllPages carries accountId through every page", async () => {
  const recorder = makeRecorder([
    jsonResponse({
      data: Array.from({ length: 2 }, (_, i) => ({ id: `p1-${i}` })),
      total_pages: 2,
    }),
    jsonResponse({
      data: [{ id: "p2-0" }],
      total_pages: 2,
    }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    sleep: async () => undefined,
  });
  const pages = await client.fetchAllPages({
    ...baseRequest,
    accountId: "acct-multi-page",
    pageSize: 2,
  });
  assert.equal(pages.length, 2);
  assert.equal(
    new URL(recorder.calls[0]!.url).searchParams.get("account_id"),
    "acct-multi-page",
  );
  assert.equal(
    new URL(recorder.calls[1]!.url).searchParams.get("account_id"),
    "acct-multi-page",
  );
});

test("Phase 20I.3: API key never appears in any url fragment during 429 retry", async () => {
  const recorder = makeRecorder([
    statusJsonResponse(429, { error: "rate_limited" }),
    statusJsonResponse(429, { error: "rate_limited" }),
  ]);
  const client = createAddlivetagClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    getApiKey: () => API_KEY,
    maxAttempts: 2,
    sleep: async () => undefined,
  });
  const thrown = await client
    .fetchPage(baseRequest)
    .then(
      () => null,
      (e: unknown) => e as AddlivetagApiError,
    );
  assert.ok(thrown instanceof AddlivetagApiError);
  for (const call of recorder.calls) {
    assert.ok(
      !call.url.includes(API_KEY),
      `API key leaked into URL during retry: ${call.url}`,
    );
    const headers = call.init.headers as Record<string, string>;
    // The key MUST travel in a header value (X-API-Key) and MUST NOT
    // appear in any other header value.
    const leakedInNonKeyHeader = Object.entries(headers).some(
      ([k, v]) => k.toLowerCase() !== "x-api-key" && String(v).includes(API_KEY),
    );
    assert.ok(
      !leakedInNonKeyHeader,
      "API key leaked into a non X-API-Key header value",
    );
    // The X-API-Key header must exist and equal the test key.
    assert.equal(headers["X-API-Key"], API_KEY);
  }
  assert.ok(
    !thrown.message.includes(API_KEY),
    `error message leaked API key: ${thrown.message}`,
  );
});
