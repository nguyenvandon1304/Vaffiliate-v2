/**
 * Phase 20I.7 -- invariants for the public route metadata
 * builder.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildPublicRouteMetadata } from "./public-route-metadata";

function setSiteUrl(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = value;
  }
}

test("Phase 20I.7: buildPublicRouteMetadata concatenates the brand name", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const m = buildPublicRouteMetadata({
    title: "Mã giảm giá & ưu đãi",
    description: "Tổng hợp mã giảm giá và ưu đãi Shopee.",
    canonicalPath: "/ma-giam-gia",
  });
  assert.equal(m.title, "Mã giảm giá & ưu đãi | Vaffiliate");
  assert.equal(m.description, "Tổng hợp mã giảm giá và ưu đãi Shopee.");
});

test("Phase 20I.7: buildPublicRouteMetadata sets an absolute canonical", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const m = buildPublicRouteMetadata({
    title: "Quyền riêng tư",
    description: "Chính sách quyền riêng tư.",
    canonicalPath: "/privacy",
  });
  const alt = m.alternates as { canonical?: string };
  assert.equal(alt.canonical, "https://vaffiliate.example.com/privacy");
});

test("Phase 20I.7: buildPublicRouteMetadata includes OpenGraph fields with Vietnamese locale", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const m = buildPublicRouteMetadata({
    title: "Hoàn tiền Shopee",
    description: "Ước tính hoàn tiền khi mua sắm Shopee.",
    canonicalPath: "/cashback",
  });
  const og = m.openGraph as {
    type?: string;
    locale?: string;
    siteName?: string;
  };
  assert.equal(og.type, "website");
  assert.equal(og.locale, "vi_VN");
  assert.equal(og.siteName, "Vaffiliate");
});

test("Phase 20I.7: buildPublicRouteMetadata sets Twitter card defaults", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const m = buildPublicRouteMetadata({
    title: "Xóa dữ liệu",
    description: "Yêu cầu xóa tài khoản.",
    canonicalPath: "/data-deletion",
  });
  const tw = m.twitter as { card?: string };
  assert.equal(tw.card, "summary");
});

test("Phase 20I.7: buildPublicRouteMetadata robot directives are index,follow by default", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const m = buildPublicRouteMetadata({
    title: "Điều khoản",
    description: "Điều khoản dịch vụ.",
    canonicalPath: "/terms",
  });
  const r = m.robots as { index?: boolean; follow?: boolean };
  assert.equal(r.index, true);
  assert.equal(r.follow, true);
});

test("Phase 20I.7: noIndex flag flips robot directives to noindex,nofollow", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const m = buildPublicRouteMetadata({
    title: "Diagnostic",
    description: "internal diagnostic",
    canonicalPath: "/diagnostic",
    noIndex: true,
  });
  const r = m.robots as { index?: boolean; follow?: boolean };
  assert.equal(r.index, false);
  assert.equal(r.follow, false);
});

test("Phase 20I.7: buildPublicRouteMetadata OG url mirrors the canonical", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const m = buildPublicRouteMetadata({
    title: "Shopee",
    description: "Mã giảm giá Shopee.",
    canonicalPath: "/ma-giam-gia/shopee",
  });
  const og = m.openGraph as { url?: string };
  assert.equal(
    og.url,
    "https://vaffiliate.example.com/ma-giam-gia/shopee",
  );
});
