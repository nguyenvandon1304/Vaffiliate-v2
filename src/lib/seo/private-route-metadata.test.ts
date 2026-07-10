/**
 * Phase 20I.8 -- unit tests for the private-route `noindex`
 * metadata helper. The helper is intentionally tiny and pure;
 * the tests are written with `node:test` (matching the rest of
 * the repo's `npm test` runner) so they slot into the existing
 * test list without a configuration change.
 */

import test from "node:test";

import { privateRouteMetadata } from "./private-route-metadata";

test("privateRouteMetadata returns a noindex/nofollow robots block", () => {
  const metadata = privateRouteMetadata();
  const robots = metadata.robots;

  if (!robots || typeof robots !== "object") {
    throw new Error("Expected metadata.robots to be an object");
  }

  if (robots.index !== false) {
    throw new Error(
      `Expected index=false, received ${String(robots.index)}`,
    );
  }
  if (robots.follow !== false) {
    throw new Error(
      `Expected follow=false, received ${String(robots.follow)}`,
    );
  }
});

test("privateRouteMetadata forwards a hardened googleBot directive", () => {
  const metadata = privateRouteMetadata();
  const robots = metadata.robots as { googleBot?: unknown };

  if (typeof robots.googleBot !== "object" || robots.googleBot === null) {
    throw new Error("Expected metadata.robots.googleBot to be an object");
  }

  const googleBot = robots.googleBot as { index?: unknown; follow?: unknown };
  if (googleBot.index !== false) {
    throw new Error("Expected googleBot.index=false");
  }
  if (googleBot.follow !== false) {
    throw new Error("Expected googleBot.follow=false");
  }
});

test("privateRouteMetadata is pure (same input, same output)", () => {
  const a = privateRouteMetadata();
  const b = privateRouteMetadata();
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error("privateRouteMetadata must be a pure function");
  }
});
