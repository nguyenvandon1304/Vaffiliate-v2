/**
 * Phase 20I.7 -- tests for the public site-config helper.
 *
 * The helper is the single source of truth for `sitemap.ts`,
 * `robots.ts`, and the JSON-LD structured-data helper. Wrong
 * values there would either break the sitemap at runtime or
 * advertise a wrong origin to crawlers, so the parse / fallback
 * behaviour is locked down here.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  getPublicSiteBaseUrl,
  toAbsolutePublicUrl,
} from "./public-site-config";

function setSiteUrl(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = value;
  }
}

test("Phase 20I.7: getPublicSiteBaseUrl falls back to localhost dev when unset", () => {
  setSiteUrl(undefined);
  assert.equal(getPublicSiteBaseUrl(), "http://localhost:3000");
});

test("Phase 20I.7: getPublicSiteBaseUrl falls back when env is empty", () => {
  setSiteUrl("");
  assert.equal(getPublicSiteBaseUrl(), "http://localhost:3000");
});

test("Phase 20I.7: getPublicSiteBaseUrl falls back when env is malformed", () => {
  setSiteUrl("not a url");
  assert.equal(getPublicSiteBaseUrl(), "http://localhost:3000");
});

test("Phase 20I.7: getPublicSiteBaseUrl falls back when scheme is file:// or javascript:", () => {
  setSiteUrl("javascript:alert(1)");
  assert.equal(getPublicSiteBaseUrl(), "http://localhost:3000");
  setSiteUrl("file:///etc/passwd");
  assert.equal(getPublicSiteBaseUrl(), "http://localhost:3000");
});

test("Phase 20I.7: getPublicSiteBaseUrl accepts a clean https origin", () => {
  setSiteUrl("https://vaffiliate.example.com");
  assert.equal(
    getPublicSiteBaseUrl(),
    "https://vaffiliate.example.com",
  );
});

test("Phase 20I.7: getPublicSiteBaseUrl strips a trailing slash", () => {
  setSiteUrl("https://vaffiliate.example.com/");
  assert.equal(
    getPublicSiteBaseUrl(),
    "https://vaffiliate.example.com",
  );
});

test("Phase 20I.7: toAbsolutePublicUrl joins origin + path safely", () => {
  setSiteUrl("https://vaffiliate.example.com");
  assert.equal(
    toAbsolutePublicUrl("/ma-giam-gia"),
    "https://vaffiliate.example.com/ma-giam-gia",
  );
  assert.equal(
    toAbsolutePublicUrl("/ma-giam-gia/shopee"),
    "https://vaffiliate.example.com/ma-giam-gia/shopee",
  );
});

test("Phase 20I.7: toAbsolutePublicUrl handles missing leading slash", () => {
  setSiteUrl("https://vaffiliate.example.com");
  assert.equal(
    toAbsolutePublicUrl("privacy"),
    "https://vaffiliate.example.com/privacy",
  );
});

test("Phase 20I.7: toAbsolutePublicUrl passes absolute URLs through unchanged", () => {
  setSiteUrl("https://vaffiliate.example.com");
  assert.equal(
    toAbsolutePublicUrl("https://other.example.com/foo"),
    "https://other.example.com/foo",
  );
});

test("Phase 20I.7: toAbsolutePublicUrl handles empty string as base", () => {
  setSiteUrl("https://vaffiliate.example.com");
  assert.equal(
    toAbsolutePublicUrl(""),
    "https://vaffiliate.example.com",
  );
});

test("Phase 20I.7: default fallback works for both helpers", () => {
  setSiteUrl(undefined);
  assert.equal(
    toAbsolutePublicUrl("/privacy"),
    "http://localhost:3000/privacy",
  );
});
