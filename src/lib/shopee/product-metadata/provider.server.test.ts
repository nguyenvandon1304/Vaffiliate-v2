import test from "node:test";
import assert from "node:assert/strict";

import type { ShopeeProductMetadata } from "@/lib/shopee/product-metadata/types";
import { ShopeeProductMetadataError } from "./provider.errors";

let _impl: typeof import("./provider-impl") | undefined;
async function loadImpl() {
  if (_impl) return _impl;
  _impl = await import("./provider-impl");
  return _impl;
}

async function fetchShopeeProductMetadataFromUrl(
  productUrl: string,
  fetchImpl?: Parameters<typeof import("./provider-impl").fetchMetadataForIdentity>[1],
): Promise<ShopeeProductMetadata> {
  const impl = await loadImpl();
  const parser = await import("@/lib/shopee/product-url-parser");
  const resolution = parser.parseShopeeProductUrl(productUrl);
  return await impl.fetchMetadataForIdentity(
    {
      shopId: resolution.shopId,
      itemId: resolution.itemId,
      canonicalUrl: resolution.canonicalUrl,
    },
    fetchImpl ?? impl.productionFetch,
  );
}

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
      "content-type": init.contentType ?? "text/html; charset=utf-8",
    },
  });
}

const SHOPEE_HTML = `<html><head>
<meta property="og:title" content="Ao thun nam">
<meta property="og:image" content="https://down-vn.img.susercontent.com/ao-thun-nam.jpg">
<meta property="product:price:amount" content="123000">
<meta property="product:price:currency" content="VND">
</head></html>`;

test("returns typed metadata for a 200 HTML response", async () => {
  const fetchImpl = async (url: URL) => {
    assert.equal(url.toString(), IDENTITY.canonicalUrl);
    return jsonResponse(SHOPEE_HTML);
  };
  const metadata = await fetchShopeeProductMetadataFromUrl(
    IDENTITY.canonicalUrl,
    fetchImpl,
  );
  assert.equal(metadata.title, "Ao thun nam");
  assert.deepEqual(metadata.price, { amount: 123000, currency: "VND" });
});

test("non-2xx response -> non_2xx_response", async () => {
  const fetchImpl = async () =>
    jsonResponse("not found", { status: 404 });
  await assert.rejects(
    () => fetchShopeeProductMetadataFromUrl(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_not_found");
      return true;
    },
  );
});

test("HTTP 410 response -> product_not_found", async () => {
  const fetchImpl = async () =>
    jsonResponse("gone", { status: 410 });
  await assert.rejects(
    () => fetchShopeeProductMetadataFromUrl(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_not_found");
      return true;
    },
  );
});

test("HTTP 500 response -> non_2xx_response", async () => {
  const fetchImpl = async () =>
    jsonResponse("server error", { status: 500 });
  await assert.rejects(
    () => fetchShopeeProductMetadataFromUrl(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "non_2xx_response");
      return true;
    },
  );
});

test("non-HTML content type -> unexpected_content_type", async () => {
  const fetchImpl = async () =>
    jsonResponse('{"hello":"world"}', { contentType: "application/json" });
  await assert.rejects(
    () => fetchShopeeProductMetadataFromUrl(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "unexpected_content_type");
      return true;
    },
  );
});

test("oversized body -> body_too_large", async () => {
  const huge = "x".repeat(2_000_000);
  const fetchImpl = async () =>
    new Response(huge, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  await assert.rejects(
    () => fetchShopeeProductMetadataFromUrl(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "body_too_large");
      return true;
    },
  );
});

test("fetch throws (network failure) -> metadata_unavailable", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNRESET");
  };
  await assert.rejects(
    () => fetchShopeeProductMetadataFromUrl(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_unavailable");
      return true;
    },
  );
});

test("fetch throws AbortError -> provider_timeout", async () => {
  const fetchImpl = async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  };
  await assert.rejects(
    () => fetchShopeeProductMetadataFromUrl(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_timeout");
      return true;
    },
  );
});

test("redirect to hostile host -> redirect_to_hostile_target", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: URL) => {
    calls.push(url.toString());
    if (url.host === "shopee.vn") {
      return new Response(null, {
        status: 302,
        headers: { location: "https://attacker.example/product/9/9" },
      });
    }
    throw new Error(`unexpected fetch to ${url.toString()}`);
  };
  await assert.rejects(
    () => fetchShopeeProductMetadataFromUrl(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "redirect_to_hostile_target");
      return true;
    },
  );
  assert.deepEqual(calls, [IDENTITY.canonicalUrl]);
});

test("redirect chain that exceeds max redirects -> too_many_redirects", async () => {
  const fetchImpl = async (url: URL) =>
    new Response(null, {
      status: 302,
      headers: { location: url.toString() },
    });
  await assert.rejects(
    () => fetchShopeeProductMetadataFromUrl(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "too_many_redirects");
      return true;
    },
  );
});

test("redirect with missing location header -> redirect_failed", async () => {
  const fetchImpl = async () =>
    new Response(null, { status: 302 });
  await assert.rejects(
    () => fetchShopeeProductMetadataFromUrl(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "redirect_failed");
      return true;
    },
  );
});
