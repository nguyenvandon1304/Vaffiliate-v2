/**
 * Phase 20I.7 -- sitemap content invariants.
 *
 * We don't assert the exact XML serialisation (Next 16 owns
 * that), but we DO assert that:
 *
 *   - only public SEO paths are present
 *   - /app and /app/admin never appear
 *   - the sitemap shape (url, changeFrequency, priority) is
 *     well-typed
 *
 * The handler is run twice (once with a real production-like env
 * URL, once with the localhost fallback) to lock down both
 * branches.
 */

import test from "node:test";
import assert from "node:assert/strict";

import sitemap from "../../app/sitemap";
import { PUBLIC_SEO_PATHS } from "./public-routes";

function setSiteUrl(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = value;
  }
}

test("Phase 20I.7: sitemap includes every SEO path exactly once", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const entries = sitemap();
  const urls = new Set<string>();
  for (const entry of entries) {
    assert.ok(
      !urls.has(entry.url),
      `duplicate url in sitemap: ${entry.url}`,
    );
    urls.add(entry.url);
  }
  for (const expected of PUBLIC_SEO_PATHS) {
    const fullUrl = `https://vaffiliate.example.com${expected.path}`;
    assert.ok(
      urls.has(fullUrl),
      `sitemap must include ${fullUrl}`,
    );
  }
});

test("Phase 20I.7: sitemap entries carry the documented priority + frequency", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const entries = sitemap();
  for (const entry of entries) {
    assert.ok(
      typeof entry.priority === "number",
      `priority for ${entry.url} must be a number`,
    );
    assert.ok(
      typeof entry.changeFrequency === "string",
      `changeFrequency for ${entry.url} must be a string`,
    );
    assert.ok(entry.lastModified instanceof Date, "lastModified is a Date");
  }
});

test("Phase 20I.7: sitemap never includes /app, /app/admin or auth routes", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const entries = sitemap();
  const forbiddenSubstrings = [
    "/app",
    "/login",
    "/register",
    "/go/",
    "/auth/",
  ];
  for (const entry of entries) {
    for (const forbidden of forbiddenSubstrings) {
      assert.ok(
        !entry.url.includes(forbidden),
        `sitemap url ${entry.url} must not contain ${forbidden}`,
      );
    }
  }
});

test("Phase 20I.7: sitemap uses localhost fallback when env is unset", () => {
  setSiteUrl(undefined);
  const entries = sitemap();
  for (const entry of entries) {
    assert.ok(
      entry.url.startsWith("http://localhost:3000/"),
      `expected ${entry.url} to start with the dev fallback`,
    );
  }
});
