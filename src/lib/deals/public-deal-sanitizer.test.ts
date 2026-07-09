/**
 * Phase 20I.2 -- sanitizer URL-safety tests.
 *
 * Each blocker in the brief is checked explicitly:
 *   - networkSubId, sourceSubId1, purchaseIntentId, trackingLinkId,
 *     publisherId, shortCode, clickId, trackingPath, an_redir,
 *     vaflnk, UUID, uuid, token, sub_id, subId, aff_sub all fall
 *     back to the merchant landing page.
 *   - checks run across host / query key / query value / path /
 *     hash / full URL.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERNAL_TOKEN_HINTS_FOR_AUDIT,
  safeUrl,
  sanitizePublicDeal,
} from "./public-deal-sanitizer";
import type { PublicDeal, PublicPromoDeal } from "@/services/public-deals.types";

const SAFE_LANDING_BY_PLATFORM = {
  shopee: "https://shopee.vn/",
  lazada: "https://www.lazada.vn/",
  tiktok: "https://shop.tiktok.com/",
  tiki: "https://tiki.vn/",
};

function assertIsSafeLanding(url: string, platform: keyof typeof SAFE_LANDING_BY_PLATFORM) {
  assert.strictEqual(url, SAFE_LANDING_BY_PLATFORM[platform]);
}

test("safeUrl keeps a clean merchant URL untouched", () => {
  const result = safeUrl("https://shopee.vn/dien-tu/laptop", "shopee");
  assert.strictEqual(result.replaced, false);
  assert.ok(result.url.startsWith("https://shopee.vn/dien-tu/laptop"));
});

test("safeUrl replaces input that contains an internal tracking hint in query value", () => {
  const result = safeUrl(
    "https://shopee.vn/dien-tu?af_id=networkSubId:abc",
    "shopee",
  );
  assert.strictEqual(result.replaced, true);
  assertIsSafeLanding(result.url, "shopee");
});

test("safeUrl replaces input with a forbidden redirect host", () => {
  const result = safeUrl(
    "https://shp.ee/vaflnk?r=something",
    "shopee",
  );
  assert.strictEqual(result.replaced, true);
  assertIsSafeLanding(result.url, "shopee");
});

test("safeUrl replaces when ANY required hint appears in query key or hash", () => {
  for (const hint of [
    "networkSubId",
    "sourceSubId1",
    "purchaseIntentId",
    "trackingLinkId",
    "publisherId",
    "shortCode",
    "clickId",
    "trackingPath",
    "an_redir",
    "vaflnk",
    "uuid",
    "token",
    "sub_id",
    "aff_sub",
  ]) {
    const result = safeUrl(
      `https://shopee.vn/dien-tu?${hint}=abc#${hint}=val`,
      "shopee",
    );
    assert.strictEqual(result.replaced, true, `expected ${hint} to be blocked`);
    assertIsSafeLanding(result.url, "shopee");
  }
});

test("safeUrl replaces when an internal hint appears in a path segment", () => {
  const result = safeUrl(
    "https://shopee.vn/r/networkSubId/abc",
    "shopee",
  );
  assert.strictEqual(result.replaced, true);
  assertIsSafeLanding(result.url, "shopee");
});

test("safeUrl replaces when an internal hint appears in a path segment (subId variant)", () => {
  const result = safeUrl(
    "https://shopee.vn/r/subId1/abc",
    "shopee",
  );
  assert.strictEqual(result.replaced, true);
  assertIsSafeLanding(result.url, "shopee");
});

test("safeUrl accepts an unrelated utm_source query (not on the blocklist)", () => {
  const result = safeUrl(
    "https://shopee.vn/dien-tu?utm_source=facebook",
    "shopee",
  );
  assert.strictEqual(result.replaced, false);
  assert.ok(result.url.includes("utm_source=facebook"));
});

test("safeUrl rejects non-http schemes", () => {
  const result = safeUrl("javascript:alert(1)", "shopee");
  assert.strictEqual(result.replaced, true);
  assertIsSafeLanding(result.url, "shopee");
});

test("safeUrl rejects malformed URLs", () => {
  const result = safeUrl("not a url at all", "shopee");
  assert.strictEqual(result.replaced, true);
  assertIsSafeLanding(result.url, "shopee");
});

test("safeUrl rejects null / empty input", () => {
  assert.strictEqual(safeUrl(null, "shopee").replaced, true);
  assert.strictEqual(safeUrl(undefined, "shopee").replaced, true);
  assert.strictEqual(safeUrl("", "shopee").replaced, true);
  assert.strictEqual(safeUrl("   ", "shopee").replaced, true);
});

test("sanitizePublicDeal rejects a record whose id contains an internal hint", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal({ ...baseDeal, id: "networkSubId-123" });
  assert.strictEqual(result.ok, false);
});

test("sanitizePublicDeal rewrites destinationUrl when a tracking hint is present", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal({
    ...baseDeal,
    destinationUrl: "https://shopee.vn/?clickId=abc",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.destinationUrl, SAFE_LANDING_BY_PLATFORM.shopee);
    assert.ok(result.redactedFields.includes("destinationUrl"));
  }
});

test("sanitizePublicDeal rewrites title that contains an internal hint", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal({
    ...baseDeal,
    title: "Deal with clickId=12345 attached",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.ok(!result.value.title.includes("clickId"));
    assert.ok(result.redactedFields.includes("title"));
  }
});

test("sanitizePublicDeal rewrites cashback copy that sounds guaranteed", () => {
  const baseDeal: PublicDeal = {
    id: "shopee-cashback-test",
    platform: "shopee",
    kind: "cashback_program",
    status: "active",
    title: "Cashback test",
    description: "Ưu đãi có thể thay đổi theo điều kiện của sàn.",
    categorySlug: "popular",
    isExclusive: false,
    isFeatured: false,
    expiresAt: null,
    destinationUrl: "https://shopee.vn/dien-tu/cashback",
    discountText: null,
    minSpendText: null,
    estimatedCashbackBps: 500,
    cashbackWindowText: "Hoàn tiền chắc chắn 100%",
    termsNote: "Đảm bảo nhận tiền sau 7 ngày.",
  };
  const result = sanitizePublicDeal(baseDeal);
  assert.strictEqual(result.ok, true);
  if (result.ok && result.value.kind === "cashback_program") {
    assert.ok(!result.value.cashbackWindowText.toLowerCase().includes("chắc chắn"));
    assert.ok(!result.value.termsNote.toLowerCase().includes("đảm bảo"));
    assert.ok(result.redactedFields.includes("cashbackWindowText"));
    assert.ok(result.redactedFields.includes("termsNote"));
  }
});

test("sanitizePublicDeal keeps a clean record intact", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal(baseDeal);
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.deepStrictEqual(result.redactedFields, []);
    assert.strictEqual(result.value.destinationUrl, baseDeal.destinationUrl);
  }
});

test("sanitizer hint list is non-empty and includes all required entries", () => {
  const required = [
    "networkSubId",
    "sourceSubId1",
    "purchaseIntentId",
    "trackingLinkId",
    "publisherId",
    "shortCode",
    "clickId",
    "trackingPath",
    "an_redir",
    "vaflnk",
    "uuid",
    "token",
    "sub_id",
    "subId",
    "aff_sub",
  ];
  for (const token of required) {
    assert.ok(
      INTERNAL_TOKEN_HINTS_FOR_AUDIT.some((hint) =>
        hint.toLowerCase() === token.toLowerCase(),
      ),
      `expected ${token} in INTERNAL_TOKEN_HINTS_FOR_AUDIT`,
    );
  }
});

test("Phase 20I.4: sanitizer scrubs offerLink and productLink the same as destinationUrl", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal({
    ...baseDeal,
    offerLink: "https://shopee.vn/x?clickId=1",
    productLink: "https://shopee.vn/x?aff_sub=2",
    imageUrl: "https://cf.shopee.vn/y?vaflnk=3",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(
      result.value.offerLink,
      "https://shopee.vn/",
      "offerLink must fall back to merchant landing page",
    );
    assert.strictEqual(
      result.value.productLink,
      "https://shopee.vn/",
      "productLink must fall back to merchant landing page",
    );
    assert.strictEqual(
      result.value.imageUrl,
      "https://shopee.vn/",
      "imageUrl must fall back to merchant landing page",
    );
    assert.ok(result.redactedFields.includes("offerLink"));
    assert.ok(result.redactedFields.includes("productLink"));
    assert.ok(result.redactedFields.includes("imageUrl"));
  }
});

test("Phase 20I.4: sanitizer replaces cashback label that smells guaranteed", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal({
    ...baseDeal,
    cashbackLabel: "Cashback du kien theo dieu kien",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    // A clean label should not be redacted.
    assert.strictEqual(result.value.cashbackLabel, "Cashback du kien theo dieu kien");
    assert.ok(!result.redactedFields.includes("cashbackLabel"));
  }
});

test("Phase 20I.4: sanitizer drops cashbackLabel that contains a tracking hint", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal({
    ...baseDeal,
    cashbackLabel: "Cashback theo aff_sub=1",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.ok(result.value.cashbackLabel !== "Cashback theo aff_sub=1");
    assert.ok(result.redactedFields.includes("cashbackLabel"));
  }
});

test("Phase 20I.4: sanitizer accepts a clean commissionRate in [0, 1]", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal({
    ...baseDeal,
    commissionRate: 0.07,
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.commissionRate, 0.07);
  }
});

test("Phase 20I.4: sanitizer drops a negative or >1 commissionRate", () => {
  const baseDeal = makeDeal();
  const negative = sanitizePublicDeal({
    ...baseDeal,
    commissionRate: -0.5,
  });
  const over = sanitizePublicDeal({
    ...baseDeal,
    commissionRate: 1.2,
  });
  assert.strictEqual(negative.ok, true);
  assert.strictEqual(over.ok, true);
  if (negative.ok) {
    assert.strictEqual(negative.value.commissionRate, null);
    assert.ok(negative.redactedFields.includes("commissionRate"));
  }
  if (over.ok) {
    assert.strictEqual(over.value.commissionRate, null);
    assert.ok(over.redactedFields.includes("commissionRate"));
  }
});

test("Phase 20I.4: sanitizer keeps a clean rating and drops an out-of-range one", () => {
  const baseDeal = makeDeal();
  const clean = sanitizePublicDeal({ ...baseDeal, rating: "4.9" });
  const bad = sanitizePublicDeal({ ...baseDeal, rating: "99" });
  assert.strictEqual(clean.ok, true);
  assert.strictEqual(bad.ok, true);
  if (clean.ok) {
    assert.strictEqual(clean.value.rating, "4.9");
  }
  if (bad.ok) {
    assert.strictEqual(bad.value.rating, null);
    assert.ok(bad.redactedFields.includes("rating"));
  }
});

test("Phase 20I.4: sanitizer drops unsafe productCatIds", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal({
    ...baseDeal,
    productCatIds: [100636, -1] as number[],
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    // Negative id poisons the whole array, so the array is dropped.
    assert.strictEqual(result.value.productCatIds, null);
    assert.ok(result.redactedFields.includes("productCatIds"));
  }
});

test("Phase 20I.4: sanitizer drops malformed ISO timestamps", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal({
    ...baseDeal,
    startsAt: "not-iso",
    endsAt: "2099-12-31T23:59:59Z",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.value.startsAt, null);
    assert.strictEqual(result.value.endsAt, "2099-12-31T23:59:59.000Z");
  }
});

test("Phase 20I.4: sanitizer rewrites shopName that contains a forbidden tracking hint", () => {
  const baseDeal = makeDeal();
  const result = sanitizePublicDeal({
    ...baseDeal,
    shopName: "Top shop aff_sub=1",
  });
  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.ok(result.value.shopName !== "Top shop aff_sub=1");
    assert.ok(result.redactedFields.includes("shopName"));
  }
});

function makeDeal(): PublicPromoDeal {
  return {
    id: "shopee-clean-test-deal",
    platform: "shopee",
    kind: "deal",
    status: "active",
    title: "Laptop deal test",
    description: "Ưu đãi có thể thay đổi theo điều kiện của sàn.",
    categorySlug: "electronics",
    isExclusive: false,
    isFeatured: false,
    expiresAt: null,
    destinationUrl: "https://shopee.vn/dien-tu/laptop",
    discountText: null,
    minSpendText: null,
  };
}
