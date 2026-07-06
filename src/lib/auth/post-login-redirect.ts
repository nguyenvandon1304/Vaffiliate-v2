/**
 * Phase 20H.4a -- post-login safe-redirect path allowlist.
 *
 * Extracted from `src/app/auth/actions.ts` so the allowlist can be
 * unit-tested in isolation. The action module is marked `"use server"`
 * and refuses to export arbitrary helpers, so this file holds the
 * pure function and the action module imports + re-exports it.
 *
 * Rules (UNCHANGED from the original implementation in actions.ts):
 *   - Must be parseable as an absolute or root-relative URL.
 *   - Must resolve to the same origin as the request host (no scheme
 *     injection, no off-site redirects).
 *   - Path must be inside the explicit allowlist OR be a recognised
 *     Shopee tracking redirect.
 *   - Anything that fails parsing returns the safe fallback `/app`.
 *
 * The allowlist is widened in Phase 20H.4a to include the public
 * `/cashback` route (with optional `?productUrl=...`) so the
 * logged-out buyer can paste a Shopee link on /cashback, be redirected
 * to /login, and return to /cashback?productUrl=... with the same
 * product ready to preview.
 */

const FALLBACK_PATH = "/app";

const SHOPEE_TRACKING_PATH_REGEX =
  /^\/go\/[A-Za-z0-9_-]{10,32}$/;

function isAppPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isCashbackPath(pathname: string): boolean {
  return pathname === "/cashback" || pathname.startsWith("/cashback/");
}

function isCashbackTrackingPath(pathname: string): boolean {
  return SHOPEE_TRACKING_PATH_REGEX.test(pathname);
}

export function getSafePostLoginRedirect(
  value: string | null,
): string {
  if (!value) {
    return FALLBACK_PATH;
  }

  try {
    const baseUrl = new URL("http://localhost");
    const redirectUrl = new URL(value, baseUrl);
    const pathname = redirectUrl.pathname;

    const isAllowedPath =
      isAppPath(pathname) ||
      isCashbackPath(pathname) ||
      isCashbackTrackingPath(pathname);

    if (redirectUrl.origin !== baseUrl.origin || !isAllowedPath) {
      return FALLBACK_PATH;
    }

    return (
      pathname +
      redirectUrl.search +
      redirectUrl.hash
    );
  } catch {
    return FALLBACK_PATH;
  }
}
