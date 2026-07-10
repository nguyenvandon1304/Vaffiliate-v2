/**
 * Phase 20I.6 -- copy safety + coverage tests for the policy
 * content module.
 *
 * Pure data tests. No React, no Supabase, no I/O. Every policy
 * page shipped from this phase MUST:
 *
 *   - render a `lead`, at least one section, and the foundation
 *     note;
 *   - NOT contain any forbidden internal token (raw tracking
 *     link id, click id, network sub id, Addlivetag account id,
 *     publisher id, secrets);
 *   - NOT contain any forbidden overpromise phrase ("cam kết
 *     hoàn tiền", "chắc chắn có hoàn tiền", etc.);
 *   - link to the other policy pages through `relatedLinks`.
 *
 * If any of these invariants breaks, the page must be considered
 * unsafe to ship to production / to the future store submission.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  assertPolicyCopyIsSafe,
  CASHBACK_TERMS_POLICY,
  DATA_DELETION_POLICY,
  PRIVACY_POLICY,
  TERMS_POLICY,
  POLICY_PAGES,
} from "./policy-content";

const ALL_POLICIES = [
  PRIVACY_POLICY,
  TERMS_POLICY,
  CASHBACK_TERMS_POLICY,
  DATA_DELETION_POLICY,
];

test("Phase 20I.6: every policy page has a slug, title, lead and foundation note", () => {
  for (const page of ALL_POLICIES) {
    assert.ok(page.slug.length > 0, "slug must not be empty");
    assert.ok(page.title.length > 0, "title must not be empty");
    assert.ok(page.lead.length > 0, "lead must not be empty");
    assert.ok(
      page.foundationNote.length > 0,
      "foundation note must not be empty",
    );
    assert.ok(
      page.sections.length >= 1,
      "every policy must have at least one section",
    );
  }
});

test("Phase 20I.6: every policy page lists at least one related link", () => {
  for (const page of ALL_POLICIES) {
    assert.ok(
      page.relatedLinks.length >= 1,
      `policy ${page.slug} must link to related pages`,
    );
  }
});

test("Phase 20I.6: every related link points to a known policy page", () => {
  for (const page of ALL_POLICIES) {
    for (const link of page.relatedLinks) {
      assert.ok(
        link.href.startsWith("/"),
        `link href must be internal, got ${link.href}`,
      );
      assert.ok(
        POLICY_PAGES[link.href] !== undefined ||
          // /privacy is the privacy page; other internal hrefs in
          // policy content are limited to the four policy paths.
          ["/privacy", "/terms", "/cashback-terms", "/data-deletion"].includes(
            link.href,
          ),
        `related link ${link.href} must be one of the policy paths`,
      );
    }
  }
});

test("Phase 20I.6: policy pages do not leak internal tokens or overpromise", () => {
  for (const page of ALL_POLICIES) {
    assert.doesNotThrow(
      () => assertPolicyCopyIsSafe(page),
      `policy ${page.slug} failed copy safety`,
    );
  }
});

test("Phase 20I.6: cashback-terms distinguishes estimated vs confirmed cashback", () => {
  // The brief explicitly forbids overpromise wording ("cam kết",
  // "đảm bảo", "chắc chắn"). The cashback-terms page must
  // call out the difference between dự kiến / đã xác nhận /
  // có thể rút, and use safe wording (no "cam kết" / "đảm bảo"
  // / "chắc chắn" in buyer-facing copy).
  const text = JSON.stringify(CASHBACK_TERMS_POLICY).toLowerCase();
  assert.match(text, /hoàn tiền dự kiến/i, "must mention estimated state");
  assert.match(
    text,
    /hoàn tiền đã xác nhận/i,
    "must mention confirmed state",
  );
  assert.match(text, /hoàn tiền có thể rút/i, "must mention payable state");
  // Safe replacement for "không cam kết": the new wording uses
  // "không xem mọi đơn hàng là đủ điều kiện" which still
  // explicitly denies overpromise without using the banned
  // "cam kết" / "đảm bảo" / "chắc chắn" phrasing.
  assert.match(
    text,
    /không xem mọi đơn hàng là đủ điều kiện/i,
    "must explicitly deny overpromise using safe wording",
  );
  // The old "cam kết" phrasing must not reappear.
  assert.doesNotMatch(
    text,
    /cam kết/i,
    "buyer-facing copy must not use 'cam kết'",
  );
  assert.doesNotMatch(
    text,
    /đảm bảo/i,
    "buyer-facing copy must not use 'đảm bảo'",
  );
  assert.doesNotMatch(
    text,
    /chắc chắn/i,
    "buyer-facing copy must not use 'chắc chắn'",
  );
});

test("Phase 20I.6: data-deletion page explains retention honestly", () => {
  const text = JSON.stringify(DATA_DELETION_POLICY);
  // The wording the brief allows explicitly.
  assert.match(
    text,
    /một số dữ liệu có thể cần được lưu giữ/i,
    "must mention retention honestly",
  );
  // The wording the brief forbids.
  assert.doesNotMatch(
    text.toLowerCase(),
    /xóa ngay toàn bộ dữ liệu/,
    "must not promise immediate total deletion",
  );
});

test("Phase 20I.6: privacy policy lists at least 6 data categories", () => {
  // Brief explicitly enumerates: account, auth/session, order
  // evidence, click/tracking evidence, transaction/withdrawal
  // future, support/admin/audit, technical logs, third-party.
  const text = JSON.stringify(PRIVACY_POLICY).toLowerCase();
  const expectedSubstrings = [
    "dữ liệu tài khoản",
    "xác thực và phiên",
    "đơn hàng và bằng chứng",
    "bấm chuột",
    "giao dịch và rút tiền",
    "hỗ trợ, quản trị và kiểm toán",
    "dữ liệu kỹ thuật",
    "dữ liệu nhận từ đối tác",
  ];
  for (const expected of expectedSubstrings) {
    assert.ok(
      text.includes(expected),
      `privacy policy must mention ${expected}`,
    );
  }
});

test("Phase 20I.6: privacy policy explicitly disclaims advertising data sale", () => {
  const text = JSON.stringify(PRIVACY_POLICY).toLowerCase();
  assert.match(
    text,
    /không bán dữ liệu cá nhân/,
    "must say Vaffiliate does not sell personal data",
  );
});

test("Phase 20I.6: every policy page renders a foundation / 'bản nền' note", () => {
  for (const page of ALL_POLICIES) {
    assert.match(
      page.foundationNote.toLowerCase(),
      /bản nền/,
      `policy ${page.slug} must declare itself as foundation copy`,
    );
    assert.match(
      page.foundationNote.toLowerCase(),
      /cố vấn pháp lý|counsel/i,
      `policy ${page.slug} must mention legal review`,
    );
  }
});
