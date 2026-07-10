/**
 * Phase 20I.7 -- public SEO / sitemap / robots site-config helper.
 *
 * Single source of truth for the public base URL used by
 * `src/app/sitemap.ts`, `src/app/robots.ts`, and the JSON-LD
 * structured-data helper.
 *
 * Rules:
 *
 *   - Read `NEXT_PUBLIC_SITE_URL` at runtime. The value is the
 *     full origin including scheme (e.g.
 *     `https://vaffiliate.example.com`). When the env var is
 *     missing or malformed we fall back to a deterministic dev
 *     default (`http://localhost:3000`). Falling back keeps the
 *     build usable in CI / sandbox where the env has not been
 *     configured yet.
 *   - Strip a trailing slash so callers can safely concatenate
 *     paths with `${baseUrl}/foo` or `${baseUrl}foo` without
 *     double-slashes.
 *   - NEVER accept user input, headers, or database values: the
 *     base URL is environment-driven only. Sitemap / robots must
 *     not be influenced by attacker-controlled headers.
 *   - The helper is pure: identical inputs return identical
 *     outputs. No `Date.now()`, no I/O, no Supabase calls.
 *
 * Future work / production note:
 *
 *   Before launch set `NEXT_PUBLIC_SITE_URL` to the real origin
 *   (e.g. `https://vaffiliate.com`).  An empty / wrong value will
 *   cause the sitemap to advertise the dev origin to crawlers.
 */

const DEFAULT_DEV_SITE_URL = "http://localhost:3000";

/**
 * Normalise a raw env-supplied site URL. Returns the local dev
 * fallback when the input is missing, malformed, or uses an
 * unsupported scheme.
 */
function normaliseSiteUrl(raw: string | undefined | null): string {
  if (typeof raw !== "string") return DEFAULT_DEV_SITE_URL;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return DEFAULT_DEV_SITE_URL;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return DEFAULT_DEV_SITE_URL;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return DEFAULT_DEV_SITE_URL;
  }
  // Remove trailing slash so `${base}/path` produces a clean URL.
  return parsed.origin.replace(/\/+$/, "");
}

/**
 * Resolve the public site base URL. Memoised on the raw env value
 * so repeated calls during a single render don't re-parse the
 * string.
 */
let cachedKey: string | null = null;
let cachedValue: string | null = null;
export function getPublicSiteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  const key = raw ?? "__unset__";
  if (cachedKey === key && cachedValue !== null) {
    return cachedValue;
  }
  const value = normaliseSiteUrl(raw);
  cachedKey = key;
  cachedValue = value;
  return value;
}

/**
 * Resolve a public path to an absolute URL using the configured
 * base. Forward slashes are normalised: `"/foo"` -> `${base}/foo`,
 * `"foo"` -> `${base}/foo`. Returns the input verbatim when it is
 * already an absolute URL so callers can safely pass either kind.
 */
export function toAbsolutePublicUrl(path: string): string {
  if (typeof path !== "string" || path.length === 0) {
    return getPublicSiteBaseUrl();
  }
  if (/^https?:\/\//i.test(path)) return path;
  const base = getPublicSiteBaseUrl();
  if (path.startsWith("/")) return `${base}${path}`;
  return `${base}/${path}`;
}
