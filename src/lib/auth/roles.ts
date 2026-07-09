/**
 * Phase 20I.5 -- AppRole + RBAC primitives.
 *
 * Pure types / pure functions. NO database calls, NO Supabase calls.
 * This module is the only place that knows the role vocabulary so a
 * future rename (e.g. `editor`) only touches this file plus the few
 * callers that import the type.
 *
 * Design rules:
 *
 *   - The type `AppRole` is intentionally tiny: `user`, `admin`,
 *     `super_admin`. Anything we cannot classify falls through to
 *     `null` so the guards fail closed.
 *   - `normalizeRole(input)` accepts a raw string and returns either
 *     a known `AppRole` or `null`. Unknown strings are NOT silently
 *     coerced to `user`; they return `null` so a guard can refuse the
 *     request.
 *   - Role SOURCE is decided by `readRoleFromClaims`. Admin /
 *     super_admin NEVER come from `user_metadata` because
 *     `user_metadata` is user-writable in Supabase Auth flows -- a
 *     regular user could otherwise self-elevate by editing their own
 *     profile metadata. The accepted sources are:
 *
 *       1. top-level `app_role` claim     (recommended)
 *       2. top-level `role` claim         (legacy)
 *       3. `app_metadata.app_role`        (server-only, safe)
 *       4. `app_metadata.role`            (server-only, legacy)
 *
 *     `user_metadata.role` is NEVER consulted for any role. Note the
 *     `user` role specifically: a missing claim falls through to
 *     `null` everywhere EXCEPT in the optional
 *     `readUserRoleFromClaims` helper, which still does NOT use
 *     `user_metadata` -- it just defaults to `user` so display
 *     logic can render a sensible label for an authenticated user
 *     whose role claim is absent.
 *
 *   - All role checks are exposed as pure boolean functions so they
 *     can be unit-tested without spinning up Supabase.
 *
 *   - "Fail-closed" means: an unknown / missing role never grants
 *     `admin` or `super_admin`. The most permissive role a
 *     `null` input can produce through the helper is the explicit
 *     `user` fallback in `readUserRoleFromClaims` -- and even that
 *     never produces `admin` or `super_admin`.
 */

export type AppRole = "user" | "admin" | "super_admin";

/**
 * Allowed roles when an action requires an admin. We treat both
 * `admin` and `super_admin` as authorised for admin operations so
 * a single guard does not have to special-case the super admin.
 */
export const ADMIN_ROLES: ReadonlyArray<AppRole> = ["admin", "super_admin"];

/**
 * Allowed roles when an action requires the highest authority.
 * Only `super_admin` passes.
 */
export const SUPER_ADMIN_ROLES: ReadonlyArray<AppRole> = ["super_admin"];

/**
 * Keys (at the top level of the claim bag) that are accepted as a
 * source of the role. The Supabase custom claim key is `app_role`;
 * the legacy top-level `role` key is also accepted because some
 * older deployments set it.
 *
 * IMPORTANT: `user_metadata.role` is intentionally absent. See
 * the module docblock for the threat model.
 */
export const ROLE_CLAIM_KEYS: ReadonlyArray<string> = [
  "app_role",
  "role",
];

/**
 * Keys accepted inside `app_metadata`. `app_metadata` is
 * server-only in Supabase Auth (only the service role / SQL
 * triggers can write it), so it is safe to trust as an authority
 * source.
 */
export const APP_METADATA_ROLE_KEYS: ReadonlyArray<string> = [
  "app_role",
  "role",
];

const KNOWN_ROLES: ReadonlyArray<AppRole> = [
  "user",
  "admin",
  "super_admin",
];

function isAppRole(value: string): value is AppRole {
  return (KNOWN_ROLES as ReadonlyArray<string>).includes(value);
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Coerce an unknown value into an `AppRole | null`. The function is
 * deliberately strict: unknown strings return `null` instead of
 * silently falling back to `user` so a guard can refuse the request.
 */
export function normalizeRole(input: unknown): AppRole | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (!isAppRole(trimmed)) return null;
  return trimmed;
}

/**
 * Read the strict role from a Supabase claim bag. Returns
 * `null` if the role cannot be determined from a trusted source.
 * Pure function; no I/O.
 *
 * Trusted sources (in priority order):
 *
 *   1. top-level `app_role` claim.
 *   2. top-level `role` claim.
 *   3. `app_metadata.app_role`.
 *   4. `app_metadata.role`.
 *
 * `user_metadata.role` is NEVER consulted for any role here. It is
 * intentionally absent from the search list because it is
 * user-writable in Supabase Auth flows and therefore cannot be
 * trusted to authorise admin access.
 */
export function readRoleFromClaims(
  claims: Record<string, unknown> | null | undefined,
): AppRole | null {
  if (!isPlainObject(claims)) return null;

  for (const key of ROLE_CLAIM_KEYS) {
    const normalized = normalizeRole(claims[key]);
    if (normalized !== null) return normalized;
  }

  const appMetaRaw = claims["app_metadata"];
  if (isPlainObject(appMetaRaw)) {
    for (const key of APP_METADATA_ROLE_KEYS) {
      const normalized = normalizeRole(appMetaRaw[key]);
      if (normalized !== null) return normalized;
    }
  }

  // SECURITY: `user_metadata` is intentionally NOT consulted. A
  // regular user can edit their own `user_metadata` via Supabase
  // Auth flows (sign up, password reset, profile updates). If we
  // read a role from there, a user could self-elevate to admin
  // simply by patching their own profile metadata. The fail-closed
  // contract of this helper is therefore: `null` is the only safe
  // answer when no trusted source matches.
  return null;
}

/**
 * Read the display role for an authenticated user. This is the
 * ONLY helper in this module that can ever produce a `user`
 * fallback for a missing claim. It still refuses to mint
 * `admin` or `super_admin` from anywhere except the trusted
 * claim sources documented on `readRoleFromClaims`.
 *
 * Use this for UI labelling (the welcome banner, the navigation
 * role badge) and NEVER for an authorisation check. Authorisation
 * MUST go through `isAdmin(actor.role)` / `isSuperAdmin(actor.role)`
 * with the role that came out of `readRoleFromClaims`.
 */
export function readUserRoleFromClaims(
  claims: Record<string, unknown> | null | undefined,
): AppRole {
  return readRoleFromClaims(claims) ?? "user";
}

/**
 * Boolean helpers. `null` always fails closed -- it never grants
 * admin or super_admin.
 */
export function isAdmin(role: AppRole | null): boolean {
  if (role === null) return false;
  return ADMIN_ROLES.includes(role);
}

export function isSuperAdmin(role: AppRole | null): boolean {
  if (role === null) return false;
  return SUPER_ADMIN_ROLES.includes(role);
}

/**
 * Return the highest privilege implied by a role. Useful when
 * rendering a single label without disclosing the raw claim.
 */
export function roleLabel(role: AppRole | null): string {
  if (role === "super_admin") return "Super admin";
  if (role === "admin") return "Admin";
  if (role === "user") return "Thành viên";
  return "Khách";
}
