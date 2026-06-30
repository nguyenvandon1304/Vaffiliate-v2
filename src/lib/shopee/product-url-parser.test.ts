/**
 * Unit tests for the Phase 20H.1 Shopee product URL parser.
 *
 * Pure: no fetch, no network, no `server-only`. Uses Node's built-in
 * `node:test` runner so the suite stays inside the existing
 * `tsx --test` based `npm test` pipeline.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isContinueableRedirectTargetError,
  parseShopeeProductUrl,
  runShopeeProductUrlRedirectLoop,
  ShopeeProductUrlParseError,
  ShopeeProductUrlRedirectError,
} from "./product-url-parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectParseError(
  fn: () => unknown,
  code: ShopeeProductUrlParseError["code"],
): ShopeeProductUrlParseError {
  try {
    fn();
  } catch (error) {
    assert.ok(
      error instanceof ShopeeProductUrlParseError,
      `expected ShopeeProductUrlParseError, got ${String(error)}`,
    );
    assert.equal(
      (error as ShopeeProductUrlParseError).code,
      code,
    );
    return error as ShopeeProductUrlParseError;
  }
  assert.fail(
    `expected throw with code ${code}, but no throw occurred`,
  );
}

// ---------------------------------------------------------------------------
// Error class shape
// ---------------------------------------------------------------------------

test("error class preserves name, code, and default message", () => {
  const err = new ShopeeProductUrlParseError("invalid_input");
  assert.equal(err.name, "ShopeeProductUrlParseError");
  assert.equal(err.code, "invalid_input");
  assert.match(err.message, /string/);
});

test("error class accepts a custom message override", () => {
  const err = new ShopeeProductUrlParseError(
    "invalid_input",
    "custom override",
  );
  assert.equal(err.message, "custom override");
});

// ---------------------------------------------------------------------------
// Valid: canonical /product/<shopId>/<itemId>
// ---------------------------------------------------------------------------

test("valid /product/<shopId>/<itemId> resolves to canonical URL", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/product/12345/67890",
  );
  assert.equal(
    result.originalUrl,
    "https://shopee.vn/product/12345/67890",
  );
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/12345/67890",
  );
  assert.equal(result.hostname, "shopee.vn");
  assert.equal(result.shopId, "12345");
  assert.equal(result.itemId, "67890");
});

test("valid /product/<shopId>/<itemId> on www host", () => {
  const result = parseShopeeProductUrl(
    "https://www.shopee.vn/product/1/2",
  );
  assert.equal(result.hostname, "www.shopee.vn");
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/1/2",
  );
  assert.equal(result.shopId, "1");
  assert.equal(result.itemId, "2");
});

// ---------------------------------------------------------------------------
// Valid: /<slug>-i.<shopId>.<itemId>
// ---------------------------------------------------------------------------

test("valid slug -i.<shopId>.<itemId> strips slug", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/Some-Product-Name-i.12345.67890",
  );
  assert.equal(result.shopId, "12345");
  assert.equal(result.itemId, "67890");
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/12345/67890",
  );
});

test("valid slug with hyphens and digits", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/abc-123-xyz-i.7.9",
  );
  assert.equal(result.shopId, "7");
  assert.equal(result.itemId, "9");
});

// ---------------------------------------------------------------------------
// Valid: /<shopName>/<shopId>/<itemId>
// ---------------------------------------------------------------------------

test("valid /<shopName>/<shopId>/<itemId> resolves to canonical URL", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/some-shop/12345/67890",
  );
  assert.equal(result.shopId, "12345");
  assert.equal(result.itemId, "67890");
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/12345/67890",
  );
  assert.equal(result.originalUrl,
    "https://shopee.vn/some-shop/12345/67890",
  );
});

test("shopName shape with trailing slash is normalized away", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/some-shop/12345/67890/",
  );
  assert.equal(result.shopId, "12345");
  assert.equal(result.itemId, "67890");
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/12345/67890",
  );
});

test("shopName shape query and fragment are stripped from canonical URL", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/some-shop/12345/67890?utm_source=abc#section",
  );
  assert.equal(result.shopId, "12345");
  assert.equal(result.itemId, "67890");
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/12345/67890",
  );
  assert.ok(!result.canonicalUrl.includes("?"));
  assert.ok(!result.canonicalUrl.includes("#"));
  assert.ok(!result.canonicalUrl.includes("some-shop"));
});

test("shopName shape on www host still canonicalizes to shopee.vn", () => {
  const result = parseShopeeProductUrl(
    "https://www.shopee.vn/another-shop/1/2",
  );
  assert.equal(result.hostname, "www.shopee.vn");
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/1/2",
  );
  assert.equal(result.shopId, "1");
  assert.equal(result.itemId, "2");
});

test("shopName shape preserves large identifiers verbatim as strings", () => {
  const largeShopId = "9007199254740991";
  const largeItemId = "1234567890123456789";
  const result = parseShopeeProductUrl(
    `https://shopee.vn/big-shop/${largeShopId}/${largeItemId}`,
  );
  assert.equal(result.shopId, largeShopId);
  assert.equal(result.itemId, largeItemId);
  assert.equal(typeof result.shopId, "string");
  assert.equal(typeof result.itemId, "string");
  assert.equal(
    result.canonicalUrl,
    `https://shopee.vn/product/${largeShopId}/${largeItemId}`,
  );
});

test("shopName shape allows numeric shopName segment", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/123-shop/7/9",
  );
  assert.equal(result.shopId, "7");
  assert.equal(result.itemId, "9");
});

test("product shape still takes precedence over shopName shape", () => {
  // `/product/123/456` matches both patterns, but the canonical product
  // shape must win so product-prefixed incomplete paths continue to be
  // classified as missing_identifier.
  const result = parseShopeeProductUrl(
    "https://shopee.vn/product/123/456",
  );
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/123/456",
  );
  assert.equal(result.shopId, "123");
  assert.equal(result.itemId, "456");
});

// ---------------------------------------------------------------------------
// Valid: query, fragment, trailing slash normalization
// ---------------------------------------------------------------------------

test("query and fragment are stripped from canonical URL", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/product/12345/67890?utm_source=abc#section",
  );
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/12345/67890",
  );
  assert.equal(result.shopId, "12345");
  assert.equal(result.itemId, "67890");
});

test("trailing slash on /product is normalized away", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/product/12345/67890/",
  );
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/12345/67890",
  );
});

test("trailing slash on slug path is normalized away", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/Some-Product-Name-i.12345.67890/",
  );
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/12345/67890",
  );
});

// ---------------------------------------------------------------------------
// Valid: hostname normalization
// ---------------------------------------------------------------------------

test("uppercase hostname normalized to lowercase", () => {
  const result = parseShopeeProductUrl(
    "https://SHOPEE.VN/product/1/2",
  );
  assert.equal(result.hostname, "shopee.vn");
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/1/2",
  );
});

test("mixed-case www host normalized to lowercase", () => {
  const result = parseShopeeProductUrl(
    "https://WWW.Shopee.VN/product/10/20",
  );
  assert.equal(result.hostname, "www.shopee.vn");
});

// ---------------------------------------------------------------------------
// Valid: large identifiers preserved
// ---------------------------------------------------------------------------

test("large identifiers preserved verbatim", () => {
  const largeShopId = "9007199254740991";
  const largeItemId = "1234567890123456789";
  const result = parseShopeeProductUrl(
    `https://shopee.vn/product/${largeShopId}/${largeItemId}`,
  );
  assert.equal(result.shopId, largeShopId);
  assert.equal(result.itemId, largeItemId);
  assert.equal(typeof result.shopId, "string");
  assert.equal(typeof result.itemId, "string");
});

test("canonical output is exactly /product/<shopId>/<itemId>", () => {
  const result = parseShopeeProductUrl(
    "https://shopee.vn/Some-Product-Name-i.42.84?foo=bar#x",
  );
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/42/84",
  );
});

// ---------------------------------------------------------------------------
// Valid: zero identifiers are accepted (contract says "non-empty")
// ---------------------------------------------------------------------------

test("zero identifiers are accepted (non-empty ASCII digit strings)", () => {
  const r1 = parseShopeeProductUrl(
    "https://shopee.vn/product/0/123",
  );
  assert.equal(r1.shopId, "0");
  assert.equal(r1.itemId, "123");

  const r2 = parseShopeeProductUrl(
    "https://shopee.vn/product/123/0",
  );
  assert.equal(r2.shopId, "123");
  assert.equal(r2.itemId, "0");

  const r3 = parseShopeeProductUrl(
    "https://shopee.vn/product/0/0",
  );
  assert.equal(r3.shopId, "0");
  assert.equal(r3.itemId, "0");
});

// ---------------------------------------------------------------------------
// Invalid: non-string inputs
// ---------------------------------------------------------------------------

test("null input -> invalid_input", () => {
  expectParseError(
    () => parseShopeeProductUrl(null),
    "invalid_input",
  );
});

test("undefined input -> invalid_input", () => {
  expectParseError(
    () => parseShopeeProductUrl(undefined),
    "invalid_input",
  );
});

test("number input -> invalid_input", () => {
  expectParseError(
    () => parseShopeeProductUrl(123 as unknown),
    "invalid_input",
  );
});

test("object input -> invalid_input", () => {
  expectParseError(
    () => parseShopeeProductUrl({} as unknown),
    "invalid_input",
  );
});

test("array input -> invalid_input", () => {
  expectParseError(
    () => parseShopeeProductUrl([] as unknown),
    "invalid_input",
  );
});

test("boolean input -> invalid_input", () => {
  expectParseError(
    () => parseShopeeProductUrl(true as unknown),
    "invalid_input",
  );
});

test("bigint input -> invalid_input", () => {
  expectParseError(
    () => parseShopeeProductUrl(BigInt(1) as unknown),
    "invalid_input",
  );
});

// ---------------------------------------------------------------------------
// Invalid: empty/whitespace/malformed
// ---------------------------------------------------------------------------

test("empty string -> invalid_url", () => {
  expectParseError(
    () => parseShopeeProductUrl(""),
    "invalid_url",
  );
});

test("whitespace-only string -> invalid_url", () => {
  expectParseError(
    () => parseShopeeProductUrl("   "),
    "invalid_url",
  );
});

test("tab-only string -> invalid_url", () => {
  expectParseError(
    () => parseShopeeProductUrl("\t\t"),
    "invalid_url",
  );
});

test("malformed URL -> invalid_url", () => {
  expectParseError(
    () => parseShopeeProductUrl("not a url"),
    "invalid_url",
  );
});

test("embedded whitespace -> invalid_url", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/1 2/3",
      ),
    "invalid_url",
  );
});

// ---------------------------------------------------------------------------
// Valid: leading/trailing whitespace is trimmed (baseline behaviour)
// ---------------------------------------------------------------------------

test("leading/trailing spaces are trimmed and URL parses successfully", () => {
  const result = parseShopeeProductUrl(
    "  https://shopee.vn/product/1/2  ",
  );
  assert.equal(result.shopId, "1");
  assert.equal(result.itemId, "2");
  assert.equal(
    result.originalUrl,
    "https://shopee.vn/product/1/2",
  );
  assert.equal(
    result.canonicalUrl,
    "https://shopee.vn/product/1/2",
  );
});

test("leading/ending tab is trimmed", () => {
  const result = parseShopeeProductUrl(
    "\thttps://shopee.vn/product/10/20\t",
  );
  assert.equal(result.shopId, "10");
  assert.equal(result.itemId, "20");
  assert.equal(
    result.originalUrl,
    "https://shopee.vn/product/10/20",
  );
});

test("leading/ending newline is trimmed", () => {
  const result = parseShopeeProductUrl(
    "\nhttps://shopee.vn/product/100/200\n",
  );
  assert.equal(result.shopId, "100");
  assert.equal(result.itemId, "200");
  assert.equal(
    result.originalUrl,
    "https://shopee.vn/product/100/200",
  );
});

test("embedded whitespace in URL still returns invalid_url", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/1 2/3",
      ),
    "invalid_url",
  );
});

// ---------------------------------------------------------------------------
// Invalid: oversized input
// ---------------------------------------------------------------------------

test("oversized URL -> oversized_url", () => {
  // 4200 digits in the shopId segment pushes the URL well past the 4096
  // byte ceiling. `https://shopee.vn/product/` is 27 chars; `4200 + /2` is
  // 4203 chars; total = 4230 chars.
  const long = `https://shopee.vn/product/${"1".repeat(4200)}/2`;
  expectParseError(
    () => parseShopeeProductUrl(long),
    "oversized_url",
  );
});

test("URL exactly at MAX_INPUT_LENGTH (4096) is NOT oversized", () => {
  // 4068 digits in shopId keeps the URL at exactly 4096 chars:
  // `https://shopee.vn/product/` (26) + 4068 + `/2` (2) = 4096. We
  // deliberately use a single numeric itemId so the URL is parsed as a
  // valid product shape once the length check passes.
  const exact = `https://shopee.vn/product/${"1".repeat(4068)}/2`;
  assert.equal(exact.length, 4096);
  const result = parseShopeeProductUrl(exact);
  assert.equal(result.shopId, "1".repeat(4068));
  assert.equal(result.itemId, "2");
});

test("URL one byte above MAX_INPUT_LENGTH is oversized", () => {
  // 4069 digits in shopId makes the URL 4097 chars long:
  // `https://shopee.vn/product/` (26) + 4069 + `/2` (2) = 4097.
  const justOver = `https://shopee.vn/product/${"1".repeat(4069)}/2`;
  assert.equal(justOver.length, 4097);
  expectParseError(
    () => parseShopeeProductUrl(justOver),
    "oversized_url",
  );
});

test("URL just under MAX_INPUT_LENGTH is accepted", () => {
  // 4067 digits in shopId makes the URL 4095 chars long:
  // `https://shopee.vn/product/` (26) + 4067 + `/2` (2) = 4095.
  const justUnder = `https://shopee.vn/product/${"1".repeat(4067)}/2`;
  assert.equal(justUnder.length, 4095);
  const result = parseShopeeProductUrl(justUnder);
  assert.equal(result.shopId, "1".repeat(4067));
  assert.equal(result.itemId, "2");
});

// ---------------------------------------------------------------------------
// Invalid: scheme
// ---------------------------------------------------------------------------

test("http -> unsupported_scheme", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "http://shopee.vn/product/1/2",
      ),
    "unsupported_scheme",
  );
});

test("ftp -> unsupported_scheme", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "ftp://shopee.vn/product/1/2",
      ),
    "unsupported_scheme",
  );
});

test("file -> unsupported_scheme", () => {
  expectParseError(
    () => parseShopeeProductUrl("file:///product/1/2"),
    "unsupported_scheme",
  );
});

test("javascript -> unsupported_scheme", () => {
  expectParseError(
    () => parseShopeeProductUrl("javascript:alert(1)"),
    "unsupported_scheme",
  );
});

// ---------------------------------------------------------------------------
// Invalid: credentials
// ---------------------------------------------------------------------------

test("username -> credentials_not_allowed", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://user@shopee.vn/product/1/2",
      ),
    "credentials_not_allowed",
  );
});

test("password -> credentials_not_allowed", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://user:pass@shopee.vn/product/1/2",
      ),
    "credentials_not_allowed",
  );
});

// ---------------------------------------------------------------------------
// Invalid: unexpected port
// ---------------------------------------------------------------------------

test("non-default port -> unexpected_port", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn:8443/product/1/2",
      ),
    "unexpected_port",
  );
});

test("port 80 on https -> unexpected_port", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn:80/product/1/2",
      ),
    "unexpected_port",
  );
});

// ---------------------------------------------------------------------------
// Invalid: hostile hostname variants
// ---------------------------------------------------------------------------

test("shopee.vn.evil.com -> unsupported_host", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn.evil.com/product/1/2",
      ),
    "unsupported_host",
  );
});

test("evilshopee.vn -> unsupported_host", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://evilshopee.vn/product/1/2",
      ),
    "unsupported_host",
  );
});

test("notshopee.vn -> unsupported_host", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://notshopee.vn/product/1/2",
      ),
    "unsupported_host",
  );
});

test("trailing dot on hostile hostname -> unsupported_host", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn.evil.com./product/1/2",
      ),
    "unsupported_host",
  );
});

test("example.com -> unsupported_host", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://example.com/product/1/2",
      ),
    "unsupported_host",
  );
});

test("shope.ee -> unsupported_host (out of scope)", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shope.ee/product/1/2",
      ),
    "unsupported_host",
  );
});

// ---------------------------------------------------------------------------
// Invalid: non-product paths -> not_product_path
// ---------------------------------------------------------------------------

test("homepage with slash -> not_product_path", () => {
  expectParseError(
    () => parseShopeeProductUrl("https://shopee.vn/"),
    "not_product_path",
  );
});

test("homepage without slash -> not_product_path", () => {
  expectParseError(
    () => parseShopeeProductUrl("https://shopee.vn"),
    "not_product_path",
  );
});

test("/search -> not_product_path", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/search?q=phone",
      ),
    "not_product_path",
  );
});

test("/category/phone -> not_product_path", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/category/phone",
      ),
    "not_product_path",
  );
});

test("/cart -> not_product_path", () => {
  expectParseError(
    () => parseShopeeProductUrl("https://shopee.vn/cart"),
    "not_product_path",
  );
});

test("arbitrary non-product path -> not_product_path", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/arbitrary-path",
      ),
    "not_product_path",
  );
});

test("deep non-product path -> not_product_path", () => {
  // Four-segment path deliberately avoids the 3-segment shopName shape,
  // so this still surfaces as `not_product_path`.
  expectParseError(
    () =>
      parseShopeeProductUrl("https://shopee.vn/foo/bar/baz/qux"),
    "not_product_path",
  );
});

test("3-segment path with non-digit IDs is classified as invalid_identifier", () => {
  // The 3-segment shopName shape treats any non-empty trailing segment
  // as a potential identifier, then validates digit-ness. Generic
  // 3-segment paths that lack digit IDs therefore surface as
  // `invalid_identifier` rather than `not_product_path`.
  expectParseError(
    () =>
      parseShopeeProductUrl("https://shopee.vn/foo/bar/baz"),
    "invalid_identifier",
  );
});

// ---------------------------------------------------------------------------
// Invalid: product-shaped path with missing identifiers -> missing_identifier
// ---------------------------------------------------------------------------

test("/product with no ids -> missing_identifier", () => {
  expectParseError(
    () => parseShopeeProductUrl("https://shopee.vn/product"),
    "missing_identifier",
  );
});

test("/product/123 with missing itemId -> missing_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/123",
      ),
    "missing_identifier",
  );
});

test("/product//123 with empty shopId -> missing_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product//123",
      ),
    "missing_identifier",
  );
});

test("/product/123/ with empty itemId -> missing_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/123/",
      ),
    "missing_identifier",
  );
});

test("slug path with no identifiers -> missing_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/Some-Product-Name-i.",
      ),
    "missing_identifier",
  );
});

test("slug with shopId only -> missing_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/Name-i.123.",
      ),
    "missing_identifier",
  );
});

test("slug with itemId only -> missing_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/Name-i..67890",
      ),
    "missing_identifier",
  );
});

// ---------------------------------------------------------------------------
// Invalid: shopName shape with missing identifiers -> missing_identifier
// ---------------------------------------------------------------------------

test("shopName shape with shopId only -> missing_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/some-shop/12345",
      ),
    "missing_identifier",
  );
});

test("shopName shape with shopId only and trailing slash -> missing_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/some-shop/12345/",
      ),
    "missing_identifier",
  );
});

test("shopName shape with non-digit shopId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/some-shop/abc/456",
      ),
    "invalid_identifier",
  );
});

test("shopName shape with non-digit itemId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/some-shop/123/xyz",
      ),
    "invalid_identifier",
  );
});

test("shopName shape with leading-zero shopId is preserved (non-empty digits)", () => {
  // "0" passes `isNonEmptyDigitString`; treat it as a valid identifier
  // rather than failing it as a missing/invalid one. This mirrors the
  // behavior for the canonical product shape.
  const result = parseShopeeProductUrl(
    "https://shopee.vn/some-shop/0123/0456",
  );
  assert.equal(result.shopId, "0123");
  assert.equal(result.itemId, "0456");
});

// ---------------------------------------------------------------------------
// Invalid: malformed identifiers -> invalid_identifier
// ---------------------------------------------------------------------------

test("non-digit shopId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/abc/2",
      ),
    "invalid_identifier",
  );
});

test("non-digit itemId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/1/xyz",
      ),
    "invalid_identifier",
  );
});

test("negative shopId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/-1/2",
      ),
    "invalid_identifier",
  );
});

test("decimal shopId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/1.5/2",
      ),
    "invalid_identifier",
  );
});

test("scientific shopId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/1e3/2",
      ),
    "invalid_identifier",
  );
});

test("plus prefix -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/+1/2",
      ),
    "invalid_identifier",
  );
});

test("hex style -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/product/0x1/2",
      ),
    "invalid_identifier",
  );
});

test("slug non-digit shopId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/Some-Name-i.abc.2",
      ),
    "invalid_identifier",
  );
});

test("slug non-digit itemId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/Some-Name-i.1.xyz",
      ),
    "invalid_identifier",
  );
});

test("slug decimal shopId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/Some-Name-i.1.5.2",
      ),
    "invalid_identifier",
  );
});

test("slug negative itemId -> invalid_identifier", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://shopee.vn/Some-Name-i.1.-2",
      ),
    "invalid_identifier",
  );
});

// ---------------------------------------------------------------------------
// Invalid: short link -> unsupported_short_link
// ---------------------------------------------------------------------------

test("short link on s.shopee.vn -> unsupported_short_link", () => {
  expectParseError(
    () => parseShopeeProductUrl("https://s.shopee.vn/abc"),
    "unsupported_short_link",
  );
});

test("short link with product shape still rejected as short link", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://s.shopee.vn/product/1/2",
      ),
    "unsupported_short_link",
  );
});

test("short link with uppercase host still rejected", () => {
  expectParseError(
    () =>
      parseShopeeProductUrl(
        "https://S.SHOPEE.VN/product/1/2",
      ),
    "unsupported_short_link",
  );
});

// ---------------------------------------------------------------------------
// Cross-cutting invariants
// ---------------------------------------------------------------------------

test("parser never performs I/O (no global fetch is called)", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    throw new Error("fetch must not be called by pure parser");
  }) as typeof fetch;
  try {
    const result = parseShopeeProductUrl(
      "https://shopee.vn/product/1/2",
    );
    assert.equal(result.shopId, "1");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("canonical URL never contains query/fragment/slug/trailing slash", () => {
  const cases = [
    ["https://shopee.vn/Some-Product-Name-i.1.2?x=1#y", "1", "2"],
    ["https://shopee.vn/product/10/20/?z=9", "10", "20"],
    ["https://shopee.vn/abc-i.100.200", "100", "200"],
    ["https://www.shopee.vn/SLUG-i.7.8/", "7", "8"],
  ] as const;
  for (const [input] of cases) {
    const result = parseShopeeProductUrl(input);
    assert.equal(
      result.canonicalUrl,
      `https://shopee.vn/product/${result.shopId}/${result.itemId}`,
    );
    assert.ok(!result.canonicalUrl.includes("?"));
    assert.ok(!result.canonicalUrl.includes("#"));
    assert.ok(!result.canonicalUrl.endsWith("/"));
    assert.ok(!/-i\./.test(result.canonicalUrl));
  }
});

test("every typed error carries ShopeeProductUrlParseError name", () => {
  const codes: ShopeeProductUrlParseError["code"][] = [
    "invalid_input",
    "invalid_url",
    "unsupported_scheme",
    "unsupported_host",
    "credentials_not_allowed",
    "unexpected_port",
    "oversized_url",
    "not_product_path",
    "missing_identifier",
    "invalid_identifier",
    "unsupported_short_link",
  ];
  for (const code of codes) {
    const err = new ShopeeProductUrlParseError(code);
    assert.equal(err.name, "ShopeeProductUrlParseError");
    assert.equal(err.code, code);
    assert.ok(err.message.length > 0);
  }
});

test("invalid_identifier message mentions ASCII digit strings", () => {
  const err = new ShopeeProductUrlParseError(
    "invalid_identifier",
  );
  assert.match(err.message, /ASCII digit string/i);
});

// ---------------------------------------------------------------------------
// Continueable redirect-target predicate
// ---------------------------------------------------------------------------

test("isContinueableRedirectTargetError flags only the four envelope codes", () => {
  const continueable = [
    "unsupported_short_link",
    "not_product_path",
    "missing_identifier",
    "invalid_identifier",
  ] as const;

  for (const code of continueable) {
    assert.equal(
      isContinueableRedirectTargetError(code),
      true,
      `expected ${code} to be continueable`,
    );
  }

  const terminal = [
    "invalid_input",
    "invalid_url",
    "unsupported_scheme",
    "unsupported_host",
    "credentials_not_allowed",
    "unexpected_port",
    "oversized_url",
  ] as const;

  for (const code of terminal) {
    assert.equal(
      isContinueableRedirectTargetError(code),
      false,
      `expected ${code} NOT to be continueable`,
    );
  }
});

// ---------------------------------------------------------------------------
// Redirect loop orchestration (mock fetch)
// ---------------------------------------------------------------------------

interface MockRedirectEntry {
  status: number;
  location?: string;
  body?: ReadableStream<Uint8Array> | null;
}

function makeMockFetch(
  routes: ReadonlyMap<string, MockRedirectEntry>,
): {
  fetchImpl: (
    input: URL,
  ) => Promise<Response>;
  callLog: string[];
} {
  const callLog: string[] = [];

  const fetchImpl = async (input: URL): Promise<Response> => {
    const key = input.toString();
    callLog.push(key);
    const entry = routes.get(key);
    if (!entry) {
      throw new Error(
        `mock fetch: no route registered for ${key}`,
      );
    }
    const headers = new Headers();
    if (entry.location !== undefined) {
      headers.set("location", entry.location);
    }
    return new Response(entry.body ?? null, {
      status: entry.status,
      headers,
    });
  };

  return { fetchImpl, callLog };
}

test(
  "redirect loop: short link -> Shopee intermediate -> product URL",
  async () => {
    const routes = new Map<string, MockRedirectEntry>([
      [
        "https://s.shopee.vn/abc",
        {
          status: 302,
          location: "https://shopee.vn/intermediate-path",
        },
      ],
      [
        "https://shopee.vn/intermediate-path",
        {
          status: 302,
          location: "https://shopee.vn/product/123/456",
        },
      ],
    ]);
    const { fetchImpl, callLog } = makeMockFetch(routes);

    const result = await runShopeeProductUrlRedirectLoop(
      new URL("https://s.shopee.vn/abc"),
      fetchImpl,
    );

    assert.equal(result.shopId, "123");
    assert.equal(result.itemId, "456");
    assert.equal(
      result.canonicalUrl,
      "https://shopee.vn/product/123/456",
    );
    assert.deepEqual(callLog, [
      "https://s.shopee.vn/abc",
      "https://shopee.vn/intermediate-path",
    ]);
  },
);

test(
  "redirect loop: intermediate allowed Shopee path that 200s throws not_product_url",
  async () => {
    // A Shopee-allowlisted intermediate URL that resolves with HTTP 200 is
    // NOT a redirect, so the loop surfaces not_product_url. The production
    // resolver maps this to ShopeeProductUrlError code "not_product_url"
    // per the baseline public API contract.
    const routes = new Map<string, MockRedirectEntry>([
      [
        "https://s.shopee.vn/abc",
        {
          status: 302,
          location: "https://shopee.vn/intermediate-path",
        },
      ],
      [
        "https://shopee.vn/intermediate-path",
        { status: 200 },
      ],
    ]);
    const { fetchImpl } = makeMockFetch(routes);

    await assert.rejects(
      () =>
        runShopeeProductUrlRedirectLoop(
          new URL("https://s.shopee.vn/abc"),
          fetchImpl,
        ),
      (err: unknown) => {
        assert.ok(
          err instanceof ShopeeProductUrlRedirectError,
        );
        assert.equal(err.code, "not_product_url");
        return true;
      },
    );
  },
);

test(
  "redirect loop: missing Location header on 3xx throws redirect_failed",
  async () => {
    const routes = new Map<string, MockRedirectEntry>([
      [
        "https://s.shopee.vn/abc",
        { status: 302 },
      ],
    ]);
    const { fetchImpl } = makeMockFetch(routes);

    await assert.rejects(
      () =>
        runShopeeProductUrlRedirectLoop(
          new URL("https://s.shopee.vn/abc"),
          fetchImpl,
        ),
      (err: unknown) => {
        assert.ok(
          err instanceof ShopeeProductUrlRedirectError,
        );
        assert.equal(err.code, "redirect_failed");
        return true;
      },
    );
  },
);

test(
  "redirect loop: hostile target host stops with unsupported_host",
  async () => {
    const routes = new Map<string, MockRedirectEntry>([
      [
        "https://s.shopee.vn/abc",
        {
          status: 302,
          location: "https://attacker.example/foo",
        },
      ],
    ]);
    const { fetchImpl, callLog } = makeMockFetch(routes);

    await assert.rejects(
      () =>
        runShopeeProductUrlRedirectLoop(
          new URL("https://s.shopee.vn/abc"),
          fetchImpl,
        ),
      (err: unknown) => {
        assert.ok(
          err instanceof ShopeeProductUrlParseError,
        );
        assert.equal(err.code, "unsupported_host");
        return true;
      },
    );
    // We must never have fetched the hostile URL.
    assert.deepEqual(callLog, [
      "https://s.shopee.vn/abc",
    ]);
  },
);

test(
  "redirect loop: target with credentials stops with credentials_not_allowed",
  async () => {
    const routes = new Map<string, MockRedirectEntry>([
      [
        "https://s.shopee.vn/abc",
        {
          status: 302,
          location: "https://user:pass@shopee.vn/product/1/2",
        },
      ],
    ]);
    const { fetchImpl, callLog } = makeMockFetch(routes);

    await assert.rejects(
      () =>
        runShopeeProductUrlRedirectLoop(
          new URL("https://s.shopee.vn/abc"),
          fetchImpl,
        ),
      (err: unknown) => {
        assert.ok(
          err instanceof ShopeeProductUrlParseError,
        );
        assert.equal(err.code, "credentials_not_allowed");
        return true;
      },
    );
    assert.deepEqual(callLog, [
      "https://s.shopee.vn/abc",
    ]);
  },
);

test(
  "redirect loop: target with invalid product identifier stops with invalid_identifier",
  async () => {
    // The intermediate URL has the right shape (3 segments, last two are
    // digits) but the itemId is not a valid digit string. The loop
    // surfaces invalid_identifier verbatim. It does NOT swallow it as
    // continueable here because invalid_identifier IS in the continueable
    // set, but only when the chain has not yet produced a product URL.
    // Since we want the loop to actually try the next hop, we need the
    // invalid_identifier target to redirect to the canonical product URL.
    const routes = new Map<string, MockRedirectEntry>([
      [
        "https://s.shopee.vn/abc",
        {
          status: 302,
          location: "https://shopee.vn/some-shop/123/abc",
        },
      ],
      [
        "https://shopee.vn/some-shop/123/abc",
        {
          status: 302,
          location: "https://shopee.vn/product/9/9",
        },
      ],
    ]);
    const { fetchImpl, callLog } = makeMockFetch(routes);

    const result = await runShopeeProductUrlRedirectLoop(
      new URL("https://s.shopee.vn/abc"),
      fetchImpl,
    );
    assert.equal(result.shopId, "9");
    assert.equal(result.itemId, "9");
    assert.equal(
      result.canonicalUrl,
      "https://shopee.vn/product/9/9",
    );
    assert.deepEqual(callLog, [
      "https://s.shopee.vn/abc",
      "https://shopee.vn/some-shop/123/abc",
    ]);
  },
);

test(
  "redirect loop: exceeds MAX_REDIRECTS throws too_many_redirects",
  async () => {
    const routes = new Map<string, MockRedirectEntry>([
      [
        "https://s.shopee.vn/loop",
        {
          status: 302,
          location: "https://shopee.vn/hop-1",
        },
      ],
      [
        "https://shopee.vn/hop-1",
        {
          status: 302,
          location: "https://shopee.vn/hop-2",
        },
      ],
      [
        "https://shopee.vn/hop-2",
        {
          status: 302,
          location: "https://shopee.vn/hop-3",
        },
      ],
      [
        "https://shopee.vn/hop-3",
        {
          status: 302,
          location: "https://shopee.vn/hop-4",
        },
      ],
      [
        "https://shopee.vn/hop-4",
        {
          status: 302,
          location: "https://shopee.vn/hop-5",
        },
      ],
      [
        "https://shopee.vn/hop-5",
        {
          status: 302,
          location: "https://shopee.vn/hop-6",
        },
      ],
      [
        "https://shopee.vn/hop-6",
        {
          status: 302,
          location: "https://shopee.vn/product/1/1",
        },
      ],
    ]);
    const { fetchImpl } = makeMockFetch(routes);

    await assert.rejects(
      () =>
        runShopeeProductUrlRedirectLoop(
          new URL("https://s.shopee.vn/loop"),
          fetchImpl,
        ),
      (err: unknown) => {
        assert.ok(
          err instanceof ShopeeProductUrlRedirectError,
        );
        assert.equal(err.code, "too_many_redirects");
        return true;
      },
    );
  },
);

test(
  "redirect loop: fetch network failure throws redirect_failed",
  async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new Error("ECONNREFUSED");
    };
    await assert.rejects(
      () =>
        runShopeeProductUrlRedirectLoop(
          new URL("https://s.shopee.vn/abc"),
          fetchImpl,
        ),
      (err: unknown) => {
        assert.ok(
          err instanceof ShopeeProductUrlRedirectError,
        );
        assert.equal(err.code, "redirect_failed");
        return true;
      },
    );
  },
);

test(
  "redirect loop: invalid Location URL throws redirect_failed",
  async () => {
    const routes = new Map<string, MockRedirectEntry>([
      [
        "https://s.shopee.vn/abc",
        {
          status: 302,
          location: "http://[::1",
        },
      ],
    ]);
    const { fetchImpl } = makeMockFetch(routes);

    await assert.rejects(
      () =>
        runShopeeProductUrlRedirectLoop(
          new URL("https://s.shopee.vn/abc"),
          fetchImpl,
        ),
      (err: unknown) => {
        assert.ok(
          err instanceof ShopeeProductUrlRedirectError,
        );
        assert.equal(err.code, "redirect_failed");
        return true;
      },
    );
  },
);

test(
  "redirect loop: returns identity on direct product-shaped target with no further redirect",
  async () => {
    const routes = new Map<string, MockRedirectEntry>([
      [
        "https://s.shopee.vn/abc",
        {
          status: 302,
          location: "https://shopee.vn/product/777/888",
        },
      ],
    ]);
    const { fetchImpl, callLog } = makeMockFetch(routes);

    const result = await runShopeeProductUrlRedirectLoop(
      new URL("https://s.shopee.vn/abc"),
      fetchImpl,
    );
    assert.equal(result.shopId, "777");
    assert.equal(result.itemId, "888");
    assert.equal(
      result.canonicalUrl,
      "https://shopee.vn/product/777/888",
    );
    assert.deepEqual(callLog, [
      "https://s.shopee.vn/abc",
    ]);
  },
);