import test from "node:test";
import assert from "node:assert/strict";

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import type { ShopeeProductMetadata } from "@/lib/shopee/product-metadata/types";
import type { ShopeeProductMetadataFetchLike } from "@/lib/shopee/product-metadata/provider-impl";
import { ShopeeProductMetadataError } from "@/lib/shopee/product-metadata/provider.errors";
import { fetchMetadataForIdentity as fetchMetadataForIdentityFromHtml } from "@/lib/shopee/product-metadata/provider-impl";
import {
  createFetchShopeeProductMetadataFromUrl,
  type FetchShopeeProductMetadataFromUrlFn,
  type LegacyMetadataWrapperDeps,
} from "@/lib/shopee/product-metadata/provider-legacy-wrapper";

const IDENTITY: ShopeeProductIdentity = {
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

/**
 * Build a wrapper from a recorder. Each dependency captures its
 * arguments so tests can assert call order and argument shapes.
 *
 * Each dependency is set up to record calls and (optionally) throw or
 * return a custom value.
 */
function buildWrapper(opts: {
  resolveProductUrl?: (productUrl: string) => Promise<ShopeeProductIdentity>;
  fetchDefaultMetadata?: (identity: ShopeeProductIdentity) => Promise<ShopeeProductMetadata>;
  fetchHtmlMetadata?: (
    identity: ShopeeProductIdentity,
    fetchImpl: ShopeeProductMetadataFetchLike,
  ) => Promise<ShopeeProductMetadata>;
} = {}): {
  wrapper: FetchShopeeProductMetadataFromUrlFn;
  calls: {
    resolve: { productUrls: string[] };
    defaultMetadata: { identities: ShopeeProductIdentity[] };
    htmlMetadata: {
      identities: ShopeeProductIdentity[];
      fetchImpls: ShopeeProductMetadataFetchLike[];
    };
  };
} {
  const calls = {
    resolve: { productUrls: [] as string[] },
    defaultMetadata: { identities: [] as ShopeeProductIdentity[] },
    htmlMetadata: { identities: [] as ShopeeProductIdentity[], fetchImpls: [] as ShopeeProductMetadataFetchLike[] },
  };

  const resolveProductUrl: LegacyMetadataWrapperDeps["resolveProductUrl"] =
    opts.resolveProductUrl ??
    (async (productUrl) => {
      calls.resolve.productUrls.push(productUrl);
      return IDENTITY;
    });

  const fetchDefaultMetadata: LegacyMetadataWrapperDeps["fetchDefaultMetadata"] =
    opts.fetchDefaultMetadata ??
    (async (identity) => {
      calls.defaultMetadata.identities.push(identity);
      return {
        shopId: identity.shopId,
        itemId: identity.itemId,
        canonicalUrl: identity.canonicalUrl,
        title: "Default Provider Result",
        imageUrl: "https://down-vn.img.susercontent.com/default.jpg",
        price: { amount: 1000, currency: "VND" },
        availability: "unknown",
      };
    });

  const fetchHtmlMetadata: LegacyMetadataWrapperDeps["fetchHtmlMetadata"] =
    opts.fetchHtmlMetadata ??
    (async (identity, fetchImpl) => {
      calls.htmlMetadata.identities.push(identity);
      calls.htmlMetadata.fetchImpls.push(fetchImpl);
      return {
        shopId: identity.shopId,
        itemId: identity.itemId,
        canonicalUrl: identity.canonicalUrl,
        title: "HTML Provider Result",
        imageUrl: "https://down-vn.img.susercontent.com/html.jpg",
        price: { amount: 1, currency: "VND" },
        availability: "unknown",
      };
    });

  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl,
    fetchDefaultMetadata,
    fetchHtmlMetadata,
  });

  return {
    wrapper,
    calls,
  };
}

// --- Brief required cases ---

test("1. direct URL is passed to resolveProductUrl", async () => {
  const { wrapper, calls } = buildWrapper();
  await wrapper("https://shopee.vn/product/12345/67890");
  assert.deepEqual(calls.resolve.productUrls, [
    "https://shopee.vn/product/12345/67890",
  ]);
});

test("2. short URL is passed unchanged to resolveProductUrl", async () => {
  const { wrapper, calls } = buildWrapper();
  await wrapper("https://s.shopee.vn/abc123");
  assert.deepEqual(calls.resolve.productUrls, ["https://s.shopee.vn/abc123"]);
});

test("3. resolved identity is passed to fetchDefaultMetadata", async () => {
  const { wrapper, calls } = buildWrapper();
  await wrapper("https://shopee.vn/product/12345/67890");
  assert.equal(calls.defaultMetadata.identities.length, 1);
  assert.deepEqual(calls.defaultMetadata.identities[0], IDENTITY);
});

test("4. omitted fetchImpl uses fetchDefaultMetadata", async () => {
  const { wrapper, calls } = buildWrapper();
  const metadata = await wrapper("https://shopee.vn/product/12345/67890");
  assert.equal(calls.defaultMetadata.identities.length, 1);
  assert.equal(calls.htmlMetadata.identities.length, 0);
  assert.equal(metadata.title, "Default Provider Result");
});

test("5. explicit fetchImpl uses fetchHtmlMetadata", async () => {
  const { wrapper, calls } = buildWrapper();
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    jsonResponse(SHOPEE_HTML);
  const metadata = await wrapper(
    "https://shopee.vn/product/12345/67890",
    fetchImpl,
  );
  assert.equal(calls.htmlMetadata.identities.length, 1);
  assert.deepEqual(calls.htmlMetadata.identities[0], IDENTITY);
  assert.equal(calls.htmlMetadata.fetchImpls.length, 1);
  assert.equal(calls.htmlMetadata.fetchImpls[0], fetchImpl);
  assert.equal(metadata.title, "HTML Provider Result");
});

test("6. explicit fetchImpl does not call fetchDefaultMetadata", async () => {
  const { wrapper, calls } = buildWrapper();
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    jsonResponse(SHOPEE_HTML);
  await wrapper("https://shopee.vn/product/12345/67890", fetchImpl);
  assert.equal(calls.defaultMetadata.identities.length, 0);
});

test("7. resolver typed failure propagates", async () => {
  const { wrapper } = buildWrapper({
    resolveProductUrl: async () => {
      throw new ShopeeProductMetadataError(
        "redirect_to_hostile_target",
        "URL redirected to a host outside the allowlist",
      );
    },
  });
  await assert.rejects(
    () => wrapper("https://s.shopee.vn/abc123"),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "redirect_to_hostile_target");
      return true;
    },
  );
});

test("8. default-provider typed failure propagates", async () => {
  const { wrapper } = buildWrapper({
    fetchDefaultMetadata: async () => {
      throw new ShopeeProductMetadataError(
        "product_not_found",
        "Product is no longer available",
      );
    },
  });
  await assert.rejects(
    () => wrapper("https://shopee.vn/product/12345/67890"),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_not_found");
      return true;
    },
  );
});

test("9. HTML-provider typed failure propagates", async () => {
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    jsonResponse("not found", { status: 404 });
  const { wrapper } = buildWrapper({
    fetchHtmlMetadata: async () => {
      throw new ShopeeProductMetadataError(
        "product_not_found",
        "Product is no longer available",
      );
    },
  });
  await assert.rejects(
    () => wrapper("https://shopee.vn/product/12345/67890", fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_not_found");
      return true;
    },
  );
});

test("10. no dependency is called more than required", async () => {
  // Test the omitted-fetchImpl branch: only resolveProductUrl and
  // fetchDefaultMetadata must be called; fetchHtmlMetadata must not.
  let defaultResolveCalls = 0;
  let defaultDefaultCalls = 0;
  let defaultHtmlCalls = 0;
  const defaultWrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => {
      defaultResolveCalls += 1;
      return IDENTITY;
    },
    fetchDefaultMetadata: async () => {
      defaultDefaultCalls += 1;
      return {
        shopId: IDENTITY.shopId,
        itemId: IDENTITY.itemId,
        canonicalUrl: IDENTITY.canonicalUrl,
        title: "default",
        imageUrl: "https://down-vn.img.susercontent.com/d.jpg",
        price: { amount: 1, currency: "VND" },
        availability: "unknown",
      };
    },
    fetchHtmlMetadata: async () => {
      defaultHtmlCalls += 1;
      throw new Error("fetchHtmlMetadata must not be called when fetchImpl is omitted");
    },
  });
  await defaultWrapper("https://shopee.vn/product/12345/67890");
  assert.equal(defaultResolveCalls, 1);
  assert.equal(defaultDefaultCalls, 1);
  assert.equal(defaultHtmlCalls, 0);

  // Test the explicit-fetchImpl branch: only resolveProductUrl and
  // fetchHtmlMetadata must be called; fetchDefaultMetadata must not.
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    jsonResponse(SHOPEE_HTML);
  let resolveCalls = 0;
  let defaultCalls = 0;
  let htmlCalls = 0;
  const explicitWrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async (value) => {
      resolveCalls += 1;
      assert.equal(value, "https://shopee.vn/product/12345/67890");
      return IDENTITY;
    },
    fetchDefaultMetadata: async () => {
      defaultCalls += 1;
      throw new Error("fetchDefaultMetadata must not be called when fetchImpl is supplied");
    },
    fetchHtmlMetadata: async () => {
      htmlCalls += 1;
      return {
        shopId: IDENTITY.shopId,
        itemId: IDENTITY.itemId,
        canonicalUrl: IDENTITY.canonicalUrl,
        title: "html",
        imageUrl: "https://down-vn.img.susercontent.com/h.jpg",
        price: { amount: 1, currency: "VND" },
        availability: "unknown",
      };
    },
  });
  await explicitWrapper("https://shopee.vn/product/12345/67890", fetchImpl);
  assert.equal(resolveCalls, 1);
  assert.equal(defaultCalls, 0);
  assert.equal(htmlCalls, 1);
});

// --- Existing HTML provider security tests, intact ---

/**
 * The wrapper factory's `fetchHtmlMetadata` dep is exercised below
 * with the real HTML provider implementation. This preserves the
 * existing end-to-end HTML provider security tests:
 *
 *   - 200 OK with valid metadata
 *   - non-2xx (404) -> product_not_found
 *   - HTTP 410 -> product_not_found
 *   - HTTP 500 -> non_2xx_response
 *   - non-HTML content type -> unexpected_content_type
 *   - oversized body -> body_too_large
 *   - network failure -> metadata_unavailable
 *   - AbortError -> provider_timeout
 *   - redirect to hostile host -> redirect_to_hostile_target
 *   - too many redirects -> too_many_redirects
 *   - redirect with missing location -> redirect_failed
 *
 * These tests do not duplicate any secured resolver implementation.
 */

test("HTML provider: 200 OK returns typed metadata", async () => {
  const seenUrls: string[] = [];
  const fetchImpl: ShopeeProductMetadataFetchLike = async (url) => {
    seenUrls.push(url.toString());
    return jsonResponse(SHOPEE_HTML);
  };
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("fetchDefaultMetadata must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  const metadata = await wrapper(IDENTITY.canonicalUrl, fetchImpl);
  assert.equal(metadata.title, "Ao thun nam");
  assert.deepEqual(metadata.price, { amount: 123000, currency: "VND" });
  assert.deepEqual(seenUrls, [IDENTITY.canonicalUrl]);
});

test("HTML provider: non-2xx (404) -> product_not_found", async () => {
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    jsonResponse("not found", { status: 404 });
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  await assert.rejects(
    () => wrapper(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_not_found");
      return true;
    },
  );
});

test("HTML provider: HTTP 410 -> product_not_found", async () => {
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    jsonResponse("gone", { status: 410 });
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  await assert.rejects(
    () => wrapper(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_not_found");
      return true;
    },
  );
});

test("HTML provider: HTTP 500 -> non_2xx_response", async () => {
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    jsonResponse("server error", { status: 500 });
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  await assert.rejects(
    () => wrapper(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "non_2xx_response");
      return true;
    },
  );
});

test("HTML provider: non-HTML content type -> unexpected_content_type", async () => {
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    jsonResponse('{"hello":"world"}', { contentType: "application/json" });
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  await assert.rejects(
    () => wrapper(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "unexpected_content_type");
      return true;
    },
  );
});

test("HTML provider: oversized body -> body_too_large", async () => {
  const huge = "x".repeat(2_000_000);
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    new Response(huge, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  await assert.rejects(
    () => wrapper(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "body_too_large");
      return true;
    },
  );
});

test("HTML provider: network failure -> metadata_unavailable", async () => {
  const fetchImpl: ShopeeProductMetadataFetchLike = async () => {
    throw new Error("ECONNRESET");
  };
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  await assert.rejects(
    () => wrapper(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_unavailable");
      return true;
    },
  );
});

test("HTML provider: AbortError -> provider_timeout", async () => {
  const fetchImpl: ShopeeProductMetadataFetchLike = async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  };
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  await assert.rejects(
    () => wrapper(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_timeout");
      return true;
    },
  );
});

test("HTML provider: redirect to hostile host -> redirect_to_hostile_target", async () => {
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    new Response(null, {
      status: 302,
      headers: { location: "https://evil.example.com/x" },
    });
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("fetchDefaultMetadata must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  await assert.rejects(
    () => wrapper(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "redirect_to_hostile_target");
      return true;
    },
  );
});

test("HTML provider: redirect chain exceeding the limit -> too_many_redirects", async () => {
  let counter = 0;
  const fetchImpl: ShopeeProductMetadataFetchLike = async () => {
    counter += 1;
    return new Response(null, {
      status: 302,
      headers: {
        location: "https://shopee.vn/redirect-" + counter,
      },
    });
  };
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("fetchDefaultMetadata must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  await assert.rejects(
    () => wrapper(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "too_many_redirects");
      return true;
    },
  );
});

test("HTML provider: redirect with missing Location -> redirect_failed", async () => {
  const fetchImpl: ShopeeProductMetadataFetchLike = async () =>
    new Response(null, {
      status: 302,
      headers: {},
    });
  const wrapper = createFetchShopeeProductMetadataFromUrl({
    resolveProductUrl: async () => IDENTITY,
    fetchDefaultMetadata: async () => {
      throw new Error("fetchDefaultMetadata must not be called");
    },
    fetchHtmlMetadata: async (identity, impl) =>
      await fetchMetadataForIdentityFromHtml(identity, impl),
  });
  await assert.rejects(
    () => wrapper(IDENTITY.canonicalUrl, fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "redirect_failed");
      return true;
    },
  );
});
