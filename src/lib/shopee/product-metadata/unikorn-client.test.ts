import test from "node:test";
import assert from "node:assert/strict";

import {
  createUnikornProductDataClient,
  type UnikornApiFetchLike,
} from "./unikorn-client";
import { ShopeeProductMetadataError } from "./provider.errors";

const IDENTITY = {
  shopId: "12345",
  itemId: "67890",
  canonicalUrl: "https://shopee.vn/product/12345/67890",
};

function jsonResponse(
  body: string,
  init: { status?: number; contentType?: string } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      "content-type": init.contentType ?? "application/json; charset=utf-8",
    },
  });
}

test("request URL contains only item_id", async () => {
  let capturedUrl: URL | undefined;
  const fetchImpl = async (url: URL) => {
    capturedUrl = url;
    return jsonResponse('{"status":"success","productInfo":{}}');
  };

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });
  await fetchUnikornProductMetadata(IDENTITY);

  assert.ok(capturedUrl instanceof URL);
  const requestUrl = capturedUrl;
  assert.equal(requestUrl.origin, "https://data.addlivetag.com");
  assert.equal(requestUrl.pathname, "/product-data/product-data.php");
  assert.equal(requestUrl.searchParams.get("item_id"), IDENTITY.itemId);
  assert.equal(requestUrl.searchParams.has("affiliate_id"), false);
  assert.equal(requestUrl.searchParams.has("networkSubId"), false);
  assert.equal(requestUrl.searchParams.has("publisher_id"), false);
  assert.equal(requestUrl.searchParams.has("shortCode"), false);
});

test("request never contains raw short URL", async () => {
  const capturedUrls: string[] = [];
  const fetchImpl = async (url: URL) => {
    capturedUrls.push(url.toString());
    return jsonResponse('{"status":"success","productInfo":{}}');
  };

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });
  await fetchUnikornProductMetadata(IDENTITY);

  for (const url of capturedUrls) {
    assert.ok(!url.includes("s.shopee.vn"), "Found short URL in: " + url);
    assert.ok(!url.includes("shortCode"), "Found shortCode in: " + url);
  }
});

test("timeout throws provider_timeout", async () => {
  const fetchImpl = async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  };

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });

  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_timeout");
      return true;
    },
  );
});

test("HTTP 429 throws provider_timeout", async () => {
  const fetchImpl = async () =>
    jsonResponse("rate limited", { status: 429 });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });

  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_timeout");
      return true;
    },
  );
});

test("HTTP 500 throws non_2xx_response", async () => {
  const fetchImpl = async () =>
    jsonResponse("server error", { status: 500 });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });

  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "non_2xx_response");
      return true;
    },
  );
});

test("HTTP 404 throws non_2xx_response", async () => {
  const fetchImpl = async () =>
    jsonResponse("not found", { status: 404 });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });

  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "non_2xx_response");
      return true;
    },
  );
});

test("HTTP 3xx redirect throws redirect_failed", async () => {
  const fetchImpl = async () =>
    new Response(null, {
      status: 302,
      headers: { location: "https://data.addlivetag.com/other" },
    });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });

  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "redirect_failed");
      return true;
    },
  );
});

test("invalid JSON throws provider_response_invalid", async () => {
  const fetchImpl = async () =>
    jsonResponse("not json", { contentType: "application/json" });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });

  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("invalid content type throws unexpected_content_type", async () => {
  const fetchImpl = async () =>
    jsonResponse('{"hello":"world"}', { contentType: "text/html" });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });

  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "unexpected_content_type");
      return true;
    },
  );
});

test("oversized response throws body_too_large", async () => {
  const huge = JSON.stringify({ status: "success", data: "x".repeat(300_000) });
  const fetchImpl = async () =>
    new Response(huge, {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });

  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "body_too_large");
      return true;
    },
  );
});

test("valid response returns parsed JSON", async () => {
  const responseBody = {
    status: "success",
    productInfo: {
      itemId: IDENTITY.itemId,
      shopId: IDENTITY.shopId,
      productName: "Test Product",
      price: 100000,
      imageUrl: "https://down-vn.img.susercontent.com/image.jpg",
      productLink: "https://shopee.vn/product/" + IDENTITY.shopId + "/" + IDENTITY.itemId,
      dataSource: "api",
    },
  };

  const fetchImpl = async () =>
    jsonResponse(JSON.stringify(responseBody), { contentType: "application/json" });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });
  const result = await fetchUnikornProductMetadata(IDENTITY);

  assert.deepEqual(result, responseBody);
});

test("network failure throws metadata_unavailable", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNREFUSED");
  };

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });

  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_unavailable");
      return true;
    },
  );
});

test("null content type throws unexpected_content_type", async () => {
  const fetchImpl = async () =>
    new Response('{"hello":"world"}', {
      status: 200,
      headers: {},
    });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });

  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "unexpected_content_type");
      return true;
    },
  );
});

test("text/json content type accepted", async () => {
  const fetchImpl = async () =>
    jsonResponse('{"status":"success","productInfo":{}}', {
      contentType: "text/json",
    });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });
  const result = await fetchUnikornProductMetadata(IDENTITY);
  assert.deepEqual(result, { status: "success", productInfo: {} });
});

test("application/vnd.api+json content type accepted", async () => {
  const fetchImpl = async () =>
    jsonResponse('{"status":"success","productInfo":{}}', {
      contentType: "application/vnd.api+json",
    });

  const fetchUnikornProductMetadata = createUnikornProductDataClient({ fetchImpl });
  const result = await fetchUnikornProductMetadata(IDENTITY);
  assert.deepEqual(result, { status: "success", productInfo: {} });
});

test("response body timeout: never-ending body triggers provider_timeout", async () => {
  // Build a 200 application/json Response whose body is a ReadableStream
  // that respects the supplied AbortSignal but never finishes. The fetchImpl
  // returns immediately after constructing the response.
  const fetchImpl: UnikornApiFetchLike = async (url, init) => {
    const externalSignal = init.signal ?? new AbortController().signal;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        externalSignal.addEventListener("abort", () => {
          try {
            controller.error(
              Object.assign(new Error("aborted"), { name: "AbortError" }),
            );
          } catch {
            // ignore
          }
        });
      },
      pull() {
        // Intentionally do not enqueue any chunks.
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const fetchUnikornProductMetadata = createUnikornProductDataClient({
    fetchImpl,
    timeoutMs: 25,
    maxResponseBytes: 1024,
  });

  const start = Date.now();
  await assert.rejects(
    () => fetchUnikornProductMetadata(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_timeout");
      return true;
    },
  );
  const elapsed = Date.now() - start;
  assert.ok(
    elapsed < 2000,
    `expected timeout to fire promptly; elapsed=${elapsed}ms`,
  );
});

test("response body timeout: normal completed body succeeds without late abort", async () => {
  let capturedSignal: AbortSignal | undefined;
  const fetchImpl: UnikornApiFetchLike = async (_url, init) => {
    const signal: AbortSignal | null | undefined = init.signal;
    assert.ok(signal instanceof AbortSignal);
    capturedSignal = signal;

    return jsonResponse(
      JSON.stringify({
        status: "success",
        productInfo: {},
      }),
      { contentType: "application/json" },
    );
  };

  const fetchUnikornProductMetadata = createUnikornProductDataClient({
    fetchImpl,
    timeoutMs: 50,
    maxResponseBytes: 1024,
  });

  const result = await fetchUnikornProductMetadata(IDENTITY);
  assert.deepEqual(result, { status: "success", productInfo: {} });

  const signal: AbortSignal | undefined = capturedSignal;
  assert.ok(signal instanceof AbortSignal);

  // Wait clearly beyond timeoutMs (50 ms) and confirm the signal
  // supplied to the first (and only) request was not aborted late.
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(signal.aborted, false);
});
