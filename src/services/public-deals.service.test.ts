/**
 * Phase 20I.1 -- tests for the public-deals service.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getDealAction,
  listCategories,
  listDealsByCategory,
  listDealsByPlatform,
  listFeaturedDeals,
  listPlatforms,
  parseCategorySlug,
  serializeDealAction,
} from "@/services/public-deals.service";
import { ALL_CATEGORY_SLUGS, PUBLIC_DEALS } from "@/lib/mock/public-deals";
import type { DealCategorySlug } from "@/services/public-deals.types";


const FORBIDDEN_HEX: ReadonlyArray<string> = [
  "#ee4d2d",
  "#0f146d",
  "#1a94ff",
];

test("listFeaturedDeals returns only featured + active", () => {
  const featured = listFeaturedDeals();
  assert.ok(featured.length > 0);
  for (const deal of featured) {
    assert.equal(deal.status, "active");
    assert.equal(deal.isFeatured, true);
  }
});

test("listDealsByPlatform scopes by platform", () => {
  const shopee = listDealsByPlatform("shopee");
  const lazada = listDealsByPlatform("lazada");
  const tiktok = listDealsByPlatform("tiktok");
  const tiki = listDealsByPlatform("tiki");
  assert.ok(shopee.length >= 8, "shopee catalog dense");
  assert.equal(lazada.length, 1, "lazada scaffold");
  assert.equal(tiktok.length, 1, "tiktok scaffold");
  assert.equal(tiki.length, 1, "tiki scaffold");
  for (const deal of shopee) assert.equal(deal.platform, "shopee");
  for (const deal of lazada) assert.equal(deal.platform, "lazada");
});

test("listDealsByCategory narrows by category and filters inactive", () => {
  const electronics = listDealsByCategory("shopee", "electronics");
  assert.ok(electronics.length >= 1);
  for (const deal of electronics) {
    assert.equal(deal.platform, "shopee");
    assert.equal(deal.status, "active");
    assert.equal(deal.categorySlug, "electronics");
  }
});

test("listDealsByCategory(shopee, all) returns only active shopee deals", () => {
  const all = listDealsByCategory("shopee", "all");
  for (const deal of all) {
    assert.equal(deal.status, "active");
  }
  assert.equal(all.length, listDealsByPlatform("shopee").filter((d) => d.status === "active").length);
});

test("listPlatforms returns all four platforms with toneToken (no brand-colour hex)", () => {
  const platforms = listPlatforms();
  assert.equal(platforms.length, 4);
  const toneTokens = new Set(platforms.map((p) => p.toneToken));
  assert.ok(toneTokens.size >= 1, "tone tokens present");
  for (const p of platforms) {
    const record = JSON.stringify(p);
    for (const hex of FORBIDDEN_HEX) {
      assert.ok(!record.includes(hex), `${p.platform} descriptor must not contain ${hex}`);
    }
    assert.ok(!("accentColor" in p), `${p.platform} descriptor must not expose accentColor`);
  }
});

test("listCategories includes the Shopee MVP slugs", () => {
  const categories = listCategories();
  const slugs = new Set<DealCategorySlug>(categories.map((c) => c.slug));
  for (const s of ALL_CATEGORY_SLUGS) {
    assert.ok(slugs.has(s), `expected slug ${s}`);
  }
});

test("getDealAction returns 'cashback' intent for Shopee cashback_program", () => {
  const deals = PUBLIC_DEALS.filter(
    (d) => d.kind === "cashback_program" && d.platform === "shopee",
  );
  assert.ok(deals.length >= 1);
  for (const deal of deals) {
    const action = getDealAction(deal);
    assert.equal(action.ctaIntent, "cashback");
    assert.equal(action.ctaHref, "/cashback");
    assert.equal(action.supportsCopy, false);
    assert.equal(action.code, null);
  }
});

test("getDealAction returns 'copy' intent for active voucher with code", () => {
  const voucher = PUBLIC_DEALS.find(
    (d) => d.kind === "voucher_code" && d.status === "active" && Boolean(d.code),
  );
  assert.ok(voucher);
  const action = getDealAction(voucher);
  assert.equal(action.ctaIntent, "copy");
  assert.equal(action.supportsCopy, true);
  assert.equal(typeof action.code, "string");
  assert.ok((action.code ?? "").length > 0);
});

test("getDealAction returns disabled semantics for expired deals", () => {
  const expired = PUBLIC_DEALS.filter((d) => d.status === "expired");
  assert.ok(expired.length >= 1);
  for (const deal of expired) {
    const action = getDealAction(deal);
    assert.equal(action.ctaIntent, "disabled");
    assert.equal(action.ctaHref, null);
    assert.equal(action.supportsCopy, false);
    assert.equal(action.code, null);
    assert.ok(action.ctaLabel.length > 0);
  }
});

test("getDealAction returns 'outbound' for display deals", () => {
  const deal = PUBLIC_DEALS.find(
    (d) => d.kind === "deal" && d.status === "active",
  );
  assert.ok(deal);
  const action = getDealAction(deal);
  assert.equal(action.ctaIntent, "outbound");
  assert.equal(action.supportsCopy, false);
});

test("parseCategorySlug falls back to 'all' for missing/malformed/unknown values", () => {
  assert.equal(parseCategorySlug(undefined), "all");
  assert.equal(parseCategorySlug(null), "all");
  assert.equal(parseCategorySlug(123), "all");
  assert.equal(parseCategorySlug(""), "all");
  assert.equal(parseCategorySlug("../etc"), "all");
  assert.equal(parseCategorySlug("not-a-real-slug"), "all");
  assert.equal(parseCategorySlug("electronics"), "electronics");
  assert.equal(parseCategorySlug("popular"), "popular");
  assert.equal(parseCategorySlug("all"), "all");
});

test("serializeDealAction never leaks internal identifier fields", () => {
  const expected = [
    "code",
    "ctaHref",
    "ctaIntent",
    "ctaLabel",
    "supportsCopy",
  ].sort();
  for (const deal of PUBLIC_DEALS) {
    const action = serializeDealAction(getDealAction(deal));
    assert.deepEqual(Object.keys(action).slice().sort(), expected);
  }
});

test("copy labels and CTAs do not claim guaranteed outcomes", () => {
  const promises = ["dam bao", "chac chan", "100%", "luon thanh cong"];
  for (const deal of PUBLIC_DEALS) {
    const action = getDealAction(deal);
    const corpus = [
      deal.title,
      deal.description,
      action.ctaLabel,
    ].join(" | ").toLowerCase();
    for (const phrase of promises) {
      assert.ok(!corpus.includes(phrase), `${deal.id} must not contain ${phrase}`);
    }
  }
});

test("voucher and cashback copy strings are kept separate", () => {
  const voucher = PUBLIC_DEALS.find(
    (d) => d.kind === "voucher_code" && d.status === "active",
  );
  const cashback = PUBLIC_DEALS.find(
    (d) => d.kind === "cashback_program",
  );
  assert.ok(voucher);
  assert.ok(cashback);
  assert.ok(!voucher.description.toLowerCase().includes("hoan tien"));
  assert.ok(!cashback.description.toLowerCase().includes("sao chep"));
});
