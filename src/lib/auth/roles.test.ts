/**
 * Phase 20I.5 -- pure tests for the role / RBAC helpers.
 *
 * No I/O, no Supabase, no Next.js. The functions under test
 * live in `./roles` so the tests do not need to import the
 * server-only guard wrapper.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isAdmin,
  isSuperAdmin,
  normalizeRole,
  readRoleFromClaims,
  roleLabel,
} from "./roles";

test("Phase 20I.5: normalizeRole accepts the canonical values", () => {
  assert.equal(normalizeRole("user"), "user");
  assert.equal(normalizeRole("admin"), "admin");
  assert.equal(normalizeRole("super_admin"), "super_admin");
});

test("Phase 20I.5: normalizeRole is case-insensitive and trims", () => {
  assert.equal(normalizeRole("  Admin  "), "admin");
  assert.equal(normalizeRole("SUPER_ADMIN"), "super_admin");
});

test("Phase 20I.5: normalizeRole refuses unknown strings", () => {
  assert.equal(normalizeRole("superadmin"), null);
  assert.equal(normalizeRole("root"), null);
  assert.equal(normalizeRole(""), null);
  assert.equal(normalizeRole("   "), null);
});

test("Phase 20I.5: normalizeRole refuses non-string input", () => {
  assert.equal(normalizeRole(null), null);
  assert.equal(normalizeRole(undefined), null);
  assert.equal(normalizeRole(42), null);
  assert.equal(normalizeRole({}), null);
  assert.equal(normalizeRole([]), null);
  assert.equal(normalizeRole(true), null);
});

test("Phase 20I.5: readRoleFromClaims honours the app_role claim first", () => {
  assert.equal(
    readRoleFromClaims({ app_role: "admin" }),
    "admin",
  );
  assert.equal(
    readRoleFromClaims({ app_role: "super_admin" }),
    "super_admin",
  );
});

test("Phase 20I.5: readRoleFromClaims falls back to the legacy role key", () => {
  assert.equal(readRoleFromClaims({ role: "admin" }), "admin");
});

test("Phase 20I.5: readRoleFromClaims honours app_metadata.app_role", () => {
  assert.equal(
    readRoleFromClaims({
      app_metadata: { app_role: "super_admin" },
    }),
    "super_admin",
  );
  assert.equal(
    readRoleFromClaims({
      app_metadata: { app_role: "admin" },
    }),
    "admin",
  );
});

test("Phase 20I.5: readRoleFromClaims honours the legacy app_metadata.role key", () => {
  assert.equal(
    readRoleFromClaims({
      app_metadata: { role: "admin" },
    }),
    "admin",
  );
});

test("Phase 20I.5 SECURITY: readRoleFromClaims ignores user_metadata.role entirely", () => {
  // SECURITY: `user_metadata` is user-writable in Supabase
  // Auth flows. If `user_metadata.role` ever produced an admin
  // grant, a regular user could self-elevate by patching their
  // own profile metadata. The helper MUST refuse to read a role
  // from there for any role value (including `user`, just to be
  // explicit). The display helper (`readUserRoleFromClaims`)
  // also does NOT consult user_metadata; it only fills with the
  // `user` default when nothing matches.
  assert.equal(
    readRoleFromClaims({ user_metadata: { role: "admin" } }),
    null,
    "user_metadata.role must NOT grant admin",
  );
  assert.equal(
    readRoleFromClaims({
      user_metadata: { role: "super_admin" },
    }),
    null,
    "user_metadata.role must NOT grant super_admin",
  );
  assert.equal(
    readRoleFromClaims({
      user_metadata: { role: "user" },
    }),
    null,
    "user_metadata.role must NOT be read at all",
  );

  // The hierarchy still kicks in: a `user_metadata.role` claim
  // is irrelevant when an `app_role` claim is present.
  assert.equal(
    readRoleFromClaims({
      app_role: "user",
      user_metadata: { role: "admin" },
    }),
    "user",
    "app_role should be authoritative over user_metadata",
  );
  assert.equal(
    readRoleFromClaims({
      app_role: "admin",
      user_metadata: { role: "super_admin" },
    }),
    "admin",
    "app_role is authoritative over a conflict in user_metadata",
  );
});

test("Phase 20I.5 SECURITY: isAdmin(actor.role) fails closed when role came from user_metadata", () => {
  // End-to-end regression: even though `readRoleFromClaims`
  // now returns `null`, an older / careless caller that still
  // tries to mint an `AppRole` from user_metadata MUST fail the
  // admin guard. This proves the helper chain (`user_metadata
  // -> unknown role -> admin guard`) cannot grant authority.
  const claims = { user_metadata: { role: "admin" } } as Record<
    string,
    unknown
  >;
  const role = readRoleFromClaims(claims);
  assert.equal(role, null);
  assert.equal(isAdmin(role), false);
  assert.equal(isSuperAdmin(role), false);
});

test("Phase 20I.5: readRoleFromClaims refuses unknown / unparseable values", () => {
  assert.equal(readRoleFromClaims({ app_role: "superadmin" }), null);
  assert.equal(readRoleFromClaims({ app_role: "" }), null);
  assert.equal(readRoleFromClaims({ app_role: 1 }), null);
  assert.equal(readRoleFromClaims(null), null);
  assert.equal(readRoleFromClaims(undefined), null);
});

test("Phase 20I.5: isAdmin is true for admin and super_admin only", () => {
  assert.equal(isAdmin("admin"), true);
  assert.equal(isAdmin("super_admin"), true);
  assert.equal(isAdmin("user"), false);
  assert.equal(isAdmin(null), false);
});

test("Phase 20I.5: isSuperAdmin is true for super_admin only", () => {
  assert.equal(isSuperAdmin("super_admin"), true);
  assert.equal(isSuperAdmin("admin"), false);
  assert.equal(isSuperAdmin("user"), false);
  assert.equal(isSuperAdmin(null), false);
});

test("Phase 20I.5: roleLabel never returns an empty / raw role", () => {
  assert.equal(roleLabel("super_admin"), "Super admin");
  assert.equal(roleLabel("admin"), "Admin");
  assert.equal(roleLabel("user"), "Thành viên");
  assert.equal(roleLabel(null), "Khách");
  // The label must NEVER include the raw role name because
  // the function is consumed by the admin shell which the user
  // sees in the browser.
  for (const label of [
    roleLabel("admin"),
    roleLabel("super_admin"),
    roleLabel("user"),
    roleLabel(null),
  ]) {
    assert.ok(
      !/admin_role|app_role|claim/.test(label),
      `roleLabel leaked an internal token: ${label}`,
    );
  }
});
