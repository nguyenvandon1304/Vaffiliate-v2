import test from "node:test";
import assert from "node:assert/strict";

import { ShopeeProductMetadataError } from "./provider.errors";
import { extractShopeeProductMetadataFromHtml } from "./extractor";
import type { ShopeeProductIdentity } from "./types";

const IDENTITY: ShopeeProductIdentity = {
  shopId: "12345",
  itemId: "67890",
  canonicalUrl: "https://shopee.vn/product/12345/67890",
};

function buildJsonLdProduct(
  overrides: Record<string, unknown> = {},
): string {
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Ao thun nam basic",
    image: [
      "https://down-vn.img.susercontent.com/file-1",
    ],
    brand: { "@type": "Brand", name: "Cool Shop" },
    offers: {
      "@type": "Offer",
      price: "123000",
      priceCurrency: "VND",
      availability: "https://schema.org/InStock",
    },
    ...overrides,
  };
  return `<script type="application/ld+json">${JSON.stringify(product)}</script>`;
}

function buildOpenGraphPage(
  overrides: Record<string, string> = {},
): string {
  const tags = [
    '<meta property="og:title" content="Ao thun nam basic">',
    '<meta property="og:image" content="https://down-vn.img.susercontent.com/file-1">',
    '<meta property="product:price:amount" content="123000">',
    '<meta property="product:price:currency" content="VND">',
    '<meta property="og:site_name" content="Cool Shop">',
  ];
  for (const [key, value] of Object.entries(overrides)) {
    tags.push(
      `<meta property="${key}" content="${value.replace(/"/g, "&quot;")}">`,
    );
  }
  return `<html><head>${tags.join("")}</head><body></body></html>`;
}

test("extracts a complete JSON-LD Product into typed metadata", () => {
  const html = `<html><head>${buildJsonLdProduct()}</head></html>`;
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.equal(metadata.title, "Ao thun nam basic");
  assert.equal(metadata.imageUrl, "https://down-vn.img.susercontent.com/file-1");
  assert.deepEqual(metadata.price, { amount: 123000, currency: "VND" });
  assert.equal(metadata.shopName, "Cool Shop");
  assert.equal(metadata.availability, "available");
});

test("falls back to Open Graph when JSON-LD is missing", () => {
  const html = buildOpenGraphPage();
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.equal(metadata.title, "Ao thun nam basic");
  assert.deepEqual(metadata.price, { amount: 123000, currency: "VND" });
  assert.equal(metadata.shopName, "Cool Shop");
});

test("prefers JSON-LD title when both sources are present", () => {
  const html = `<html><head>${buildJsonLdProduct({ name: "From JSON-LD" })}${buildOpenGraphPage({ "og:title": "From Open Graph" })}</head></html>`;
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.equal(metadata.title, "From JSON-LD");
});

test("extracts large VND price with thousands separators", () => {
  const html = `<html><head><meta property="og:title" content="Ao"><meta property="og:image" content="https://down-vn.img.susercontent.com/large-vnd-price.jpg"><meta property="product:price:amount" content="1.234.000"><meta property="product:price:currency" content="VND"></head></html>`;
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.deepEqual(metadata.price, { amount: 1234000, currency: "VND" });
});

test("missing title -> metadata_incomplete", () => {
  const html = `<html><head><meta property="og:image" content="https://down-vn.img.susercontent.com/missing-title.jpg"><meta property="product:price:amount" content="1000"><meta property="product:price:currency" content="VND"></head></html>`;
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("missing image -> metadata_incomplete", () => {
  const html = `<html><head><meta property="og:title" content="Hello"><meta property="product:price:amount" content="1000"><meta property="product:price:currency" content="VND"></head></html>`;
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("missing price -> metadata_incomplete", () => {
  const html = `<html><head><meta property="og:title" content="Hello"><meta property="og:image" content="https://down-vn.img.susercontent.com/missing-price.jpg"></head></html>`;
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("malformed price string -> metadata_incomplete", () => {
  const html = `<html><head><meta property="og:title" content="Ao"><meta property="og:image" content="https://down-vn.img.susercontent.com/malformed-price.jpg"><meta property="product:price:amount" content="free"><meta property="product:price:currency" content="VND"></head></html>`;
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("non-VND price currency -> metadata_incomplete", () => {
  const html = `<html><head><meta property="og:title" content="Ao"><meta property="og:image" content="https://down-vn.img.susercontent.com/non-vnd-currency.jpg"><meta property="product:price:amount" content="123000"><meta property="product:price:currency" content="USD"></head></html>`;
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("unsafe integer price is rejected", () => {
  const huge = String(Number.MAX_SAFE_INTEGER) + "9";
  const html = `<html><head><meta property="og:title" content="Ao"><meta property="og:image" content="https://down-vn.img.susercontent.com/unsafe-integer-price.jpg"><meta property="product:price:amount" content="${huge}"><meta property="product:price:currency" content="VND"></head></html>`;
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("empty HTML -> metadata_incomplete", () => {
  assert.throws(
    () => extractShopeeProductMetadataFromHtml("", IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("unavailable marker -> product_unavailable", () => {
  const html = `<html><head><title>Shopee</title></head><body><h1>This product is no longer available</h1></body></html>`;
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_unavailable");
      return true;
    },
  );
});

test("non-string HTML payload -> provider_response_invalid", () => {
  assert.throws(
    () =>
      // @ts-expect-error intentional bad input
      extractShopeeProductMetadataFromHtml(null, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "provider_response_invalid");
      return true;
    },
  );
});

test("malformed JSON-LD is ignored", () => {
  const html = `<html><head><script type="application/ld+json">{ this is not json</script>${buildOpenGraphPage()}</head></html>`;
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.equal(metadata.title, "Ao thun nam basic");
});

test("large but safe IDs are preserved verbatim", () => {
  const largeShopId = "9007199254740991";
  const largeItemId = "1234567890123456789";
  const html = buildOpenGraphPage();
  const metadata = extractShopeeProductMetadataFromHtml(html, {
    shopId: largeShopId,
    itemId: largeItemId,
    canonicalUrl: `https://shopee.vn/product/${largeShopId}/${largeItemId}`,
  });
  assert.equal(metadata.shopId, largeShopId);
  assert.equal(metadata.itemId, largeItemId);
  assert.equal(typeof metadata.shopId, "string");
  assert.equal(typeof metadata.itemId, "string");
});

// ─── Strict VND price parser ─────────────────────────────────────────────────

function makePriceHtml(priceValue: string): string {
  return `<html><head><meta property="og:title" content="Test Product"><meta property="og:image" content="https://down-vn.img.susercontent.com/test-product.jpg"><meta property="product:price:amount" content="${priceValue}"><meta property="product:price:currency" content="VND"></head></html>`;
}

function makeJsonLdPriceHtml(priceValue: string): string {
  return `<html><head>${buildJsonLdProduct({ offers: { "@type": "Offer", price: priceValue, priceCurrency: "VND" } })}</head></html>`;
}

test("plain ASCII digits parse correctly", () => {
  const metadata = extractShopeeProductMetadataFromHtml(makePriceHtml("123000"), IDENTITY);
  assert.deepEqual(metadata.price, { amount: 123000, currency: "VND" });
});

test("dot thousands separator (1.234.000) parses correctly", () => {
  const metadata = extractShopeeProductMetadataFromHtml(makePriceHtml("1.234.000"), IDENTITY);
  assert.deepEqual(metadata.price, { amount: 1_234_000, currency: "VND" });
});

test("comma thousands separator (1,234,000) parses correctly", () => {
  const metadata = extractShopeeProductMetadataFromHtml(makePriceHtml("1,234,000"), IDENTITY);
  assert.deepEqual(metadata.price, { amount: 1_234_000, currency: "VND" });
});

test("negative price -> metadata_incomplete", () => {
  const html = makePriceHtml("-1000");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("positive sign prefix (+1000) -> metadata_incomplete", () => {
  const html = makePriceHtml("+1000");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("scientific notation (1e3) -> metadata_incomplete", () => {
  const html = makePriceHtml("1e3");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("non-numeric string (abc500) -> metadata_incomplete", () => {
  const html = makePriceHtml("abc500");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("decimal separator instead of thousands (12.34) -> metadata_incomplete", () => {
  const html = makePriceHtml("12.34");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("invalid comma grouping (1,23,000) -> metadata_incomplete", () => {
  const html = makePriceHtml("1,23,000");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("NaN string -> metadata_incomplete", () => {
  const html = makePriceHtml("NaN");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("Infinity string -> metadata_incomplete", () => {
  const html = makePriceHtml("Infinity");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("empty price string -> metadata_incomplete", () => {
  const html = makePriceHtml("");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("whitespace-only price string -> metadata_incomplete", () => {
  const html = makePriceHtml("   ");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("unsafe integer (MAX_SAFE_INTEGER + 9) -> metadata_incomplete", () => {
  const unsafe = String(Number.MAX_SAFE_INTEGER) + "9";
  const html = makePriceHtml(unsafe);
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("JSON-LD price with dot thousands separator parses correctly", () => {
  const html = makeJsonLdPriceHtml("1.234.000");
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.deepEqual(metadata.price, { amount: 1_234_000, currency: "VND" });
});

test("zero price parses correctly", () => {
  const html = makePriceHtml("0");
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.deepEqual(metadata.price, { amount: 0, currency: "VND" });
});

test("price with surrounding whitespace trims correctly", () => {
  const html = makePriceHtml("  123000  ");
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.deepEqual(metadata.price, { amount: 123000, currency: "VND" });
});

// ─── Image URL validation ─────────────────────────────────────────────────────

function makeImageHtml(imageUrl: string): string {
  return `<html><head><meta property="og:title" content="Test"><meta property="og:image" content="${imageUrl}"><meta property="product:price:amount" content="100000"><meta property="product:price:currency" content="VND"></head></html>`;
}

test("valid HTTPS image URL passes validation", () => {
  const html = makeImageHtml("https://down-vn.img.susercontent.com/file/someimage");
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.equal(metadata.imageUrl, "https://down-vn.img.susercontent.com/file/someimage");
});

test("malformed URL (no scheme) -> metadata_incomplete", () => {
  const html = makeImageHtml("not-a-url");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("javascript: URL -> metadata_incomplete", () => {
  const html = makeImageHtml("javascript:alert(1)");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("data: URL -> metadata_incomplete", () => {
  const html = makeImageHtml("data:image/png;base64,abc");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("http: URL -> metadata_incomplete", () => {
  const html = makeImageHtml("http://example.com/image.jpg");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

test("URL with credentials -> metadata_incomplete", () => {
  const html = makeImageHtml("https://user:pass@example.com/image.jpg");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "metadata_incomplete");
      return true;
    },
  );
});

// ─── JSON-LD availability ─────────────────────────────────────────────────────

function makeJsonLdWithAvailability(availability: string): string {
  return `<html><head>${buildJsonLdProduct({ offers: { "@type": "Offer", price: "123000", priceCurrency: "VND", availability } })}</head></html>`;
}

test("JSON-LD InStock -> availability = available", () => {
  const html = makeJsonLdWithAvailability("https://schema.org/InStock");
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.equal(metadata.availability, "available");
});

test("JSON-LD LimitedAvailability -> availability = available", () => {
  const html = makeJsonLdWithAvailability("https://schema.org/LimitedAvailability");
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.equal(metadata.availability, "available");
});

test("JSON-LD OutOfStock -> product_unavailable", () => {
  const html = makeJsonLdWithAvailability("https://schema.org/OutOfStock");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_unavailable");
      return true;
    },
  );
});

test("JSON-LD SoldOut -> product_unavailable", () => {
  const html = makeJsonLdWithAvailability("https://schema.org/SoldOut");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_unavailable");
      return true;
    },
  );
});

test("JSON-LD Discontinued -> product_unavailable", () => {
  const html = makeJsonLdWithAvailability("https://schema.org/Discontinued");
  assert.throws(
    () => extractShopeeProductMetadataFromHtml(html, IDENTITY),
    (err: unknown) => {
      assert.ok(err instanceof ShopeeProductMetadataError);
      assert.equal(err.code, "product_unavailable");
      return true;
    },
  );
});

test("JSON-LD missing availability -> availability = unknown", () => {
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Test Product",
    image: "https://down-vn.img.susercontent.com/test-no-availability.jpg",
    offers: {
      "@type": "Offer",
      price: "123000",
      priceCurrency: "VND",
    },
  };
  const html = `<html><head><script type="application/ld+json">${JSON.stringify(product)}</script></head></html>`;
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.equal(metadata.availability, "unknown");
});

test("JSON-LD availability unknown value -> availability = unknown", () => {
  const html = makeJsonLdWithAvailability("https://schema.org/PreOrder");
  const metadata = extractShopeeProductMetadataFromHtml(html, IDENTITY);
  assert.equal(metadata.availability, "unknown");
});