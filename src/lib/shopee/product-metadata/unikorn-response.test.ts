import test from "node:test";
import assert from "node:assert/strict";

import { parseUnikornProductDataResponse } from "./unikorn-response";
import { ShopeeProductMetadataError } from "./provider.errors";

const IDENTITY = {
  shopId: "12345",
  itemId: "67890",
  canonicalUrl: "https://shopee.vn/product/12345/67890",
};

// Default valid response — matches verified live shape: no shopId, dataSource "db", cf.shopee.vn image
function validApiResponse(overrides = {}) {
  return {
    status: "success",
    productInfo: {
      itemId: IDENTITY.itemId,
      productName: "Test Product Name",
      price: 199000,
      imageUrl: "https://cf.shopee.vn/file/test-image-1.jpg",
      productLink: "https://shopee.vn/product/12345/67890",
      dataSource: "db",
      ...overrides,
    },
  };
}

// Explicit API-source fixture for dataSource "api" tests
function validApiSourceResponse(overrides = {}) {
  return validApiResponse({ dataSource: "api", ...overrides });
}

test("valid api response maps title/image/price/shop correctly", () => {
  const response = validApiSourceResponse({ imageUrl: "https://cf.shopee.vn/file/test-image-1.jpg" });
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.title, "Test Product Name");
  assert.equal(metadata.imageUrl, "https://cf.shopee.vn/file/test-image-1.jpg");
  assert.deepEqual(metadata.price, { amount: 199000, currency: "VND" });
  assert.equal(metadata.shopName, undefined);
  assert.equal(metadata.availability, "unknown");
  assert.equal(metadata.canonicalUrl, IDENTITY.canonicalUrl);
  assert.equal(metadata.shopId, IDENTITY.shopId);
  assert.equal(metadata.itemId, IDENTITY.itemId);
});

test("valid db response maps correctly", () => {
  // Default fixture is already dataSource: "db" — matches verified live shape
  const response = validApiResponse();
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.title, "Test Product Name");
});

test("numeric itemId accepted", () => {
  const response = validApiResponse({ itemId: 67890 });
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.itemId, "67890");
});

test("digit-string itemId accepted", () => {
  const response = validApiResponse({ itemId: "67890" });
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.itemId, "67890");
});

test("shopName null is accepted and omitted from result", () => {
  const response = validApiResponse({ shopName: null });
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.shopName, undefined);
});

test("shopName string is preserved", () => {
  const response = validApiResponse({ shopName: "My Shop" });
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.shopName, "My Shop");
});

test("rating number in range 0-5 is accepted", () => {
  const response = validApiResponse({ rating: 4.5 });
  parseUnikornProductDataResponse(response, IDENTITY);
});

test("rating string in range 0-5 is accepted", () => {
  const response = validApiResponse({ rating: "4.5" });
  parseUnikornProductDataResponse(response, IDENTITY);
});

test("rating 0 is accepted", () => {
  const response = validApiResponse({ rating: 0 });
  parseUnikornProductDataResponse(response, IDENTITY);
});

test("rating 5 is accepted", () => {
  const response = validApiResponse({ rating: 5 });
  parseUnikornProductDataResponse(response, IDENTITY);
});

test("sales omitted is accepted", () => {
  const response = validApiResponse();
  parseUnikornProductDataResponse(response, IDENTITY);
});

test("sales non-negative integer is accepted", () => {
  const response = validApiResponse({ sales: 1234 });
  parseUnikornProductDataResponse(response, IDENTITY);
});

test("canonicalUrl always comes from resolved identity", () => {
  const response = validApiResponse();
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  // canonicalUrl must come from resolved identity, not from the third-party response
  assert.equal(metadata.canonicalUrl, IDENTITY.canonicalUrl);
  assert.equal(metadata.shopId, IDENTITY.shopId);
  assert.equal(metadata.itemId, IDENTITY.itemId);
});

test("availability is always unknown", () => {
  const response = validApiResponse();
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.availability, "unknown");
});

test("provider commission fields are ignored", () => {
  const response = validApiResponse({
    commission: 0.05,
    sellerComFinal: 0.03,
    shopeeComFinal: 0.02,
    cap: 10000,
    capRaw: 10000,
    capAfterRate: 9500,
  });
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.ok(!("commission" in metadata));
  assert.ok(!("sellerComFinal" in metadata));
});

test("mismatched itemId rejected", () => {
  const response = validApiResponse({ itemId: "99999" });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("mismatched shopId rejected", () => {
  const response = validApiResponse({ shopId: "99999" });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("malformed productLink rejected", () => {
  const response = validApiResponse({ productLink: "not-a-url" });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("productLink with mismatched shopId rejected", () => {
  const response = validApiResponse({
    productLink: "https://shopee.vn/product/99999/67890",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("productLink with mismatched itemId rejected", () => {
  const response = validApiResponse({
    productLink: "https://shopee.vn/product/12345/99999",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

// --- Optional shopId tests (live shape: shopId absent from productInfo) ---

test("response without shopId is accepted when productLink matches identity", () => {
  // Default fixture has no shopId — this is the verified live shape
  const response = validApiResponse();
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.shopId, IDENTITY.shopId);
  assert.equal(metadata.itemId, IDENTITY.itemId);
});

test("response without shopId maps returned metadata.shopId from identity", () => {
  const response = validApiResponse();
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.shopId, IDENTITY.shopId);
});

test("optional numeric shopId matching identity is accepted", () => {
  const response = validApiResponse({ shopId: 12345 });
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.shopId, "12345");
});

test("optional digit-string shopId matching identity is accepted", () => {
  const response = validApiResponse({ shopId: "12345" });
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.shopId, "12345");
});

test("optional shopId mismatch is rejected", () => {
  const response = validApiResponse({ shopId: "99999" });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("optional malformed shopId is rejected", () => {
  const response = validApiResponse({ shopId: "abc" });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("missing shopId plus mismatched productLink shopId is rejected", () => {
  // shopId is absent; productLink contains wrong shopId → productLink guard fires
  const response = validApiResponse({
    productLink: "https://shopee.vn/product/99999/67890",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("cf.shopee.vn HTTPS image is accepted through the shared allowlist", () => {
  const response = validApiResponse({ imageUrl: "https://cf.shopee.vn/file/test-image-cf.jpg" });
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.imageUrl, "https://cf.shopee.vn/file/test-image-cf.jpg");
});

test("empty title rejected", () => {
  const response = validApiResponse({ productName: "   " });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("null title rejected", () => {
  const response = validApiResponse({ productName: null });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("missing title rejected", () => {
  const { productName, ...rest } = validApiResponse().productInfo;
  void productName;
  const response = { ...validApiResponse(), productInfo: rest };
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("price 0 rejected", () => {
  const response = validApiResponse({ price: 0 });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("negative price rejected", () => {
  const response = validApiResponse({ price: -100 });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("fractional price rejected", () => {
  const response = validApiResponse({ price: 199.5 });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("string fractional price rejected", () => {
  const response = validApiResponse({ price: "199.5" });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("missing price rejected", () => {
  const { price, ...rest } = validApiResponse().productInfo;
  void price;
  const response = { ...validApiResponse(), productInfo: rest };
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("HTTP image URL rejected", () => {
  const response = validApiResponse({
    imageUrl: "http://cf.shopee.vn/file/test-image.jpg",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("image URL with credentials rejected", () => {
  const response = validApiResponse({
    imageUrl: "https://user:pass@cf.shopee.vn/file/test-image.jpg",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("unsupported image hostname rejected", () => {
  const response = validApiResponse({
    imageUrl: "https://evil.example.com/image.jpg",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("missing imageUrl rejected", () => {
  const { imageUrl, ...rest } = validApiResponse().productInfo;
  void imageUrl;
  const response = { ...validApiResponse(), productInfo: rest };
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("fallback dataSource rejected", () => {
  const response = validApiResponse({ dataSource: "fallback" });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("missing dataSource rejected", () => {
  const { dataSource, ...rest } = validApiResponse().productInfo;
  void dataSource;
  const response = { ...validApiResponse(), productInfo: rest };
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("status not success rejected", () => {
  const response = { status: "error", productInfo: validApiResponse().productInfo };
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("missing status rejected", () => {
  const response = { productInfo: validApiResponse().productInfo };
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("null productInfo rejected", () => {
  const response = { status: "success", productInfo: null };
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("array response rejected", () => {
  const response: unknown = [{ status: "success" }];
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("null response rejected", () => {
  assert.throws(
    () => parseUnikornProductDataResponse(null, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("rating below 0 rejected", () => {
  const response = validApiResponse({ rating: -0.1 });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("rating above 5 rejected", () => {
  const response = validApiResponse({ rating: 5.1 });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("rating NaN rejected", () => {
  const response = validApiResponse({ rating: NaN });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("negative sales rejected", () => {
  const response = validApiResponse({ sales: -1 });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("fractional sales rejected", () => {
  const response = validApiResponse({ sales: 1.5 });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("unsafe integer price rejected", () => {
  // Number.MAX_SAFE_INTEGER + 1 is not a safe integer
  const unsafePrice = Number.MAX_SAFE_INTEGER + 1;
  const response = validApiResponse({ price: unsafePrice });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("malformed numeric string price rejected", () => {
  const response = validApiResponse({ price: "abc" });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("unsupported arbitrary dataSource rejected", () => {
  const response = validApiResponse({ dataSource: "unknown" });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

// --- Safe numeric ID normalization tests ---

test("unsafe numeric itemId rejected", () => {
  // Number.MAX_SAFE_INTEGER + 1 is not a safe integer
  const unsafeItemId = Number.MAX_SAFE_INTEGER + 1;
  const response = validApiResponse({ itemId: unsafeItemId });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("fractional numeric itemId rejected", () => {
  const response = validApiResponse({ itemId: 67890.5 });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("unsafe optional numeric shopId rejected", () => {
  const unsafeShopId = Number.MAX_SAFE_INTEGER + 1;
  const response = validApiResponse({ shopId: unsafeShopId });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("fractional optional numeric shopId rejected", () => {
  const response = validApiResponse({ shopId: 12345.7 });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

// --- ProductLink security tests (delegated to canonical parser) ---

test("productLink on hostile host is rejected", () => {
  const response = validApiResponse({
    productLink: "https://attacker.example/product/12345/67890",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("productLink with HTTP scheme is rejected", () => {
  const response = validApiResponse({
    productLink: "http://shopee.vn/product/12345/67890",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("productLink with credentials is rejected", () => {
  const response = validApiResponse({
    productLink: "https://user:pass@shopee.vn/product/12345/67890",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("productLink with unexpected port is rejected", () => {
  const response = validApiResponse({
    productLink: "https://shopee.vn:444/product/12345/67890",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("productLink on shopee.com host is rejected", () => {
  const response = validApiResponse({
    productLink: "https://shopee.com/product/12345/67890",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("productLink on s.shopee.vn short link is rejected", () => {
  const response = validApiResponse({
    productLink: "https://s.shopee.vn/product/12345/67890",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("productLink on shope.ee is rejected", () => {
  const response = validApiResponse({
    productLink: "https://shope.ee/product/12345/67890",
  });
  assert.throws(
    () => parseUnikornProductDataResponse(response, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("canonical productLink still accepted", () => {
  const response = validApiResponse({
    productLink: "https://shopee.vn/product/12345/67890",
  });
  const metadata = parseUnikornProductDataResponse(response, IDENTITY);
  assert.equal(metadata.canonicalUrl, IDENTITY.canonicalUrl);
  assert.equal(metadata.shopId, IDENTITY.shopId);
  assert.equal(metadata.itemId, IDENTITY.itemId);
});
