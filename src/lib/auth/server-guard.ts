/**
 * Phase 20I.5 -- server-only auth helpers (requireUser / requireAdmin).
 *
 * This module wraps the Supabase server client and exposes a tiny
 * vocabulary the rest of the codebase can call without having to
 * know which client / cookie / header to read.
 *
 * Strict invariants:
 *
 *   - `requireUser()` MUST run on the server. It imports
 *     `server-only` so a Client Component that accidentally imports
 *     it fails the build instead of leaking the session check to
 *     the client.
 *   - On success the helpers return a typed handle that includes
 *     `{ userId, email, role, claims }`. The role is read through
 *     `readRoleFromClaims()` whose trusted sources are, in priority
 *     order:
 *       1. top-level `app_role` claim          (recommended)
 *       2. top-level `role` claim              (legacy)
 *       3. `app_metadata.app_role`             (server-only)
 *       4. `app_metadata.role`                 (server-only legacy)
 *     `user_metadata.role` is NEVER consulted -- it is
 *     user-writable in Supabase Auth flows and therefore cannot
 *     authorise admin / super_admin access.
 *   - On failure the helpers either redirect to `/login?next=...`
 *     (user guard) or `notFound()`-style `forbidden()` (admin
 *     guard). They never return `null`; callers always receive a
 *     fully-populated handle and the unsafe path is a thrown
 *     redirect.
 *   - When the role cannot be determined from a trusted source,
 *     admin guards fail closed: a missing / unparseable role claim
 *     refuses admin access even if the user is authenticated.
 *
 * The helpers are NOT exported via a barrel so unit tests can
 * import the pure helpers from `./roles` without triggering the
 * `server-only` import at module load.
 */

import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  ADMIN_ROLES,
  type AppRole,
  readRoleFromClaims,
} from "./roles";

export interface AuthorizedUser {
  readonly userId: string;
  readonly email: string | null;
  readonly role: AppRole | null;
  readonly claims: Readonly<Record<string, unknown>>;
}

/**
 * Resolve the current user from the Supabase session.
 *
 * Returns `null` when there is no session, when the session is
 * invalid, or when `getUser()` fails. Does NOT throw.
 *
 * Role resolution is delegated to `readRoleFromClaims()`. The
 * role is read ONLY from the following trusted sources (in
 * priority order):
 *
 *   1. top-level `app_role` claim          (recommended)
 *   2. top-level `role` claim              (legacy)
 *   3. `app_metadata.app_role`             (server-only)
 *   4. `app_metadata.role`                 (server-only legacy)
 *
 * `user_metadata.role` is NEVER consulted -- it is user-writable
 * in Supabase Auth flows and therefore cannot authorise admin /
 * super_admin access. When none of the trusted sources yields a
 * valid role, `role` on the returned handle is `null` and the
 * admin guards fail closed.
 */
export async function getCurrentUserAsync(): Promise<AuthorizedUser | null> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return null;
  }
  let result;
  try {
    result = await supabase.auth.getUser();
  } catch {
    return null;
  }
  const user = result.data?.user;
  if (!user || typeof user.id !== "string" || user.id.length === 0) {
    return null;
  }

  // Pull the JWT claims separately so we can read the custom role
  // claim. `getClaims()` is the documented @supabase/ssr entry point
  // for that. It returns `{ data: { claims } } | { data: null }`.
  let claims: Record<string, unknown> = {};
  try {
    const claimsResult = await supabase.auth.getClaims();
    if (claimsResult.data?.claims && typeof claimsResult.data.claims === "object") {
      claims = claimsResult.data.claims as Record<string, unknown>;
    }
  } catch {
    // Treat a claims read failure as "no claims" -- role will be null.
  }

  return {
    userId: user.id,
    email: typeof user.email === "string" ? user.email : null,
    role: readRoleFromClaims(claims),
    claims,
  };
}

/**
 * Build a same-origin `/login?next=...` redirect URL. The `next`
 * value is re-validated against a tight allowlist so the helper
 * cannot be used as an open redirect.
 */
function buildLoginRedirect(nextPath: string): string {
  // Restrict `next` to paths under `/app`, `/app/admin`, or
  // `/cashback`. Anything else falls through to `/app`.
  const trimmed = nextPath.trim();
  const isAllowed =
    trimmed === "/app" ||
    trimmed === "/app/admin" ||
    trimmed.startsWith("/app/") ||
    trimmed === "/cashback" ||
    trimmed.startsWith("/cashback/");
  const safeNext = isAllowed ? trimmed : "/app";
  const params = new URLSearchParams({ next: safeNext });
  return `/login?${params.toString()}`;
}

/**
 * Refuse the request. The current contract is to throw a redirect
 * to a dedicated `/forbidden` page so the user sees a calm,
 * well-labelled screen instead of a generic 403. The page itself
 * is added by Phase 20I.5 layout changes.
 */
function forbidden(): never {
  redirect("/forbidden");
}

/**
 * Server-side guard for user routes (`/app/**`). Redirects to
 * `/login?next=...` when the session is missing or invalid. Never
 * throws on the success path.
 */
export async function requireUser(nextPath: string): Promise<AuthorizedUser> {
  const user = await getCurrentUserAsync();
  if (!user) {
    redirect(buildLoginRedirect(nextPath));
  }
  return user;
}

/**
 * Server-side guard for admin routes (`/app/admin/**`). Refuses the
 * request when:
 *
 *   - the session is missing or invalid (`/login?next=...`);
 *   - the session is valid but the role claim cannot be parsed
 *     (fail closed: redirect to `/forbidden`);
 *   - the role is not in {@link ADMIN_ROLES} (redirect to
 *     `/forbidden`).
 */
export async function requireAdmin(nextPath: string): Promise<AuthorizedUser> {
  const user = await requireUser(nextPath);
  if (!user.role || !ADMIN_ROLES.includes(user.role)) {
    forbidden();
  }
  return user;
}

/**
 * Super-admin guard. Same shape as {@link requireAdmin} but only
 * `super_admin` passes. Reserved for Phase 20I.5+ features such
 * as destructive admin operations.
 */
export async function requireSuperAdmin(
  nextPath: string,
): Promise<AuthorizedUser> {
  const user = await requireUser(nextPath);
  if (user.role !== "super_admin") {
    forbidden();
  }
  return user;
}
