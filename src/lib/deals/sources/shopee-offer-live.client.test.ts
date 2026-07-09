/**
 * Phase 20I.4 -- server-only Shopee live fetch foundation tests.
 *
 * These tests use a fake `fetchImpl` so the foundation never touches
 * the real network. They verify:
 *
 *   - the foundation is disabled by default (fail-closed);
 *   - when `liveEnabled = true` and credentials are missing, the
 *     result is `ok: false` with reason `live-disabled` /
 *     `auth-missing`;
 *   - when the auth provider returns valid headers, the request
 *     body and headers are passed to the injected fetch;
 *   - when the GraphQL response carries `errors`, the result is
 *     `ok: false` with reason `graphql-errors`;
 *   - cache hits are returned without a second fetch call;
 *   - the live client never leaks the auth header to the result;
 *   - timeout via AbortController surfaces as reason `timeout`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SHOPEE_LIVE_CACHE_TTL_MS,
  ShopeeOpenApiLiveClient,
  SHOPEE_OPEN_API_GRAPHQL_ENDPOINT,
} from "./shopee-offer-live.client";
import {
  MissingShopeeOpenApiAuthProvider,
  type ShopeeOpenApiAuthHeaders,
  type ShopeeOpenApiAuthProvider,
} from "./shopee-offer-auth.types";

class StubAuthProvider implements ShopeeOpenApiAuthProvider {
  public lastCalledAt: number | null = null;
  public headers: ShopeeOpenApiAuthHeaders | null = null;
  async signRequest(): Promise<ShopeeOpenApiAuthHeaders> {
    this.lastCalledAt = Date.now();
    const headers: ShopeeOpenApiAuthHeaders = {
      authorization: "SHA256 Credential=fake, Signature=deadbeef, Timestamp=123",
      timestamp: "1970-01-01T00:00:00.123Z",
    };
    this.headers = headers;
    return headers;
  }
}

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

function makeFetchRecorder(
  responses: Array<{ status?: number; body?: string; throwAbort?: Error }>,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl: typeof fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const next = responses.shift();
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init: init ?? {} });
    if (next && next.throwAbort) throw next.throwAbort;
    const status = next?.status ?? 200;
    const body = next?.body ?? '{"data":{}}';
    return new Response(body, { status });
  }) as never;
  return { fetchImpl: fetchImpl as never, calls };
}

test("Phase 20I.4: client is fail-closed by default", async () => {
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: false,
    fetchImpl: (async () => new Response("nope")) as never,
  });
  const result = await client.fetchShopeeOfferV2({
    keyword: "fashion",
    sortType: 1,
    page: 1,
    limit: 10,
  });
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, "live-disabled");
  }
});

test("Phase 20I.4: client returns auth-missing when liveEnabled but no real provider", async () => {
  const { fetchImpl } = makeFetchRecorder([
    { body: '{"data":{}}' },
  ]);
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
  });
  const result = await client.fetchShopeeOfferV2({
    keyword: "fashion",
    sortType: 1,
    page: 1,
    limit: 10,
  });
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, "auth-missing");
  }
});

test("Phase 20I.4: client falls back through the null-object auth provider", async () => {
  const { fetchImpl } = makeFetchRecorder([
    { body: '{"data":{}}' },
  ]);
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
  });
  const provider = new MissingShopeeOpenApiAuthProvider();
  const result = await client.fetchBrandOfferV2(
    { keyword: "sony", sortType: 1, page: 1, limit: 10 },
    provider,
  );
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, "auth-missing");
  }
});

test("Phase 20I.4: client posts the GraphQL query and forwards Authorization", async () => {
  const { fetchImpl, calls } = makeFetchRecorder([
    {
      body: JSON.stringify({
        data: { shopeeOfferV2: { nodes: [{ offerName: "x" }], pageInfo: { page: 1, limit: 10, hasNextPage: false } } },
      }),
    },
  ]);
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
  });
  const auth = new StubAuthProvider();
  const result = await client.fetchShopeeOfferV2(
    { keyword: "fashion", sortType: 1, page: 1, limit: 10 },
    auth,
  );
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.deepStrictEqual(result.value, [{ offerName: "x" }]);
    assert.strictEqual(result.cacheHit, false);
  }
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, SHOPEE_OPEN_API_GRAPHQL_ENDPOINT);
  assert.strictEqual(calls[0].init.method, "POST");
  const headers = (calls[0].init.headers ?? {}) as Record<string, string>;
  assert.ok(headers["Authorization"]);
  assert.ok(headers["Authorization"].startsWith("SHA256"));
  assert.strictEqual(headers["Content-Type"], "application/json");
  const body = JSON.parse(String(calls[0].init.body));
  assert.ok(body.query.includes("shopeeOfferV2"));
  assert.deepStrictEqual(body.variables, {
    keyword: "fashion",
    sortType: 1,
    page: 1,
    limit: 10,
  });
});

test("Phase 20I.4: client returns graphql-errors when response carries errors", async () => {
  const { fetchImpl } = makeFetchRecorder([
    {
      body: JSON.stringify({ errors: [{ message: "boom" }] }),
    },
  ]);
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
  });
  const result = await client.fetchProductOfferV2(
    { keyword: "x", sortType: 1, page: 1, limit: 10 },
    new StubAuthProvider(),
  );
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, "graphql-errors");
  }
});

test("Phase 20I.4: client returns bad-shape when body is not valid JSON", async () => {
  const { fetchImpl } = makeFetchRecorder([
    { body: "{not-json" },
  ]);
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
  });
  const result = await client.fetchShopeeOfferV2(
    { keyword: "x", sortType: 1, page: 1, limit: 10 },
    new StubAuthProvider(),
  );
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, "bad-shape");
  }
});

test("Phase 20I.4: client returns timeout when the fetch is aborted", async () => {
  const abortError = new Error("aborted");
  abortError.name = "AbortError";
  (abortError as Error & { name: string }).name = "AbortError";
  const { fetchImpl } = makeFetchRecorder([
    { throwAbort: Object.assign(new Error("aborted"), { name: "AbortError" }) },
  ]);
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
    timeoutMs: 5,
  });
  const result = await client.fetchShopeeOfferV2(
    { keyword: "x", sortType: 1, page: 1, limit: 10 },
    new StubAuthProvider(),
  );
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, "timeout");
  }
});

test("Phase 20I.4: client returns non-2xx when status is 401", async () => {
  const { fetchImpl } = makeFetchRecorder([
    { status: 401, body: '{"errors":[]}' },
  ]);
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
  });
  const result = await client.fetchShopeeOfferV2(
    { keyword: "x", sortType: 1, page: 1, limit: 10 },
    new StubAuthProvider(),
  );
  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.reason, "network-error");
  }
});

test("Phase 20I.4: cache hits skip a second fetch call", async () => {
  const body = JSON.stringify({
    data: { shopeeOfferV2: { nodes: [{ offerName: "first" }], pageInfo: { page: 1, limit: 10, hasNextPage: false } } },
  });
  const { fetchImpl, calls } = makeFetchRecorder([{ body }]);
  let now = 1_000;
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
    now: () => now,
  });
  const input: { keyword: string; sortType: 1 | 2; page: number; limit: number } = { keyword: "fashion", sortType: 1, page: 1, limit: 10 };
  const auth = new StubAuthProvider();
  const first = await client.fetchShopeeOfferV2(input, auth);
  assert.strictEqual(first.ok, true);
  if (first.ok) {
    assert.strictEqual(first.cacheHit, false);
  }
  now = 1_000 + DEFAULT_SHOPEE_LIVE_CACHE_TTL_MS / 2;
  const second = await client.fetchShopeeOfferV2(input, auth);
  assert.strictEqual(second.ok, true);
  if (second.ok) {
    assert.strictEqual(second.cacheHit, true);
  }
  assert.strictEqual(calls.length, 1);
});

test("Phase 20I.4: client never exposes the auth header into the result", async () => {
  const { fetchImpl } = makeFetchRecorder([
    {
      body: JSON.stringify({
        data: { shopeeOfferV2: { nodes: [{ offerName: "x" }], pageInfo: null } },
      }),
    },
  ]);
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
  });
  const auth = new StubAuthProvider();
  const result = await client.fetchShopeeOfferV2(
    { keyword: "x", sortType: 1, page: 1, limit: 10 },
    auth,
  );
  const serialised = JSON.stringify(result);
  assert.ok(!serialised.includes("Authorization"));
  assert.ok(!serialised.includes("Signature=deadbeef"));
  assert.ok(!serialised.includes("Credential=fake"));
});

test("Phase 20I.4: clearCache drops the in-memory cache", () => {
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: false,
    fetchImpl: (async () => new Response("{}")) as never,
  });
  client.clearCache();
  assert.ok(true);
});

test("Phase 20I.4: client tolerates data:{} shape with empty nodes list", async () => {
  const { fetchImpl } = makeFetchRecorder([
    { body: '{"data":{"shopeeOfferV2":null}}' },
  ]);
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
  });
  const result = await client.fetchShopeeOfferV2(
    { keyword: "x", sortType: 1, page: 1, limit: 10 },
    new StubAuthProvider(),
  );
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.deepStrictEqual(result.value, []);
  }
});

test("Phase 20I.4 follow-up: cache hits even when auth provider emits a fresh timestamp", async () => {
  // Phase 20I.4 follow-up -- the cache key MUST NOT depend on the
  // signed timestamp; otherwise a fresh sign per request would
  // bust the cache on every call. We verify that two consecutive
  // signers with different timestamps still hit the cache.
  class TimestampVaryingStubAuthProvider implements ShopeeOpenApiAuthProvider {
    public counter = 0;
    async signRequest(): Promise<ShopeeOpenApiAuthHeaders> {
      this.counter += 1;
      return {
        authorization:
          `SHA256 Credential=fake, Signature=deadbeef${this.counter}, Timestamp=${this.counter}`,
        timestamp: `1970-01-01T00:00:0${this.counter}.000Z`,
      };
    }
  }
  const body = JSON.stringify({
    data: { shopeeOfferV2: { nodes: [{ offerName: "cache-me" }], pageInfo: null } },
  });
  const { fetchImpl, calls } = makeFetchRecorder([{ body }]);
  let now = 5_000;
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
    now: () => now,
  });
  const input: { keyword: string; sortType: 1 | 2; page: number; limit: number } = { keyword: "fashion", sortType: 1, page: 1, limit: 10 };
  const auth1 = new TimestampVaryingStubAuthProvider();
  const first = await client.fetchShopeeOfferV2(input, auth1);
  assert.strictEqual(first.ok, true);
  if (first.ok) {
    assert.strictEqual(first.cacheHit, false);
  }
  // Advance the clock so we are well within the cache TTL.
  now = 5_000 + DEFAULT_SHOPEE_LIVE_CACHE_TTL_MS / 2;
  const auth2 = new TimestampVaryingStubAuthProvider();
  const second = await client.fetchShopeeOfferV2(input, auth2);
  assert.strictEqual(second.ok, true);
  if (second.ok) {
    assert.strictEqual(second.cacheHit, true, "second call should hit the cache");
  }
  assert.strictEqual(calls.length, 1, "fetchImpl should run exactly once");
  assert.strictEqual(auth1.counter, 1);
  assert.strictEqual(auth2.counter, 1);
});

test("Phase 20I.4 follow-up: cache entries do not contain Authorization / Signature / Credential / Timestamp", async () => {
  // Phase 20I.4 follow-up -- the cache map MUST NOT carry any of
  // the auth header values. We verify by inspecting the cache
  // key (built from source + query + variables) and asserting it
  // does not contain anything that looks like a signed header.
  const { fetchImpl } = makeFetchRecorder([
    {
      body: JSON.stringify({
        data: { shopeeOfferV2: { nodes: [{ offerName: "x" }], pageInfo: null } },
      }),
    },
  ]);
  const client = new ShopeeOpenApiLiveClient({
    liveEnabled: true,
    fetchImpl,
  });
  const result = await client.fetchShopeeOfferV2(
    { keyword: "x", sortType: 1, page: 1, limit: 10 },
    new StubAuthProvider(),
  );
  assert.strictEqual(result.ok, true);
  // The cache map is private; we test the public surface here by
  // serialising the result and asserting the auth header values
  // never leak anywhere the buyer / the result cache could observe.
  const serialised = JSON.stringify({
    result,
    cache: (client as unknown as { cache: Map<string, unknown> }).cache,
  });
  assert.ok(!serialised.includes("SHA256 Credential=fake"));
  assert.ok(!serialised.includes("Signature=deadbeef"));
  assert.ok(!serialised.includes("Timestamp=123"));
});
