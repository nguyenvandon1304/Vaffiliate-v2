import test from "node:test";
import assert from "node:assert/strict";

import {
  createShopeeProductMetadataProviderChain,
} from "./provider-chain";
import { ShopeeProductMetadataError } from "./provider.errors";
import type { ShopeeProductMetadata } from "./types";
import type { ShopeeMetadataProvider } from "./provider-chain";

const IDENTITY = {
  shopId: "12345",
  itemId: "67890",
  canonicalUrl: "https://shopee.vn/product/12345/67890",
};

const HTML_METADATA: ShopeeProductMetadata = {
  shopId: IDENTITY.shopId,
  itemId: IDENTITY.itemId,
  canonicalUrl: IDENTITY.canonicalUrl,
  title: "Fallback Product",
  imageUrl: "https://down-vn.img.susercontent.com/fallback.jpg",
  price: { amount: 99000, currency: "VND" },
  shopName: "Fallback Shop",
  availability: "unknown",
};

/**
 * Builds a mock primary provider that returns validated ShopeeProductMetadata.
 *
 * This mirrors what fetchUnikornProductMetadata (unikorn-client.server.ts) does:
 * it fetches raw data and calls parseUnikornProductDataResponse to return
 * validated metadata.
 */
function buildMockPrimaryProvider(
  responses: ShopeeProductMetadata[],
): ShopeeMetadataProvider {
  let index = 0;
  return async () => {
    const response = responses[index] ?? responses[responses.length - 1];
    index += 1;
    return response;
  };
}

function buildErrorPrimaryProvider(error: Error): ShopeeMetadataProvider {
  return async () => {
    throw error;
  };
}

test("primary success does not call HTML", async () => {
  const primaryProvider = buildMockPrimaryProvider([
    {
      shopId: IDENTITY.shopId,
      itemId: IDENTITY.itemId,
      canonicalUrl: IDENTITY.canonicalUrl,
      title: "Unikorn Product",
      imageUrl: "https://down-vn.img.susercontent.com/image.jpg",
      price: { amount: 199000, currency: "VND" },
      availability: "unknown",
    },
  ]);

  let htmlCalled = false;
  const fallbackProvider = async () => {
    htmlCalled = true;
    return HTML_METADATA;
  };

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  const result = await chain(IDENTITY);

  assert.equal(result.title, "Unikorn Product");
  assert.equal(htmlCalled, false);
});

test("timeout calls HTML fallback", async () => {
  const error = new Error("aborted");
  error.name = "AbortError";
  const primaryProvider = buildErrorPrimaryProvider(error);

  const fallbackProvider = async () => HTML_METADATA;

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  const result = await chain(IDENTITY);

  assert.equal(result.title, "Fallback Product");
});

test("HTTP 429 calls HTML fallback", async () => {
  const primaryProvider = buildErrorPrimaryProvider(
    new ShopeeProductMetadataError("provider_timeout", "Rate limited"),
  );

  const fallbackProvider = async () => HTML_METADATA;

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  const result = await chain(IDENTITY);

  assert.equal(result.title, "Fallback Product");
});

test("HTTP 500 calls HTML fallback", async () => {
  const primaryProvider = buildErrorPrimaryProvider(
    new ShopeeProductMetadataError("non_2xx_response", "HTTP 500"),
  );

  const fallbackProvider = async () => HTML_METADATA;

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  const result = await chain(IDENTITY);

  assert.equal(result.title, "Fallback Product");
});

test("invalid response schema calls HTML fallback", async () => {
  const primaryProvider = buildErrorPrimaryProvider(
    new ShopeeProductMetadataError("provider_response_invalid", "Invalid response"),
  );

  const fallbackProvider = async () => HTML_METADATA;

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  const result = await chain(IDENTITY);

  assert.equal(result.title, "Fallback Product");
});

test("network failure calls HTML fallback", async () => {
  const primaryProvider = buildErrorPrimaryProvider(
    new ShopeeProductMetadataError("metadata_unavailable", "ECONNREFUSED"),
  );

  const fallbackProvider = async () => HTML_METADATA;

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  const result = await chain(IDENTITY);

  assert.equal(result.title, "Fallback Product");
});

test("HTML result returned when fallback succeeds", async () => {
  const error = new Error("timeout");
  error.name = "AbortError";
  const primaryProvider = buildErrorPrimaryProvider(error);

  const fallbackProvider = async () => HTML_METADATA;

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  const result = await chain(IDENTITY);

  assert.equal(result.shopId, IDENTITY.shopId);
  assert.equal(result.itemId, IDENTITY.itemId);
  assert.equal(result.canonicalUrl, IDENTITY.canonicalUrl);
  assert.equal(result.title, "Fallback Product");
  assert.equal(result.imageUrl, "https://down-vn.img.susercontent.com/fallback.jpg");
  assert.deepEqual(result.price, { amount: 99000, currency: "VND" });
  assert.equal(result.shopName, "Fallback Shop");
});

test("both fail returns typed failure", async () => {
  const error = new Error("timeout");
  error.name = "AbortError";
  const primaryProvider = buildErrorPrimaryProvider(error);

  const fallbackProvider = async () => {
    throw new ShopeeProductMetadataError(
      "metadata_unavailable",
      "HTML provider also failed",
    );
  };

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  await assert.rejects(
    () => chain(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_unavailable");
      return true;
    },
  );
});

test("HTML fallback preserves identity fields", async () => {
  const error = new Error("timeout");
  error.name = "AbortError";
  const primaryProvider = buildErrorPrimaryProvider(error);

  let htmlCalledWithIdentity = false;
  const fallbackProvider: ShopeeMetadataProvider = async (identity) => {
    if (
      identity.shopId === IDENTITY.shopId &&
      identity.itemId === IDENTITY.itemId &&
      identity.canonicalUrl === IDENTITY.canonicalUrl
    ) {
      htmlCalledWithIdentity = true;
    }
    return HTML_METADATA;
  };

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  await chain(IDENTITY);

  assert.equal(htmlCalledWithIdentity, true);
});

test("primary success returns correct metadata fields", async () => {
  const primaryProvider = buildMockPrimaryProvider([
    {
      shopId: IDENTITY.shopId,
      itemId: IDENTITY.itemId,
      canonicalUrl: IDENTITY.canonicalUrl,
      title: "API Product",
      imageUrl: "https://down-vn.img.susercontent.com/api-product.jpg",
      price: { amount: 250000, currency: "VND" },
      availability: "unknown",
    },
  ]);

  const fallbackProvider = async () => HTML_METADATA;

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  const result = await chain(IDENTITY);

  assert.equal(result.title, "API Product");
  assert.equal(result.shopId, IDENTITY.shopId);
  assert.equal(result.itemId, IDENTITY.itemId);
  assert.equal(result.canonicalUrl, IDENTITY.canonicalUrl);
  assert.deepEqual(result.price, { amount: 250000, currency: "VND" });
});

// --- Non-fallback behavior tests (rethrows non-eligible errors) ---

test("product_not_found from primary is rethrown without calling HTML", async () => {
  const primaryProvider = buildErrorPrimaryProvider(
    new ShopeeProductMetadataError("product_not_found", "Shopee product not found: HTTP 404"),
  );

  let htmlCalled = false;
  const fallbackProvider: ShopeeMetadataProvider = async () => {
    htmlCalled = true;
    return HTML_METADATA;
  };

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  await assert.rejects(
    () => chain(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_not_found");
      return true;
    },
  );
  assert.equal(htmlCalled, false);
});

test("product_unavailable from primary is rethrown without calling HTML", async () => {
  const primaryProvider = buildErrorPrimaryProvider(
    new ShopeeProductMetadataError("product_unavailable", "Shopee product is no longer available"),
  );

  let htmlCalled = false;
  const fallbackProvider: ShopeeMetadataProvider = async () => {
    htmlCalled = true;
    return HTML_METADATA;
  };

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  await assert.rejects(
    () => chain(IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_unavailable");
      return true;
    },
  );
  assert.equal(htmlCalled, false);
});

test("ordinary Error from primary is rethrown without calling HTML", async () => {
  const ordinary = new Error("something went wrong");
  const primaryProvider = buildErrorPrimaryProvider(ordinary);

  let htmlCalled = false;
  const fallbackProvider: ShopeeMetadataProvider = async () => {
    htmlCalled = true;
    return HTML_METADATA;
  };

  const chain = createShopeeProductMetadataProviderChain({
    primaryProvider,
    fallbackProvider,
  });

  await assert.rejects(
    () => chain(IDENTITY),
    (err: unknown) => {
      // The chain rethrows the original error unchanged
      assert.equal(err, ordinary);
      return true;
    },
  );
  assert.equal(htmlCalled, false);
});
