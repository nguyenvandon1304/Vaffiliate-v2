/**
 * Phase 20I.7 -- copy safety tests for the public SEO surface.
 *
 * These tests lock down two things:
 *
 *   1. The shared `assertBuyerFacingCopyIsSafe` helper rejects
 *      every forbidden token / phrase the brief lists.
 *   2. The actual coupon-guide / FAQ copy we ship on the public
 *      marketing surface is safe. If a future edit accidentally
 *      introduces "cam kết hoàn tiền" or any of the broader
 *      forbidden phrases, this test must fail loudly.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  COUPON_GUIDE_FAQS,
  COUPON_GUIDE_SECTIONS,
} from "./coupon-guide-content";
import {
  assertBuyerFacingCopyIsSafe,
  combineBuyerFacingCopy,
  SEO_COPY_GUARD,
} from "./seo-copy-safety";

function serialiseCouponGuide(): {
  readonly pieces: ReadonlyArray<{
    readonly label: string;
    readonly text: string;
  }>;
} {
  return {
    pieces: [
      { label: "coupon-guide-heading", text: COUPON_GUIDE_SECTIONS.map(s => s.heading).join("\n") },
      ...COUPON_GUIDE_SECTIONS.flatMap((s, idx) => [
        {
          label: `coupon-guide-section-${idx}-paragraphs`,
          text: s.paragraphs.join("\n"),
        },
        {
          label: `coupon-guide-section-${idx}-bullets`,
          text: (s.bullets ?? []).join("\n"),
        },
      ]),
      ...COUPON_GUIDE_FAQS.map((f, idx) => ({
        label: `coupon-guide-faq-${idx}`,
        text: `${f.question}\n${f.answer}`,
      })),
    ],
  };
}

test("Phase 20I.7: assertBuyerFacingCopyIsSafe accepts the actual coupon guide copy", () => {
  const { pieces } = serialiseCouponGuide();
  assert.doesNotThrow(() => {
    assertBuyerFacingCopyIsSafe(pieces);
  });
});

test("Phase 20I.7: every coupon guide section mentions at least one paragraph", () => {
  for (const section of COUPON_GUIDE_SECTIONS) {
    assert.ok(section.heading.length > 0, "heading must not be empty");
    assert.ok(
      section.paragraphs.length >= 1,
      "every section must have at least one paragraph",
    );
  }
});

test("Phase 20I.7: every coupon guide FAQ has a question and an answer", () => {
  for (const faq of COUPON_GUIDE_FAQS) {
    assert.ok(faq.question.length > 0, "question must not be empty");
    assert.ok(faq.answer.length > 0, "answer must not be empty");
  }
});

test("Phase 20I.7: 'Vaffiliate không phải Shopee' appears in the guide", () => {
  const haystack = combineBuyerFacingCopy(serialiseCouponGuide().pieces).toLowerCase();
  assert.ok(
    haystack.includes("vaffiliate không phải shopee"),
    "guide must contain the 'Vaffiliate không phải Shopee' disclaimer",
  );
});

test("Phase 20I.7: coupon guide distinguishes estimated vs confirmed cashback", () => {
  const haystack = combineBuyerFacingCopy(serialiseCouponGuide().pieces).toLowerCase();
  assert.match(
    haystack,
    /hoàn tiền dự kiến|ước tính/i,
    "must mention estimated / ước tính cashback",
  );
  assert.match(
    haystack,
    /đối soát|sau khi.*đối soát|xác nhận/i,
    "must mention reconciliation / confirmation",
  );
});

test("Phase 20I.7: forbidden standalone phrases are rejected by the safety helper", () => {
  const phrases = [
    "cam kết hoàn tiền",
    "đảm bảo được duyệt",
    "chắc chắn có hoàn tiền",
    "100% được duyệt",
    "mua là có hoàn tiền",
    "google sẽ đề xuất",
    "lên top google",
  ];
  for (const phrase of phrases) {
    const wrapped = `Đoạn copy có chứa ${phrase} trong nội dung.`;
    assert.throws(
      () =>
        assertBuyerFacingCopyIsSafe([
          { label: "test", text: wrapped },
        ]),
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `phrase "${phrase}" must be rejected`,
    );
  }
});

test("Phase 20I.7: forbidden internal tokens are rejected by the safety helper", () => {
  const tokens = [
    "networkSubId",
    "trackingLinkId",
    "publisherId",
    "shortCode",
    "clickId",
    "an_redir",
    "vaflnk",
  ];
  for (const token of tokens) {
    const wrapped = `Ref exposed token ${token} in copy`;
    assert.throws(
      () =>
        assertBuyerFacingCopyIsSafe([
          { label: "test", text: wrapped },
        ]),
      new RegExp(token, "i"),
      `token "${token}" must be rejected`,
    );
  }
});

test("Phase 20I.7: SEO_COPY_GUARD exposes both lists and they are non-empty", () => {
  assert.ok(SEO_COPY_GUARD.phrases.length > 0);
  assert.ok(SEO_COPY_GUARD.tokens.length > 0);
});

test("Phase 20I.7: safety helper is case-insensitive", () => {
  assert.throws(
    () =>
      assertBuyerFacingCopyIsSafe([
        { label: "upper", text: "CAM KẾT hoàn tiền" },
      ]),
    /cam kết/i,
  );
});

test("Phase 20I.7: standalone forbidden words are rejected on their own", () => {
  const standalone = ["cam kết", "đảm bảo", "chắc chắn"];
  for (const word of standalone) {
    assert.throws(
      () =>
        assertBuyerFacingCopyIsSafe([
          { label: "test", text: `đoạn copy có chứa từ ${word}.` },
        ]),
      new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `standalone word "${word}" must be rejected`,
    );
  }
});

test("Phase 20I.7: standalone forbidden words are rejected even in a negative / clarifying sentence", () => {
  // The brief is explicit: even a clarifying sentence such as
  // "Vaffiliate không thể đảm bảo ..." still violates the
  // overpromise rule because the standalone word is on the
  // banned list.
  const negativeSentences = [
    "Vaffiliate không thể đảm bảo mọi voucher đều áp dụng được.",
    "Chúng tôi không cam kết số tiền hoàn tiền cuối cùng.",
    "Không có gì là chắc chắn ở bước này.",
  ];
  for (const text of negativeSentences) {
    assert.throws(
      () =>
        assertBuyerFacingCopyIsSafe([
          { label: "test", text },
        ]),
      /cam kết|đảm bảo|chắc chắn/i,
      `negative sentence "${text}" must still be rejected`,
    );
  }
});

test("Phase 20I.7: COUPON_GUIDE_SECTIONS no longer contains forbidden standalone words", () => {
  const haystack = JSON.stringify(COUPON_GUIDE_SECTIONS).toLowerCase();
  for (const word of ["cam kết", "đảm bảo", "chắc chắn"]) {
    assert.ok(
      !haystack.includes(word),
      `COUPON_GUIDE_SECTIONS must not contain "${word}"`,
    );
  }
});

test("Phase 20I.7: COUPON_GUIDE_FAQS no longer contains forbidden standalone words", () => {
  const haystack = JSON.stringify(COUPON_GUIDE_FAQS).toLowerCase();
  for (const word of ["cam kết", "đảm bảo", "chắc chắn"]) {
    assert.ok(
      !haystack.includes(word),
      `COUPON_GUIDE_FAQS must not contain "${word}"`,
    );
  }
});
