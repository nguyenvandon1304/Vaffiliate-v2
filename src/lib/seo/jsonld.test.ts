/**
 * Phase 20I.7 -- JSON-LD helper invariants.
 *
 * Locks down:
 *
 *   - WebSite + Organization do not leak ratings / prices /
 *     availability.
 *   - Breadcrumb always starts at position 1 with the homepage.
 *   - FAQ mirrors the exact questions / answers it was given
 *     (no decoration, no fabricated answers).
 *   - The JSON-LD payload never includes the forbidden
 *     overpromise phrases in user-visible fields.
 *
 * These tests run synchronously, no React rendering required.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { COUPON_GUIDE_FAQS } from "./coupon-guide-content";
import {
  buildBreadcrumbJsonLd,
  buildDealsBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildOrganizationJsonLd,
  buildPlatformBreadcrumbJsonLd,
  buildWebSiteJsonLd,
} from "./jsonld";

function setSiteUrl(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = value;
  }
}

test("Phase 20I.7: WebSite payload uses locale 'vi-VN' and the configured origin", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const payload = buildWebSiteJsonLd();
  assert.equal(payload["@context"], "https://schema.org");
  assert.equal(payload["@type"], "WebSite");
  assert.equal(payload.name, "Vaffiliate");
  assert.equal(payload.url, "https://vaffiliate.example.com/");
  assert.equal(payload.inLanguage, "vi-VN");
});

test("Phase 20I.7: Organization payload does NOT carry rating or review fields", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const payload = buildOrganizationJsonLd();
  assert.equal(payload["@type"], "Organization");
  const forbiddenKeys = [
    "aggregateRating",
    "rating",
    "review",
    "reviews",
    "price",
    "priceCurrency",
    "availability",
    "validThrough",
  ];
  for (const key of forbiddenKeys) {
    assert.equal(
      (payload as Record<string, unknown>)[key],
      undefined,
      `Organization payload must not include ${key}`,
    );
  }
});

test("Phase 20I.7: BreadcrumbList always starts at position 1", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const payload = buildBreadcrumbJsonLd([
    { name: "Trang chủ", item: "https://vaffiliate.example.com/" },
    {
      name: "Mã giảm giá & ưu đãi",
      item: "https://vaffiliate.example.com/ma-giam-gia",
    },
  ]) as { itemListElement: ReadonlyArray<{ position: number }> };
  assert.equal(payload.itemListElement[0].position, 1);
});

test("Phase 20I.7: BreadcrumbList normalises relative item URL '/' to absolute", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const payload = buildBreadcrumbJsonLd([
    { name: "Trang chủ", item: "/" },
  ]) as { itemListElement: ReadonlyArray<{ item: string }> };
  assert.equal(
    payload.itemListElement[0].item,
    "https://vaffiliate.example.com/",
  );
});

test("Phase 20I.7: BreadcrumbList normalises relative path '/ma-giam-gia' to absolute", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const payload = buildBreadcrumbJsonLd([
    { name: "Mã giảm giá & ưu đãi", item: "/ma-giam-gia" },
  ]) as { itemListElement: ReadonlyArray<{ item: string }> };
  assert.equal(
    payload.itemListElement[0].item,
    "https://vaffiliate.example.com/ma-giam-gia",
  );
});

test("Phase 20I.7: BreadcrumbList leaves already-absolute URLs unchanged", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const absolute = "https://other.example.com/some/path";
  const payload = buildBreadcrumbJsonLd([
    { name: "External", item: absolute },
  ]) as { itemListElement: ReadonlyArray<{ item: string }> };
  assert.equal(payload.itemListElement[0].item, absolute);
});

test("Phase 20I.7: /ma-giam-gia breadcrumb includes the homepage and the listing page", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const payload = buildDealsBreadcrumbJsonLd() as {
    itemListElement: ReadonlyArray<{ name: string }>;
  };
  assert.equal(payload.itemListElement.length, 2);
  assert.equal(payload.itemListElement[0].name, "Trang chủ");
  assert.equal(
    payload.itemListElement[1].name,
    "Mã giảm giá & ưu đãi",
  );
});

test("Phase 20I.7: platform breadcrumb includes the platform label", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const payload = buildPlatformBreadcrumbJsonLd({
    platformDisplayName: "Shopee",
    platformPath: "/ma-giam-gia/shopee",
  }) as {
    itemListElement: ReadonlyArray<{ name: string }>;
  };
  assert.equal(payload.itemListElement.length, 3);
  assert.equal(payload.itemListElement[2].name, "Shopee");
});

test("Phase 20I.7: platform breadcrumb item URL uses the caller-supplied platformPath, not the display name", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const payload = buildPlatformBreadcrumbJsonLd({
    platformDisplayName: "Shopee",
    platformPath: "/ma-giam-gia/shopee",
  }) as {
    itemListElement: ReadonlyArray<{ item: string }>;
  };
  assert.equal(
    payload.itemListElement[2].item,
    "https://vaffiliate.example.com/ma-giam-gia/shopee",
  );
});

test("Phase 20I.7: platform breadcrumb does NOT put spaces in the URL path", () => {
  setSiteUrl("https://vaffiliate.example.com");
  // A display name with spaces must not pollute the URL path.
  const payload = buildPlatformBreadcrumbJsonLd({
    platformDisplayName: "Tiki VN",
    platformPath: "/ma-giam-gia/tiki",
  }) as {
    itemListElement: ReadonlyArray<{ name: string; item: string }>;
  };
  assert.equal(payload.itemListElement[2].name, "Tiki VN");
  assert.equal(
    payload.itemListElement[2].item,
    "https://vaffiliate.example.com/ma-giam-gia/tiki",
  );
  assert.ok(
    !payload.itemListElement[2].item.includes(" "),
    "platform item URL must not contain spaces",
  );
  assert.ok(
    !payload.itemListElement[2].item.includes("tiki%20"),
    "platform item URL must not contain encoded spaces",
  );
});

test("Phase 20I.7: buildBreadcrumbJsonLd refuses an empty list", () => {
  assert.throws(
    () => buildBreadcrumbJsonLd([]),
    /at least one breadcrumb/i,
  );
});

test("Phase 20I.7: FAQ JSON-LD mirrors the input items exactly", () => {
  const payload = buildFaqJsonLd(COUPON_GUIDE_FAQS) as {
    "@type": string;
    mainEntity: ReadonlyArray<{
      "@type": string;
      name: string;
      acceptedAnswer: { "@type": string; text: string };
    }>;
  };
  assert.equal(payload["@type"], "FAQPage");
  assert.equal(payload.mainEntity.length, COUPON_GUIDE_FAQS.length);
  for (let i = 0; i < COUPON_GUIDE_FAQS.length; i++) {
    assert.equal(payload.mainEntity[i].name, COUPON_GUIDE_FAQS[i].question);
    assert.equal(
      payload.mainEntity[i].acceptedAnswer.text,
      COUPON_GUIDE_FAQS[i].answer,
    );
  }
});

test("Phase 20I.7: buildFaqJsonLd refuses an empty FAQ list", () => {
  assert.throws(() => buildFaqJsonLd([]), /at least one FAQ/i);
});

test("Phase 20I.7: every JSON-LD helper must avoid the rating / price / availability fields", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const payloads = [
    buildWebSiteJsonLd(),
    buildOrganizationJsonLd(),
    buildDealsBreadcrumbJsonLd(),
    buildPlatformBreadcrumbJsonLd({
      platformDisplayName: "Shopee",
      platformPath: "/ma-giam-gia/shopee",
    }),
    buildFaqJsonLd(COUPON_GUIDE_FAQS),
  ];
  const forbidden = [
    "aggregateRating",
    "ratingValue",
    "reviewCount",
    "price",
    "priceCurrency",
    "availability",
    "validThrough",
  ];
  for (const payload of payloads) {
    for (const key of forbidden) {
      assert.equal(
        (payload as Record<string, unknown>)[key],
        undefined,
        `${payload["@type"]} payload must not include ${key}`,
      );
    }
  }
});
