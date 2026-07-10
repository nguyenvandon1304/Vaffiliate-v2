/**
 * Phase 20I.7 -- `robots.txt` for the Vaffiliate public web.
 *
 * Contract:
 *
 *   - The user-agent rule allows everything by default so the
 *     crawl surface matches what `sitemap.ts` advertises.
 *   - The disallow list mirrors the route classification: every
 *     path prefix that requires authentication (or is a private
 *     tracking redirect) MUST be excluded. The list lives in
 *     `src/lib/seo/public-routes.ts` and is the same data the
 *     sitemap depends on.
 *   - The sitemap URL is absolute, derived from the
 *     `NEXT_PUBLIC_SITE_URL` env (with localhost dev fallback),
 *     so crawlers always resolve the right origin.
 *
 * Why two equal segments (Googlebot + Bingbot) in the same
 * rule:
 *
 *   - Google's documentation recommends the simpler single-rule
 *     form first when the policy is identical for all major
 *     crawlers. We use the array form so adding engine-specific
 *     rules later is a one-line change without restructuring.
 */

import type { MetadataRoute } from "next";

import { getPublicSiteBaseUrl } from "@/lib/seo/public-site-config";
import { ROBOTS_DISALLOW_PREFIXES } from "@/lib/seo/public-routes";

export default function robots(): MetadataRoute.Robots {
  const sitemapUrl = `${getPublicSiteBaseUrl()}/sitemap.xml`;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...ROBOTS_DISALLOW_PREFIXES],
      },
    ],
    sitemap: sitemapUrl,
    host: getPublicSiteBaseUrl(),
  };
}
