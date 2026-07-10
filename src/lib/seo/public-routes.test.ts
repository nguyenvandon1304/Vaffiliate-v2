/**
 * Phase 20I.7 -- invariants for the public SEO routes registry.
 *
 * These are pure data checks. They run synchronously, no I/O.
 * They exist so that adding a new path to PUBLIC_SEO_PATHS (or
 * ROBOTS_DISALLOW_PREFIXES) cannot silently bypass the
 * `/app/admin` / `/app` boundary that Phase 20I.5 hard-wired.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyRoute,
  isProtectedRoute,
  isPublicRoute,
} from "@/lib/auth/route-classification";

import {
  PUBLIC_SEO_PATHS,
  ROBOTS_DISALLOW_PREFIXES,
  assertSeoPathIsPublic,
} from "./public-routes";

test("Phase 20I.7: every SEO path is classified as public by the route classifier", () => {
  for (const entry of PUBLIC_SEO_PATHS) {
    assert.equal(
      isPublicRoute(entry.path),
      true,
      `expected ${entry.path} to be public`,
    );
    assert.equal(
      isProtectedRoute(entry.path),
      false,
      `expected ${entry.path} NOT to be protected`,
    );
    assert.equal(
      classifyRoute(entry.path),
      "public",
      `expected classifyRoute(${entry.path}) to be public`,
    );
  }
});

test("Phase 20I.7: SEO paths are unique and each starts with a slash", () => {
  const seen = new Set<string>();
  for (const entry of PUBLIC_SEO_PATHS) {
    assert.ok(
      entry.path.startsWith("/"),
      `path "${entry.path}" must start with /`,
    );
    assert.ok(
      !seen.has(entry.path),
      `duplicate SEO path "${entry.path}"`,
    );
    seen.add(entry.path);
  }
});

test("Phase 20I.7: SEO paths priority is in (0, 1] and is a number", () => {
  for (const entry of PUBLIC_SEO_PATHS) {
    assert.ok(
      Number.isFinite(entry.priority),
      `${entry.path}: priority must be a finite number`,
    );
    assert.ok(
      entry.priority > 0 && entry.priority <= 1,
      `${entry.path}: priority must be in (0, 1]`,
    );
  }
});

test("Phase 20I.7: SEO paths expose a known change frequency", () => {
  const valid = new Set([
    "always",
    "hourly",
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "never",
  ]);
  for (const entry of PUBLIC_SEO_PATHS) {
    assert.ok(
      valid.has(entry.changeFrequency),
      `${entry.path}: changeFrequency "${entry.changeFrequency}" is not a known value`,
    );
  }
});

test("Phase 20I.7: /app and /app/admin are NEVER in the SEO surface", () => {
  for (const entry of PUBLIC_SEO_PATHS) {
    assert.notEqual(
      entry.path,
      "/app",
      `/app must never appear in the public SEO surface`,
    );
    assert.ok(
      !entry.path.startsWith("/app/"),
      `${entry.path} cannot live under /app/** in the SEO surface`,
    );
  }
  // `assertSeoPathIsPublic` is the runtime invariant inside the
  // sitemap module too: it must throw when handed a protected
  // path.
  assert.throws(
    () => assertSeoPathIsPublic("/app"),
    /Refusing to advertise protected path/,
  );
  assert.throws(
    () => assertSeoPathIsPublic("/app/admin"),
    /Refusing to advertise protected path/,
  );
  assert.throws(
    () => assertSeoPathIsPublic("/app/profile"),
    /Refusing to advertise protected path/,
  );
});

test("Phase 20I.7: ROBOTS_DISALLOW_PREFIXES blocks /app and /app/admin", () => {
  assert.ok(
    ROBOTS_DISALLOW_PREFIXES.includes("/app"),
    "/app must be on the disallow list",
  );
  // /app/admin is covered by the /app prefix in Robots, but we
  // also re-classify it as `admin` so future copy / typo on the
  // prefix list can't silently allowlist admin URLs.
  assert.equal(classifyRoute("/app/admin"), "admin");
  assert.equal(classifyRoute("/app/admin/addlivetag"), "admin");
});

test("Phase 20I.7: ROBOTS_DISALLOW_PREFIXES never blocks a public route", () => {
  for (const path of PUBLIC_SEO_PATHS) {
    for (const blocked of ROBOTS_DISALLOW_PREFIXES) {
      assert.ok(
        !path.path.startsWith(blocked),
        `SEO path ${path.path} cannot start with disallow prefix ${blocked}`,
      );
    }
  }
});

test("Phase 20I.7: assertSeoPathIsPublic accepts every public SEO path", () => {
  for (const entry of PUBLIC_SEO_PATHS) {
    assert.doesNotThrow(
      () => assertSeoPathIsPublic(entry.path),
      `SEO path ${entry.path} should be considered public`,
    );
  }
});

test("Phase 20I.7: assertSeoPathIsPublic rejects paths without leading slash", () => {
  assert.throws(
    () => assertSeoPathIsPublic("privacy"),
    /must start with/i,
  );
});
