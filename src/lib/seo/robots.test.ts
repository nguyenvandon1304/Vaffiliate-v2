/**
 * Phase 20I.7 -- robots content invariants.
 *
 * The robots file MUST:
 *
 *   - allow everything by default (`allow: '/'`)
 *   - disallow the same prefixes the route classifier treats as
 *     protected or auth-only (`/app`, `/login`, `/register`,
 *     `/auth`, `/go`)
 *   - point crawlers at the absolute sitemap URL derived from
 *     the configured origin (with localhost fallback when env
 *     is unset)
 */

import test from "node:test";
import assert from "node:assert/strict";

import robots from "../../app/robots";
import { ROBOTS_DISALLOW_PREFIXES } from "./public-routes";

function setSiteUrl(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = value;
  }
}

test("Phase 20I.7: robots allows the entire site for the default user agent", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const config = robots();
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  assert.equal(rules.length, 1, "exactly one rule for *");
  const rule = rules[0] as { userAgent?: string | string[]; allow?: string | string[] };
  const allowed = Array.isArray(rule.allow) ? rule.allow : [rule.allow];
  assert.ok(
    allowed.includes("/"),
    "robots must allow '/' for the default user agent",
  );
});

test("Phase 20I.7: robots blocks the protected /app prefix", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const config = robots();
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  const rule = rules[0] as { disallow?: string | string[] };
  const disallowed = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
  assert.ok(
    (disallowed as string[]).includes("/app"),
    "robots must block /app",
  );
});

test("Phase 20I.7: robots disallow list matches the registry", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const config = robots();
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  const rule = rules[0] as { disallow?: string | string[] };
  const disallowed = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
  for (const prefix of ROBOTS_DISALLOW_PREFIXES) {
    assert.ok(
      (disallowed as string[]).includes(prefix),
      `robots must disallow ${prefix}`,
    );
  }
});

test("Phase 20I.7: robots sitemap URL is absolute and uses the configured origin", () => {
  setSiteUrl("https://vaffiliate.example.com");
  const config = robots();
  const sitemapUrl = Array.isArray(config.sitemap)
    ? config.sitemap[0]
    : config.sitemap;
  assert.equal(sitemapUrl, "https://vaffiliate.example.com/sitemap.xml");
  assert.equal(config.host, "https://vaffiliate.example.com");
});

test("Phase 20I.7: robots falls back to localhost when env is unset", () => {
  setSiteUrl(undefined);
  const config = robots();
  const sitemapUrl = Array.isArray(config.sitemap)
    ? config.sitemap[0]
    : config.sitemap;
  assert.equal(sitemapUrl, "http://localhost:3000/sitemap.xml");
  assert.equal(config.host, "http://localhost:3000");
});
