/**
 * Phase 20I.7 -- Next.js metadata sitemap for the public SEO
 * surface.
 *
 * The sitemap advertises ONLY the routes a buyer can land on
 * without authentication. The list of public SEO paths lives in
 * `src/lib/seo/public-routes.ts` so this file stays a thin
 * metadata adapter: any change to which paths are public is
 * reflected in the sitemap on the next render.
 *
 * Why server-rendered:
 *
 *   - Next 16 documents `sitemap.ts` as a `MetadataRoute.Sitemap`
 *     handler. It runs at request / build time and serialises
 *     to XML.
 *   - We deliberately avoid `cookies()`, `headers()`, or any
 *     dynamic request reading so the sitemap stays cacheable
 *     and safe to fetch as anonymous traffic.
 *
 * Hard guards:
 *
 *   - We re-validate every advertised path against the route
 *     classifier (`assertSeoPathIsPublic`). A misconfiguration
 *     that points the sitemap at `/app` or `/app/admin` throws
 *     instead of leaking.
 *   - `lastModified` is the static build timestamp derived from
 *     `process.env.NEXT_BUILD_TIME` when available, otherwise
 *     the start of the request. We do not include per-page
 *     timestamps from the database because the public seed is
 *     static.
 */

import type { MetadataRoute } from "next";

import {
  getPublicSiteBaseUrl,
  toAbsolutePublicUrl,
} from "@/lib/seo/public-site-config";
import {
  PUBLIC_SEO_PATHS,
  assertSeoPathIsPublic,
} from "@/lib/seo/public-routes";

function resolveLastModified(): Date {
  const envTime = process.env.NEXT_BUILD_TIME;
  if (typeof envTime === "string" && envTime.length > 0) {
    const parsed = new Date(envTime);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Defence in depth: revalidate the inputs the sitemap is
  // about to publish. Fails loudly at build time if the list
  // ever drifts toward a protected route.
  for (const entry of PUBLIC_SEO_PATHS) {
    assertSeoPathIsPublic(entry.path);
  }

  const lastModified = resolveLastModified();
  // Reference the base URL once so an empty value surfaces
  // during the resolve rather than per entry.
  const baseUrl = getPublicSiteBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "getPublicSiteBaseUrl() returned an empty origin; cannot build sitemap",
    );
  }

  return PUBLIC_SEO_PATHS.map((entry) => ({
    url: toAbsolutePublicUrl(entry.path),
    lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
