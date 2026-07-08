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
