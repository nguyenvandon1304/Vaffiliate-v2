/**
 * Phase 20I.7 -- centralised public SEO metadata builder.
 *
 * Many public routes use the same metadata skeleton. To avoid
 * silently drifting the title / description / OG shape across
 * routes, we route every public `Metadata` export through this
 * helper. New fields should be added here, not inline.
 *
 * Copy rules:
 *
 *   - Vietnamese titles and descriptions.
 *   - No keyword stuffing. No "mã giảm giá tốt nhất Việt Nam"
 *     or similar overpromise.
 *   - The site name is always `Vaffiliate`, never bound to a
 *     specific platform brand.
 *
 * The helper sets a `canonical` link derived from the configured
 * site origin so search engines don't index the deal pages
 * twice under query variants.
 */

import type { Metadata } from "next";

import { toAbsolutePublicUrl } from "@/lib/seo/public-site-config";

export type PublicRouteMetadataInput = {
  /** Page title in Vietnamese. DO NOT include the brand suffix here. */
  readonly title: string;
  /** SEO description, plain text. 80-160 chars recommended. */
  readonly description: string;
  /** Canonical path. Defaults to the public route's own URL. */
  readonly canonicalPath: string;
  /**
   * Optional OpenGraph overrides. Defaults derive from
   * title + description.
   */
  readonly og?: {
    readonly title?: string;
    readonly description?: string;
    readonly locale?: string;
    readonly siteName?: string;
  };
  /**
   * Optional Twitter card overrides. Defaults derive from
   * title + description.
   */
  readonly twitter?: {
    readonly title?: string;
    readonly description?: string;
    readonly card?: "summary" | "summary_large_image";
  };
  /**
   * Set to `true` to mark a page as non-indexable. Used only when
   * a real robot noindex is needed (none of the shipped public
   * pages should ever set this; the helper accepts it for
   * future-proofing).
   */
  readonly noIndex?: boolean;
};

const BRAND_NAME = "Vaffiliate";
const DEFAULT_OG_LOCALE = "vi_VN";
const DEFAULT_OG_SITE_NAME = "Vaffiliate";
const DEFAULT_TWITTER_CARD = "summary" as const;

export function buildPublicRouteMetadata(
  input: PublicRouteMetadataInput,
): Metadata {
  const titleWithBrand = `${input.title} | ${BRAND_NAME}`;
  const ogTitle = input.og?.title ?? input.title;
  const ogDescription = input.og?.description ?? input.description;
  const twitterTitle = input.twitter?.title ?? input.title;
  const twitterDescription = input.twitter?.description ?? input.description;
  const twitterCard = input.twitter?.card ?? DEFAULT_TWITTER_CARD;

  const metadata: Metadata = {
    title: titleWithBrand,
    description: input.description,
    alternates: {
      canonical: toAbsolutePublicUrl(input.canonicalPath),
    },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: "website",
      locale: input.og?.locale ?? DEFAULT_OG_LOCALE,
      siteName: input.og?.siteName ?? DEFAULT_OG_SITE_NAME,
      url: toAbsolutePublicUrl(input.canonicalPath),
    },
    twitter: {
      card: twitterCard,
      title: twitterTitle,
      description: twitterDescription,
    },
    robots: input.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };

  return metadata;
}

export const SEO_BRAND_NAME = BRAND_NAME;
