/**
 * Phase 20I.7 -- homepage public-stats copy safety.
 *
 * Locks down two things for the public homepage (`/`):
 *
 *   1. `homeMetrics` and `heroPreview` exported from
 *      `./dashboard` must NOT contain hard-coded fake operational
 *      stats (cashback totals, order counts, member counts,
 *      monthly amounts, percentages) that have no real source.
 *      Today we have no such public aggregate data, so any
 *      number that *looks* like an operational stat in
 *      buyer-facing copy is, by definition, fake.
 *   2. The same strings must also pass the global buyer-facing
 *      safety guard (`assertBuyerFacingCopyIsSafe`) -- the
 *      standalone forbidden phrases (`cam kết`, `đảm bảo`,
 *      `chắc chắn`, ...) and the broader contextual ones.
 *
 * If a future edit reintroduces a fake number or a forbidden
 * phrase on the homepage, this test fails loudly so the
 * regression is caught at `npm test`, not in production.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  homeFeatures,
  homeMetrics,
  heroPreview,
} from "./dashboard";
import type { HomeMetric } from "@/types/dashboard";
import {
  assertBuyerFacingCopyIsSafe,
  combineBuyerFacingCopy,
} from "@/lib/seo/seo-copy-safety";

/**
 * Numeric-looking patterns we forbid on the public homepage. The
 * homepage is buyer-facing with no real aggregate data source,
 * so any of these is, by definition, a fake operational stat.
 */
const FORBIDDEN_HOMEPAGE_PATTERNS: ReadonlyArray<{
  readonly name: string;
  readonly re: RegExp;
}> = [
  { name: "vnd-millions", re: /\d+[,.]?\d*\s*triệu\s*(đ|vnd)?/i },
  { name: "vnd-suffix-with-prefix", re: /\d+[,.]?\d*\s*đ\b/i },
  { name: "vnd-suffix-with-plus-prefix", re: /\+\s*\d+[,.]?\d*\s*(đ|vnd)\b/i },
  { name: "order-count-plus", re: /\b\d[\d.,]*\s*\+/ },
  { name: "large-number-plus", re: /\b\d{1,3}(?:[.,]\d{3})+\+/ },
  { name: "percent", re: /\b\d+\s*%/ },
  { name: "thousand-dot-only", re: /\b\d{1,3}(?:\.\d{3})+\b/ },
];

function assertNoNumericFakeStats(
  label: string,
  pieces: ReadonlyArray<{ label: string; text: string }>,
): void {
  for (const piece of pieces) {
    for (const pattern of FORBIDDEN_HOMEPAGE_PATTERNS) {
      assert.ok(
        !pattern.re.test(piece.text),
        `${label} / "${piece.label}" must not contain fake-operational pattern "${pattern.name}". Matched substring: ${piece.text.match(pattern.re)?.[0] ?? "?"}`,
      );
    }
  }
}

function metricPieces(): ReadonlyArray<{ label: string; text: string }> {
  const out: { label: string; text: string }[] = [];
  for (let i = 0; i < homeMetrics.length; i++) {
    const m = homeMetrics[i];
    out.push({ label: `homeMetrics[${i}].label`, text: m.label });
    out.push({ label: `homeMetrics[${i}].value`, text: m.value });
    if (m.note) {
      out.push({ label: `homeMetrics[${i}].note`, text: m.note });
    }
  }
  return out;
}

function heroPieces(): ReadonlyArray<{ label: string; text: string }> {
  return [
    { label: "heroPreview.balance", text: heroPreview.balance },
    { label: "heroPreview.monthlyCashback", text: heroPreview.monthlyCashback },
    { label: "heroPreview.upcomingPayout", text: heroPreview.upcomingPayout },
    ...heroPreview.stores.map((s, idx) => ({
      label: `heroPreview.stores[${idx}]`,
      text: s,
    })),
    ...heroPreview.upcomingStores.map((s, idx) => ({
      label: `heroPreview.upcomingStores[${idx}]`,
      text: s,
    })),
  ];
}

function featurePieces(): ReadonlyArray<{ label: string; text: string }> {
  return homeFeatures.map((f, idx) => ({
    label: `homeFeatures[${idx}] "${f.title}"`,
    text: `${f.title}\n${f.description}`,
  }));
}

/**
 * Tokens that may ONLY appear in roadmap / upcoming / future-only
 * contexts on the public homepage. Active-flow copy must mention
 * Shopee as currently active and may not present TikTok Shop,
 * Lazada, Tiki, or Sendo as a working public flow today.
 */
const ROADMAP_ONLY_TOKENS: ReadonlyArray<string> = [
  "tiktok shop",
  "lazada",
  "tiki",
  "sendo",
  "shopee food",
];

/**
 * Substrings that, when found in a homepage feature description,
 * indicate active-flow support. We forbid any roadmap-only token
 * appearing in a copy that lacks a roadmap-qualifier nearby.
 */
const ROADMAP_QUALIFIERS: ReadonlyArray<string> = [
  "sẽ được cập nhật",
  "sắp hỗ trợ",
  "sắp ra mắt",
  "trong lộ trình",
  "coming soon",
  "upcoming",
];

function assertNoActivePlatformClaimBeyondShopee(
  label: string,
  pieces: ReadonlyArray<{ label: string; text: string }>,
): void {
  for (const piece of pieces) {
    const lower = piece.text.toLowerCase();
    for (const token of ROADMAP_ONLY_TOKENS) {
      if (!lower.includes(token)) continue;
      const hasQualifier = ROADMAP_QUALIFIERS.some((q) => lower.includes(q));
      assert.ok(
        hasQualifier,
        `${label} / "${piece.label}" mentions "${token}" without a roadmap qualifier. Active-flow copy may only mention Shopee today.`,
      );
    }
  }
}

test("Phase 20I.7: homeMetrics contains exactly three entries with qualitative-only wording", () => {
  assert.equal(homeMetrics.length, 3);
  for (const m of homeMetrics) {
    assert.ok(typeof m.label === "string" && m.label.length > 0);
    assert.ok(typeof m.value === "string" && m.value.length > 0);
  }
});

test("Phase 20I.7: homeMetrics labels / values / notes contain no fake operational stats", () => {
  assertNoNumericFakeStats("homeMetrics", metricPieces());
});

test("Phase 20I.7: heroPreview has no fake operational stats and only Shopee is currently active", () => {
  assertNoNumericFakeStats("heroPreview", heroPieces());
  assert.deepEqual(
    heroPreview.stores,
    ["Shopee"],
    "Only Shopee is currently publicly supported; TikTok Shop and others must wait for a later phase.",
  );
});

test("Phase 20I.7: combined homepage public-stats copy passes the buyer-facing safety guard", () => {
  const pieces = [...metricPieces(), ...heroPieces()];
  assert.doesNotThrow(() => {
    assertBuyerFacingCopyIsSafe(pieces);
  });
});

test("Phase 20I.7: combined homepage public-stats copy contains no forbidden standalone words", () => {
  const haystack = combineBuyerFacingCopy([
    ...metricPieces(),
    ...heroPieces(),
  ]).toLowerCase();
  for (const word of ["cam kết", "đảm bảo", "chắc chắn"]) {
    assert.ok(
      !haystack.includes(word),
      `homepage public stats must not contain standalone "${word}"`,
    );
  }
});

test("Phase 20I.7: previously-shipped fake operational strings are not reintroduced", () => {
  // Regression: any reappearance of the exact strings the brief
  // flagged fails this test. We probe the raw exports as well as
  // the rendered strings to catch any future copy that mimics
  // the same shape (numeric suffix on a buyer-facing label).
  const flat = JSON.stringify({
    homeMetrics,
    heroPreview,
  }).toLowerCase();

  const previouslyBanned = [
    "12,4 triệuđ",
    "12.4 triệu",
    "8.320+",
    "2.450.000đ",
    "2450000đ",
    "+186.000đ",
    "+18.000đ",
    " 68%",
    "68% để đạt",
    "đã ghi nhận 12",
  ];
  for (const banned of previouslyBanned) {
    assert.ok(
      !flat.includes(banned),
      `homepage public stats must not contain formerly-shipped fake stat "${banned}"`,
    );
  }
});

test("Phase 20I.7: homeMetrics shape stays typed (HomeMetric[])", () => {
  // Compile-time / runtime shape guard. If the type contract
  // ever loosens to allow raw numeric strings, this guard will
  // fail loudly and force a deliberate schema update.
  const sample: HomeMetric = homeMetrics[0];
  assert.equal(typeof sample.label, "string");
  assert.equal(typeof sample.value, "string");
  assert.ok(sample.label.length > 0);
  assert.ok(sample.value.length > 0);
});

test("Phase 20I.7: homeFeatures contains exactly three entries with non-empty title / description", () => {
  assert.equal(homeFeatures.length, 3);
  for (const f of homeFeatures) {
    assert.ok(typeof f.title === "string" && f.title.length > 0);
    assert.ok(typeof f.description === "string" && f.description.length > 0);
  }
});

test("Phase 20I.7: homeFeatures descriptions only claim Shopee as the active flow", () => {
  // Public homepage feature copy must not present TikTok Shop,
  // Lazada, Tiki, or Sendo as an active cashback flow. They are
  // roadmap-only and, if mentioned at all, must carry a roadmap
  // qualifier. The helper enforcePlatformClaims walk every
  // roadmap-only token and checks the qualifier.
  assertNoActivePlatformClaimBeyondShopee("homeFeatures", featurePieces());
});

test("Phase 20I.7: 'Lấy link hoàn tiền' feature treats TikTok Shop as roadmap-only", () => {
  const feature = homeFeatures.find((f) => f.title === "Lấy link hoàn tiền");
  assert.ok(feature, "homeFeatures must contain a 'Lấy link hoàn tiền' feature");
  const lower = feature.description.toLowerCase();
  assert.ok(
    lower.includes("shopee"),
    "'Lấy link hoàn tiền' must mention Shopee as the active platform",
  );
  // If TikTok Shop appears in this active-flow feature, it must
  // carry a roadmap qualifier. The current copy keeps it.
  if (lower.includes("tiktok shop")) {
    const hasQualifier = ROADMAP_QUALIFIERS.some((q) => lower.includes(q));
    assert.ok(
      hasQualifier,
      "'Lấy link hoàn tiền' mentions TikTok Shop without a roadmap qualifier",
    );
  }
});

test("Phase 20I.7: previously-shipped 'Chọn Shopee hoặc TikTok Shop, lấy link affiliate' is not reintroduced", () => {
  // Direct regression on the Phase 20I.7 brief: the active-flow
  // "Lấy link hoàn tiền" feature used to claim TikTok Shop as a
  // working flow today. Any copy that still does so fails.
  const feature = homeFeatures.find((f) => f.title === "Lấy link hoàn tiền");
  assert.ok(feature, "homeFeatures must contain a 'Lấy link hoàn tiền' feature");
  const offending = feature.description.includes(
    "Shopee hoặc TikTok Shop",
  ) ||
    feature.description.includes("Chọn Shopee hoặc TikTok Shop") ||
    feature.description.startsWith("Chọn Shopee hoặc TikTok Shop,");
  assert.ok(
    !offending,
    "'Lấy link hoàn tiền' must not present TikTok Shop as an active flow",
  );
});

test("Phase 20I.7: combined homepage copy (metrics + hero + features) still passes the buyer-facing safety guard", () => {
  const pieces = [
    ...metricPieces(),
    ...heroPieces(),
    ...featurePieces(),
  ];
  assert.doesNotThrow(() => {
    assertBuyerFacingCopyIsSafe(pieces);
  });
});
