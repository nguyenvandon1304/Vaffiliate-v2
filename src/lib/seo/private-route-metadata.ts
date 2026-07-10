import type { Metadata } from "next";

/**
 * Phase 20I.8 -- `noindex,nofollow` metadata for private buyer routes.
 *
 * Authenticated `/app/**` routes MUST NOT bleed into public search.
 * The SEO boundary helper in `src/lib/seo/public-routes.ts` already
 * keeps `/app/**` out of `PUBLIC_SEO_PATHS` and includes it in
 * `ROBOTS_DISALLOW_PREFIXES`. This metadata helper closes the gap
 * for the rendered `<meta name="robots">` tag in `<head>` so
 * crawlers that ignore robots.txt still refuse to index the page.
 *
 * Usage:
 *
 *   // app/app/page.tsx
 *   export const metadata = privateRouteMetadata();
 *
 * The exported value is a `Metadata` object so Next.js documents it
 * correctly. It is intentionally derived rather than hand-written
 * so the robots directive cannot drift between callers.
 *
 * Invariants:
 *
 *   - The robots directive is `noindex, nofollow`. We do not allow
 *     `index` for any authenticated buyer surface.
 *   - This helper is the ONLY place that returns the noindex
 *     directive for private routes, mirroring the contract that
 *     `assertSeoPathIsPublic` is the only place that asserts a
 *     public route.
 *   - The function is pure: same input, same output. No I/O, no
 *     Supabase round trip, no header reads.
 */
export function privateRouteMetadata(): Metadata {
  return {
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        nocache: true,
      },
    },
  };
}
