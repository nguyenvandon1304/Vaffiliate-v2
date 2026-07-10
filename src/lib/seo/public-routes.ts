/**
 * Phase 20I.7 -- single source of truth for public SEO routes.
 *
 * Every public SEO route shipped to crawlers (sitemap, robots,
 * JSON-LD breadcrumb helper) reads from this list. Adding a new
 * public route only requires editing this file + adjusting the
 * `route-classification.ts` prefix list once.
 *
 * The list is split into:
 *
 *   - `PUBLIC_SEO_PATHS`  -- the routes that SHOULD be indexed
 *     and listed in the sitemap. These are the routes a buyer
 *     can land on without logging in.
 *   - `ROBOTS_DISALLOW_PREFIXES` -- the route prefixes that MUST
 *     NOT be indexed. We deliberately disallow `/app/**` so the
 *     user dashboard never bleeds into a Google search. We also
 *     disallow `/login`, `/register`, and `/go` (the latter hides
 *     shortCode redirects from public SEO).
 *
 * Both lists are pure data so they can be imported from both
 * server modules and unit tests.
 */

import {
  classifyRoute,
  isProtectedRoute,
  isPublicRoute,
} from "@/lib/auth/route-classification";

/**
 * Public routes that crawlers may index. Order is also the
 * sitemap order. Path is the buyer-facing URL relative to the
 * site origin (always begins with a leading `/`).
 *
 * Each entry carries a `changeFrequency` and `priority` hint
 * for the sitemap. Defaults are conservative: the homepage is
 * `daily / 1`, deal pages are `daily / 0.9`, policy pages are
 * `monthly / 0.4`.
 */
export type PublicSeoPath = {
  readonly path: string;
  readonly changeFrequency:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  readonly priority: number;
};

export const PUBLIC_SEO_PATHS: ReadonlyArray<PublicSeoPath> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/ma-giam-gia", changeFrequency: "daily", priority: 0.9 },
  { path: "/ma-giam-gia/shopee", changeFrequency: "daily", priority: 0.9 },
  { path: "/cashback", changeFrequency: "daily", priority: 0.8 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.4 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.4 },
  {
    path: "/cashback-terms",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  { path: "/data-deletion", changeFrequency: "monthly", priority: 0.4 },
];

/**
 * Path prefixes the robots file MUST block. The proxy and the
 * route classifier already enforce authentication on `/app/**`;
 * this list is the SEO mirror of that contract.
 *
 * NOTE: `/login`, `/register`, and `/go` are technically
 * `public` per the route classifier (so they don't bounce
 * unauthenticated users), but the SEO surface should not list
 * them. Keeping them here is intentional.
 */
export const ROBOTS_DISALLOW_PREFIXES: ReadonlyArray<string> = [
  "/app",
  "/login",
  "/register",
  "/auth",
  "/go",
];

/**
 * Defence in depth: refuse to ship a sitemap that lists any
 * protected or admin route. Called from the sitemap module so
 * misconfiguration throws loudly at build / render time rather
 * than leaking into the sitemap output.
 */
export function assertSeoPathIsPublic(path: string): void {
  if (!path.startsWith("/")) {
    throw new Error(`SEO path must start with '/' got ${path}`);
  }
  if (!isPublicRoute(path) || isProtectedRoute(path)) {
    throw new Error(
      `Refusing to advertise protected path "${path}" in public SEO surface`,
    );
  }
  const cls = classifyRoute(path);
  if (cls !== "public") {
    throw new Error(
      `Refusing to advertise route-class ${cls} for "${path}" in public SEO surface`,
    );
  }
}
