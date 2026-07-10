/**
 * Phase 20I.7 -- JSON-LD structured-data helpers for the public
 * marketing surface.
 *
 * All helpers in this module return a serialised `<script
 * type="application/ld+json">` payload via the `JsonLdScript`
 * React component. The helpers themselves are pure functions so
 * they can be called from any server component and unit tested
 * without rendering React.
 *
 * Only three structured-data shapes ship in this phase because
 * they are the ones we can defensibly derive from data the
 * project actually owns:
 *
 *   - `WebSite` + `Organization` for the homepage. They use the
 *     configured site origin and never fabricate ratings.
 *   - `BreadcrumbList` for `/ma-giam-gia` and
 *     `/ma-giam-gia/[platform]`. They reflect the buyer's
 *     position in the navigation hierarchy.
 *   - `FAQPage` for the public coupon guide. The FAQ items
 *     mirror the visible copy of `/ma-giam-gia` /
 *     `/ma-giam-gia/[platform]` -- we never publish FAQ JSON-LD
 *     for questions the buyer cannot see on the same page.
 *
 * Explicit non-goals:
 *
 *   - No fake `AggregateRating` / `Review` payloads.
 *   - No fake `Offer` / `Product` blocks carrying a price,
 *     availability, or validity date we don't actually own.
 *   - No `ratingValue`, `reviewCount`, `price`, `priceCurrency`,
 *     `availability`, or `validThrough` fields are emitted.
 *
 * Every helper renders server-side via `JsonLdScript` so the
 * JSON-LD is in the initial HTML response and visible to
 * crawlers that don't run JavaScript.
 */

import type { ReactElement } from "react";

import {
  getPublicSiteBaseUrl,
  toAbsolutePublicUrl,
} from "@/lib/seo/public-site-config";
import type { GuideFaqItem } from "@/lib/seo/coupon-guide-content";

// JSON-LD payload types. We intentionally keep the surface
// narrow so the helper module compiles without pulling a heavy
// schema library.
export type JsonLdObject = Readonly<Record<string, unknown>>;

export type WebSitePayload = {
  readonly name: string;
  readonly alternateName?: string;
  readonly url: string;
  readonly inLanguage: string;
  readonly description: string;
};

export type OrganizationPayload = {
  readonly name: string;
  readonly url: string;
  readonly logo?: string;
};

export type BreadcrumbItem = {
  readonly name: string;
  readonly item: string;
};

export type BreadcrumbPayload = {
  readonly itemListElement: ReadonlyArray<BreadcrumbItem>;
};

export type FaqPayload = {
  readonly mainEntity: ReadonlyArray<{
    readonly "@type": "Question";
    readonly name: string;
    readonly acceptedAnswer: {
      readonly "@type": "Answer";
      readonly text: string;
    };
  }>;
};

/**
 * Default site identity used by the homepage WebSite /
 * Organization payloads. Both descriptions are kept short so
 * they never compete with the visible H1 / lead paragraph.
 */
const SITE_NAME = "Vaffiliate";
const SITE_ALTERNATE_NAME = "Vaffiliate Vietnam";
const SITE_LANGUAGE = "vi-VN";
const SITE_DESCRIPTION =
  "Tổng hợp mã giảm giá, deal và hoàn tiền Shopee trên Vaffiliate.";

export function buildWebSiteJsonLd(): JsonLdObject {
  const payload: WebSitePayload = {
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: `${getPublicSiteBaseUrl()}/`,
    inLanguage: SITE_LANGUAGE,
    description: SITE_DESCRIPTION,
  };
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    ...payload,
  };
}

export function buildOrganizationJsonLd(): JsonLdObject {
  const url = `${getPublicSiteBaseUrl()}/`;
  const payload: OrganizationPayload = {
    name: SITE_NAME,
    url,
  };
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    ...payload,
  };
}

/**
 * Build the BreadcrumbList for a public route. Always includes
 * the homepage as the first item.
 *
 * Item URLs are normalised through `toAbsolutePublicUrl()` so
 * callers can pass either a relative path (`"/"`, `"/ma-giam-gia"`)
 * or an absolute URL (`"https://example.com/foo"`). The
 * JSON-LD payload is shipped to crawlers; relative `item` values
 * are an undocumented and ambiguous shape (some crawlers treat
 * them as relative to the sitemap URL, others to the page URL).
 * Forcing absolute URLs makes the payload deterministic.
 */
export function buildBreadcrumbJsonLd(
  crumbs: ReadonlyArray<BreadcrumbItem>,
): JsonLdObject {
  if (crumbs.length === 0) {
    throw new Error(
      "buildBreadcrumbJsonLd requires at least one breadcrumb",
    );
  }
  const itemListElement = crumbs.map((c, idx) => ({
    "@type": "ListItem",
    position: idx + 1,
    name: c.name,
    item: toAbsolutePublicUrl(c.item),
  }));
  const payload: BreadcrumbPayload = { itemListElement };
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    ...payload,
  };
}

/**
 * Standard breadcrumbs for `/ma-giam-gia`.
 */
export function buildDealsBreadcrumbJsonLd(): JsonLdObject {
  return buildBreadcrumbJsonLd([
    { name: "Trang chủ", item: toAbsolutePublicUrl("/") },
    {
      name: "Mã giảm giá & ưu đãi",
      item: toAbsolutePublicUrl("/ma-giam-gia"),
    },
  ]);
}

/**
 * Standard breadcrumbs for `/ma-giam-gia/[platform]`.
 *
 * The route path (`platformPath`) MUST be passed explicitly by
 * the caller -- the helper no longer derives it from
 * `platformDisplayName` because human display labels can contain
 * spaces, diacritics, or suffixes that would produce malformed
 * URL paths. Callers should pass the typed `DealPlatform` slug
 * (e.g. `"/ma-giam-gia/shopee"`) so the JSON-LD item URL is
 * always a canonical, safe path.
 */
export function buildPlatformBreadcrumbJsonLd(args: {
  readonly platformDisplayName: string;
  readonly platformPath: string;
}): JsonLdObject {
  return buildBreadcrumbJsonLd([
    { name: "Trang chủ", item: toAbsolutePublicUrl("/") },
    {
      name: "Mã giảm giá & ưu đãi",
      item: toAbsolutePublicUrl("/ma-giam-gia"),
    },
    {
      name: args.platformDisplayName,
      item: toAbsolutePublicUrl(args.platformPath),
    },
  ]);
}

/**
 * Build the FAQ JSON-LD payload. The FAQs MUST be visible on the
 * same page -- callers should pass the same array they render in
 * the React tree, never an extended one.
 */
export function buildFaqJsonLd(
  faqs: ReadonlyArray<GuideFaqItem>,
): JsonLdObject {
  if (faqs.length === 0) {
    throw new Error(
      "buildFaqJsonLd requires at least one FAQ item",
    );
  }
  const mainEntity = faqs.map((faq) => ({
    "@type": "Question" as const,
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer" as const,
      text: faq.answer,
    },
  }));
  const payload: FaqPayload = { mainEntity };
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    ...payload,
  };
}

/**
 * Render one or more JSON-LD payloads as server-side `<script
 * type="application/ld+json">` blocks. The component intentionally
 * serialises with `JSON.stringify` (no whitespace) so the payload
 * is deterministic and small.
 *
 * Callers place this near the top of a public page so the JSON-LD
 * appears in the headless HTML even before hydration.
 */
export function JsonLdScript({
  payloads,
}: {
  readonly payloads: ReadonlyArray<JsonLdObject>;
}): ReactElement {
  return (
    <>
      {payloads.map((payload, idx) => (
        <script
          key={`jsonld-${idx}`}
          type="application/ld+json"
          // The payload is already a plain JSON-compatible object
          // so a direct stringify is safe. We disable Next's
          // HTML escaping because `<script type="application/
          // ld+json">` is the precise JSON-LD convention.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(payload),
          }}
        />
      ))}
    </>
  );
}
