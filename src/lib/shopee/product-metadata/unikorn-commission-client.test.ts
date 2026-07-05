/**
 * Phase 20H.3f -- Unit tests for the pure Unikorn Shopee commission
 * client.
 *
 * These tests intentionally target the pure module
 * (`unikorn-commission-client.ts`) so they can run without the
 * `server-only` guard and without any process-wide fetch. The
 * production wrapper (`*.server.ts`) is a thin shim that delegates
 * to this module; testing this layer is sufficient to prove the
 * normalization, validation, and network-failure mapping contract.
 *
 * Hard contract being exercised:
 *
 *   - `status` MUST be exactly `"success"`; everything else is
 *     `commission_missing`;
 *   - `productInfo.commission` MUST be a non-negative safe integer;
 *     zero / negative / fractional / non-safe values become
 *     `commission_invalid`;
 *   - network failures (non-2xx, redirect, content-type, oversized
 *     body, JSON parse error, abort/timeout) all map to typed
 *     `ShopeeUnikornCommissionError` codes;
 *   - the request URL builder accepts `itemId` only, `canonicalUrl`
 *     only, or both (itemId takes precedence); missing both is an
 *     `invalid_input` failure;
 *   - the normalized response surfaces `commissionVnd` and the
 *     optional `sellerCommissionVnd`, `shopeeCommissionVnd`,
 *     `priceVnd`, `dataSource`, `itemId` fields when present.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  createUnikornCommissionClient,
  isValidIntegerVnd,
  normalizeUnikornCommissionResponse,
  ShopeeUnikornCommissionError,
  UNIKORN_API_BASE_FALLBACK,
  type UnikornApiFetchLike,
} from "./unikorn-commission-client";

const BASE = "https://example.test/unikorn/lookup";

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function emptyJsonResponse(): Response {
  return new Response("", {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makeRecorder(
  responses: ReadonlyArray<Response>,
): {
  fetchImpl: UnikornApiFetchLike;
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  return {
    fetchImpl: async (input, init) => {
      calls.push({ url: input.toString(), init });
      const r = responses[i] ?? responses[responses.length - 1];
      i += 1;
      return r;
    },
    calls,
  };
}

test("Phase 20H.3f client sends item_id when itemId is provided", async () => {
  const recorder = makeRecorder([
    okJsonResponse({
      status: "success",
      productInfo: {
        itemId: 44812498433,
        productName: "Stub",
        price: 161500,
        commission: 32300,
        dataSource: "db",
      },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  const result = await client({
    itemId: "44812498433",
    canonicalUrl: "https://shopee.vn/product/1408027998/44812498433",
  });

  assert.equal(result.commissionVnd, 32300);
  assert.equal(result.itemId, "44812498433");
  assert.equal(recorder.calls.length, 1);
  assert.equal(recorder.calls[0].init.method, "GET");
  assert.equal(
    (recorder.calls[0].init.headers as Record<string, string>).Accept,
    "application/json",
  );
  // The request URL MUST contain both query parameters; we don't
  // re-parse them through URLSearchParams here because the test
  // environment's URL/URLSearchParams can be subject to Node-version
  // differences. A substring check is sufficient to prove the
  // factory forwarded the resolved identity to the API.
  assert.match(recorder.calls[0].url, /item_id=44812498433/);
  assert.match(
    recorder.calls[0].url,
    /url=https%3A%2F%2Fshopee\.vn%2Fproduct%2F1408027998%2F44812498433/,
  );
});

test("Phase 20H.3f client falls back to url when itemId is missing", async () => {
  const recorder = makeRecorder([
    okJsonResponse({
      status: "success",
      productInfo: { commission: 21996 },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  const result = await client({
    canonicalUrl: "https://shopee.vn/product/1408027998/44812498433",
  });

  assert.equal(result.commissionVnd, 21996);
  // When itemId is omitted, the request URL MUST only contain `url`.
  assert.doesNotMatch(recorder.calls[0].url, /[?&]item_id=/);
  assert.match(
    recorder.calls[0].url,
    /url=https%3A%2F%2Fshopee\.vn%2Fproduct%2F1408027998%2F44812498433/,
  );
});

test("Phase 20H.3f client rejects requests with no itemId and no canonicalUrl", async () => {
  const recorder = makeRecorder([]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({}),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal((error as ShopeeUnikornCommissionError).code, "invalid_input");
      return true;
    },
  );
  assert.equal(recorder.calls.length, 0);
});

test("Phase 20H.3f client rejects non-success status", async () => {
  const recorder = makeRecorder([
    okJsonResponse({ status: "error", message: "rate-limited" }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "commission_missing",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects missing productInfo", async () => {
  const recorder = makeRecorder([
    okJsonResponse({ status: "success" }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "commission_missing",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects commission=0", async () => {
  const recorder = makeRecorder([
    okJsonResponse({
      status: "success",
      productInfo: { commission: 0 },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "commission_invalid",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects negative commission", async () => {
  const recorder = makeRecorder([
    okJsonResponse({
      status: "success",
      productInfo: { commission: -1 },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "commission_invalid",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects fractional commission", async () => {
  const recorder = makeRecorder([
    okJsonResponse({
      status: "success",
      productInfo: { commission: 21996.5 },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "commission_invalid",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects non-safe-integer commission", async () => {
  const recorder = makeRecorder([
    okJsonResponse({
      status: "success",
      productInfo: { commission: Number.MAX_SAFE_INTEGER + 2 },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "commission_invalid",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects non-JSON body", async () => {
  const recorder = makeRecorder([
    new Response("not json", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "provider_response_invalid",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects unexpected content type", async () => {
  const recorder = makeRecorder([
    new Response("<html>nope</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "unexpected_content_type",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects 5xx as non_2xx_response", async () => {
  const recorder = makeRecorder([
    new Response("upstream down", {
      status: 502,
      headers: { "content-type": "application/json" },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "non_2xx_response",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects 429 as provider_timeout", async () => {
  const recorder = makeRecorder([
    new Response(JSON.stringify({ status: "error" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "provider_timeout",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects 3xx redirect", async () => {
  const recorder = makeRecorder([
    new Response("redirect", {
      status: 302,
      headers: { "content-type": "application/json", location: BASE },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "redirect_failed",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects fetch rejection (network failure) as metadata_unavailable", async () => {
  const fetchImpl: UnikornApiFetchLike = async () => {
    throw new Error("ECONNRESET");
  };
  const client = createUnikornCommissionClient({ fetchImpl, baseUrl: BASE });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "metadata_unavailable",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects abort signal as provider_timeout", async () => {
  const fetchImpl: UnikornApiFetchLike = async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  };
  const client = createUnikornCommissionClient({ fetchImpl, baseUrl: BASE });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "provider_timeout",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client uses documented public endpoint by default", async () => {
  const recorder = makeRecorder([
    okJsonResponse({
      status: "success",
      productInfo: { commission: 32300 },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
  });

  const result = await client({ itemId: "44812498433" });

  assert.equal(result.commissionVnd, 32300);
  assert.equal(
    recorder.calls[0].url.startsWith(UNIKORN_API_BASE_FALLBACK),
    true,
    "default base URL must be the documented public endpoint",
  );
});

test("Phase 20H.3f normalize helper surfaces optional audit fields", () => {
  const result = normalizeUnikornCommissionResponse({
    status: "success",
    productInfo: {
      itemId: "44812498433",
      productName: "Stub",
      price: 161500,
      commission: 21996,
      sellerComFinal: 16497,
      shopeeComFinal: 5499,
      dataSource: "db",
    },
  });

  assert.equal(result.commissionVnd, 21996);
  assert.equal(result.sellerCommissionVnd, 16497);
  assert.equal(result.shopeeCommissionVnd, 5499);
  assert.equal(result.priceVnd, 161500);
  assert.equal(result.dataSource, "db");
  assert.equal(result.itemId, "44812498433");
});

test("Phase 20H.3f normalize helper accepts commission only payload", () => {
  const result = normalizeUnikornCommissionResponse({
    status: "success",
    productInfo: { commission: 32300 },
  });
  assert.deepEqual(result, { commissionVnd: 32300 });
});

test("Phase 20H.3f normalize helper ignores invalid optional fields silently", () => {
  const result = normalizeUnikornCommissionResponse({
    status: "success",
    productInfo: {
      commission: 32300,
      price: -10,
      sellerComFinal: "not-a-number",
      shopeeComFinal: 5499.75,
      dataSource: "",
    },
  });
  // Invalid optional fields are dropped, NOT surfaced as undefined.
  assert.equal(result.commissionVnd, 32300);
  assert.equal(result.sellerCommissionVnd, undefined);
  assert.equal(result.shopeeCommissionVnd, undefined);
  assert.equal(result.priceVnd, undefined);
  assert.equal(result.dataSource, undefined);
});

test("Phase 20H.3f isValidIntegerVnd only accepts finite safe non-negative integers", () => {
  assert.equal(isValidIntegerVnd(0), true);
  assert.equal(isValidIntegerVnd(32300), true);
  assert.equal(isValidIntegerVnd(Number.MAX_SAFE_INTEGER), true);

  assert.equal(isValidIntegerVnd(-1), false);
  assert.equal(isValidIntegerVnd(1.5), false);
  assert.equal(isValidIntegerVnd(Number.NaN), false);
  assert.equal(isValidIntegerVnd(Number.POSITIVE_INFINITY), false);
  assert.equal(isValidIntegerVnd("100"), false);
  assert.equal(isValidIntegerVnd(null), false);
  assert.equal(isValidIntegerVnd(Number.MAX_SAFE_INTEGER + 2), false);
});

test("Phase 20H.3f client rejects empty JSON body as provider_response_invalid", async () => {
  // `JSON.parse("")` throws before we reach the shape validator, so
  // the contract surfaces the failure as provider_response_invalid
  // rather than commission_missing. Both failure codes are valid
  // "unavailable" signals; the test pins the documented behavior so
  // a future refactor cannot silently re-route empty bodies.
  const recorder = makeRecorder([emptyJsonResponse()]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "provider_response_invalid",
      );
      return true;
    },
  );
});

test("Phase 20H.3f client rejects oversized body", async () => {
  const recorder = makeRecorder([
    new Response("a".repeat(300_000), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ]);
  const client = createUnikornCommissionClient({
    fetchImpl: recorder.fetchImpl,
    baseUrl: BASE,
    maxResponseBytes: 1024,
  });

  await assert.rejects(
    () => client({ itemId: "44812498433" }),
    (error: unknown) => {
      assert.ok(error instanceof ShopeeUnikornCommissionError);
      assert.equal(
        (error as ShopeeUnikornCommissionError).code,
        "body_too_large",
      );
      return true;
    },
  );
});
