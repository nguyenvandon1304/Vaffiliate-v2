/**
 * Phase 20I.5 -- pure tests for the route classification helper.
 *
 * The proxy and the server layouts both rely on the same
 * classifier so a regression here would silently weaken route
 * protection. The tests cover the documented boundary cases
 * and make sure the classifier does NOT treat `/app/admin` as
 * a public or normal user route.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyRoute,
  isProtectedRoute,
  isPublicRoute,
} from "./route-classification";

test("Phase 20I.5: classifyRoute marks the documented public routes", () => {
  for (const path of [
    "/",
    "/ma-giam-gia",
    "/ma-giam-gia/shopee",
    "/cashback",
    "/login",
    "/register",
    "/auth/callback",
    "/forbidden",
  ]) {
    assert.equal(
      classifyRoute(path),
      "public",
      `expected public for ${path}`,
    );
  }
});

test("Phase 20I.5: classifyRoute marks user routes as user", () => {
  for (const path of [
    "/app",
    "/app/profile",
    "/app/cashback",
    "/app/orders",
    "/app/notifications",
    "/app/tracking-links",
    "/app/conversions",
    "/app/revenue",
    "/app/commission",
  ]) {
    assert.equal(
      classifyRoute(path),
      "user",
      `expected user for ${path}`,
    );
  }
});

test("Phase 20I.5: classifyRoute marks admin routes as admin", () => {
  for (const path of [
    "/app/admin",
    "/app/admin/",
    "/app/admin/addlivetag",
    "/app/admin/anything",
  ]) {
    assert.equal(
      classifyRoute(path),
      "admin",
      `expected admin for ${path}`,
    );
  }
});

test("Phase 20I.5: classifyRoute normalises trailing slashes", () => {
  assert.equal(classifyRoute("/app/admin/"), "admin");
  assert.equal(classifyRoute("/app/"), "user");
  assert.equal(classifyRoute("/login/"), "public");
});

test("Phase 20I.5: classifyRoute treats unknown non-/app paths as public", () => {
  // The proxy treats unknown paths as public so the SEO / 404
  // surface stays cheap and never triggers a Supabase round
  // trip. This is NOT a security failure mode: the deep
  // server-side guard (`requireUser()` / `requireAdmin()` in
  // each page / layout / route handler) is the actual
  // authorisation layer. Any new public route must be added to
  // PUBLIC_PREFIXES explicitly.
  assert.equal(classifyRoute("/something-new"), "public");
  assert.equal(classifyRoute(""), "public");
});

test("Phase 20I.5: classifyRoute never downgrades /app/admin to public", () => {
  // Regression guard against accidentally moving the admin
  // prefix out of the strict admin check. Even though the
  // default unknown behaviour is `public`, `/app/admin/**` MUST
  // stay strictly `admin`; new sensitive routes that need to be
  // auth-gated must be classified by the prefix lists above,
  // not by the unknown fallback.
  for (const path of [
    "/app/admin",
    "/app/admin/",
    "/app/admin/addlivetag",
    "/app/admin/anything-new",
  ]) {
    assert.equal(
      classifyRoute(path),
      "admin",
      `admin prefix regressed for ${path}`,
    );
  }
});

test("Phase 20I.5: isPublicRoute + isProtectedRoute are mutually consistent", () => {
  const cases: Array<readonly [string, boolean, boolean]> = [
    ["/app/admin", false, true],
    ["/app/admin/x", false, true],
    ["/app/profile", false, true],
    ["/", true, false],
    ["/ma-giam-gia", true, false],
    ["/login", true, false],
  ];
  for (const [path, expectedPublic, expectedProtected] of cases) {
    assert.equal(
      isPublicRoute(path),
      expectedPublic,
      `isPublicRoute mismatch for ${path}`,
    );
    assert.equal(
      isProtectedRoute(path),
      expectedProtected,
      `isProtectedRoute mismatch for ${path}`,
    );
  }
});

test("Phase 20I.5: the proxy MUST NOT classify /app/admin as user", () => {
  // Regression guard: an admin route that slipped through as
  // 'user' would skip the optimistic refresh that the proxy
  // applies to admin URLs, defeating the optimistic cookie
  // refresh and (worse) the layout-level requireAdmin().
  assert.notEqual(classifyRoute("/app/admin"), "user");
  assert.notEqual(classifyRoute("/app/admin"), "public");
});
