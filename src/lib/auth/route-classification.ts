/**
 * Phase 20I.5 -- pure path classifier for route protection.
 *
 * Pure functions, no I/O. The proxy (`src/proxy.ts`) and the
 * server layouts (`src/app/app/layout.tsx`,
 * `src/app/app/admin/layout.tsx`) both consume the same
 * classifier so the two layers agree on what is public / user /
 * admin.
 *
 * Security boundaries -- the contract this module enforces:
 *
 *   - PUBLIC paths do NOT require any session.
 *   - USER paths require a valid Supabase session.
 *     `/app/**` is the user-protected surface.
 *   - ADMIN paths require a valid session AND role
 *     `admin` or `super_admin`. `/app/admin/**` is the
 *     admin-protected surface.
 *   - The matcher is rooted at `/` and matched as a prefix
 *     (`/app/admin` matches `/app/admin/anything` and
 *     `/app/admin`).
 *
 * Default behaviour for unknown paths:
 *
 *   Unknown non-`/app` paths return `"public"` rather than
 *   `"user"`. The intent is to keep the public web / SEO /
 *   404 flow cheap and consistent: the Next.js metadata
 *   middleware and the Supabase session refresh never fire for
 *   paths the proxy does not recognise as user / admin, so
 *   marketing routes and misspellings stay SEO-friendly. This
 *   is an intentional design choice, not a bug: the proxy and
 *   the classifier are an optimistic / cheap layer, while the
 *   actual authorisation decision for any sensitive endpoint is
 *   the deep server-side guard (`requireUser()` / `requireAdmin()`)
 *   running in the page / layout / route handler.
 *
 *   The classifier NEVER papers over an unrecognised admin
 *   route -- the `/app/admin/**` prefix is matched first and
 *   strictly, so an admin route can never be downgraded to
 *   `public` by accident even if the unknown-path fallback
 *   returns `"public"`.
 *
 * Rules for new routes:
 *
 *   - Sensitive user surfaces MUST live under `/app/**` so the
 *     user guard catches them. New sensitive admin surfaces MUST
 *     live under `/app/admin/**` so the admin guard catches them.
 *   - Any new sensitive API / admin endpoint MUST call
 *     `requireAdmin()` (or `requireUser()`) directly in its
 *     layout / page / route handler. The proxy and this
 *     classifier are not a substitute for the deep guard.
 *   - Adding a brand-new public route to `PUBLIC_PREFIXES` is
 *     only required when the route needs special proxy bypass
 *     behaviour. The default unknown-path fallback is already
 *     `public`, so new SEO / marketing routes that the team
 *     wants to ship cheaply do not have to be added here as
 *     long as they fall outside `/app/**`. Routes that DO need
 *     to be treated as admin MUST be added to `ADMIN_PREFIXES`
 *     explicitly -- the unknown fallback is not a substitute.
 */

export type RouteClass = "public" | "user" | "admin";

const ADMIN_PREFIXES: ReadonlyArray<string> = ["/app/admin"];

const USER_PREFIXES: ReadonlyArray<string> = ["/app"];

const PUBLIC_PREFIXES: ReadonlyArray<string> = [
  "/",
  "/ma-giam-gia",
  "/cashback",
  "/go",
  "/login",
  "/register",
  "/auth",
  "/forbidden",
  "/about",
  "/policy",
  "/terms",
];

const PUBLIC_EXACT: ReadonlyArray<string> = [
  "/login",
  "/register",
  "/forbidden",
];

function normalize(pathname: string): string {
  if (typeof pathname !== "string" || pathname.length === 0) return "/";
  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isExactMatch(pathname: string, list: ReadonlyArray<string>): boolean {
  return list.includes(pathname);
}

function isPrefixMatch(pathname: string, list: ReadonlyArray<string>): boolean {
  return list.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Classify a request pathname. Order matters: admin wins over
 * user, user wins over public, unknown paths fall through to
 * `public` (NOT `user`) so the SEO / 404 surface stays cheap.
 */
export function classifyRoute(pathname: string): RouteClass {
  const norm = normalize(pathname);
  if (isExactMatch(norm, PUBLIC_EXACT)) return "public";
  if (isPrefixMatch(norm, ADMIN_PREFIXES)) return "admin";
  if (isPrefixMatch(norm, USER_PREFIXES)) return "user";
  if (isPrefixMatch(norm, PUBLIC_PREFIXES)) return "public";
  return "public";
}

/**
 * Return the public routes that should bypass the proxy entirely.
 * The proxy uses this to short-circuit without a Supabase round
 * trip so the SEO landing pages stay cheap.
 */
export function isPublicRoute(pathname: string): boolean {
  return classifyRoute(pathname) === "public";
}

/**
 * Convenience: a request is "protected" if it requires either a
 * user session or an admin role.
 */
export function isProtectedRoute(pathname: string): boolean {
  const cls = classifyRoute(pathname);
  return cls === "user" || cls === "admin";
}
