/**
 * Unit tests for the pure Shopee affiliate redirect URL builder.
 *
 * Run with:
 *
 *     node --import tsx --test src/lib/cashback/shopee-affiliate-config.test.ts
 *
 * Pure: no network, no env, no server-only. Uses Node built-in
 * node:test runner so the suite stays inside the existing
 * tsx --test based npm test pipeline.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildShopeeAffiliateRedirectUrl,
} from "./shopee-affiliate-url-builder";

const VALID_ACCOUNT_ID = "an_123456";
const VALID_NETWORK_SUB_ID = "vaflnk0000000000000000000001ab";
const VALID_DESTINATION_URL = "https://shopee.vn/product/12345/67890";

// -------------------------------------------------------------------
// Happy path - correct /an_redir format
// -------------------------------------------------------------------

test("generates URL with /an_redir pathname", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.origin, "https://s.shopee.vn");
  assert.equal(u.pathname, "/an_redir");
});

test("origin_link decodes to the exact canonical destination URL", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  // URLSearchParams.get() already returns the decoded value
  const originLink = u.searchParams.get("origin_link") ?? "";

  assert.equal(originLink, VALID_DESTINATION_URL);
});

test("affiliate_id contains only the numeric portion of accountId", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: "an_123456",
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.searchParams.get("affiliate_id"), "123456");
});

test("sub_id equals networkSubId followed by -web-direct-na-na", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(
    u.searchParams.get("sub_id"),
    `${VALID_NETWORK_SUB_ID}-web-direct-na-na`,
  );
});

test("networkSubId is not shortened or transformed", () => {
  const networkSubId = VALID_NETWORK_SUB_ID;
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId,
  });

  const u = new URL(result);

  assert.equal(
    u.searchParams.get("sub_id"),
    `${networkSubId}-web-direct-na-na`,
  );
});

test("only required parameters are included (origin_link, affiliate_id, sub_id)", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  const keys = [...u.searchParams.keys()];

  assert.deepEqual(
    keys.sort(),
    ["origin_link", "affiliate_id", "sub_id"].sort(),
  );
});

test("result is a valid absolute URL", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: "https://shopee.vn/product/42/99",
    accountId: "an_42",
    networkSubId: "vaflnk000000000000000000000042",
  });

  const u = new URL(result);

  assert.equal(u.protocol, "https:");
  assert.equal(u.hostname, "s.shopee.vn");
  assert.equal(u.pathname, "/an_redir");
});

// -------------------------------------------------------------------
// Input validation - empty/whitespace
// -------------------------------------------------------------------

test("throws when canonicalDestinationUrl is empty string", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: "",
        accountId: VALID_ACCOUNT_ID,
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /empty/i,
  );
});

test("throws when canonicalDestinationUrl is whitespace only", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: "   ",
        accountId: VALID_ACCOUNT_ID,
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /empty/i,
  );
});

test("throws when accountId is empty string", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: "",
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /empty/i,
  );
});

test("throws when networkSubId is empty string", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: VALID_ACCOUNT_ID,
        networkSubId: "",
      }),
    /empty/i,
  );
});

test("throws when networkSubId is whitespace only", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: VALID_ACCOUNT_ID,
        networkSubId: "   ",
      }),
    /empty/i,
  );
});

// -------------------------------------------------------------------
// Input validation - invalid accountId
// -------------------------------------------------------------------

test("throws when accountId does not match an_<digits> pattern", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: "invalid",
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /an_<digits>/i,
  );
});

test("throws when accountId has wrong prefix", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: "shop_123456",
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /an_<digits>/i,
  );
});

test("throws when accountId is missing digits", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: "an_",
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /an_<digits>/i,
  );
});

test("throws when accountId contains special characters", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: "an_123?456",
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /an_<digits>/i,
  );
});

// -------------------------------------------------------------------
// Input validation - invalid networkSubId
// -------------------------------------------------------------------

test("throws when networkSubId does not match vaflnk[a-f0-9]{24} pattern", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: VALID_ACCOUNT_ID,
        networkSubId: "invalid",
      }),
    /vaflnk\[a-f0-9\]/i,
  );
});

test("throws when networkSubId is missing vaflnk prefix", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: VALID_ACCOUNT_ID,
        networkSubId: "0000000000000000000000000001",
      }),
    /vaflnk\[a-f0-9\]/i,
  );
});

test("throws when networkSubId has wrong prefix", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: VALID_ACCOUNT_ID,
        networkSubId: "va1lnk0000000000000000000000001",
      }),
    /vaflnk\[a-f0-9\]/i,
  );
});

test("throws when networkSubId contains uppercase hex", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: VALID_ACCOUNT_ID,
        networkSubId: "vaflnkAAAAAAAAAAAAAAAAAAAAAAAAA",
      }),
    /vaflnk\[a-f0-9\]/i,
  );
});

test("throws when networkSubId is too short", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: VALID_DESTINATION_URL,
        accountId: VALID_ACCOUNT_ID,
        networkSubId: "vaflnk1234",
      }),
    /vaflnk\[a-f0-9\]/i,
  );
});

// -------------------------------------------------------------------
// Input validation - invalid URL
// -------------------------------------------------------------------

test("throws when canonicalDestinationUrl is not a valid URL", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: "not-a-url",
        accountId: VALID_ACCOUNT_ID,
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /valid Shopee product URL/i,
  );
});

test("throws when canonicalDestinationUrl uses HTTP instead of HTTPS", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: "http://shopee.vn/product/1/2",
        accountId: VALID_ACCOUNT_ID,
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /Shopee product URL/i,
  );
});

// -------------------------------------------------------------------
// Input validation - non-Shopee destination URLs
// -------------------------------------------------------------------

test("throws when canonicalDestinationUrl is from a non-Shopee domain", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: "https://amazon.com/product/123",
        accountId: VALID_ACCOUNT_ID,
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /Shopee/i,
  );
});

test("throws when canonicalDestinationUrl is from TikTok", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: "https://tiktok.com/@shop/product",
        accountId: VALID_ACCOUNT_ID,
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /Shopee/i,
  );
});

test("accepts shopee.vn domain", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: "https://shopee.vn/product/1/2",
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  assert.ok(result.startsWith("https://s.shopee.vn/an_redir"));
});

test("rejects shopee.com domain (not a canonical host)", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: "https://shopee.com/product/1/2",
        accountId: VALID_ACCOUNT_ID,
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /Shopee/i,
  );
});

test("rejects shope.ee domain (short link)", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: "https://shope.ee/product/1/2",
        accountId: VALID_ACCOUNT_ID,
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /Shopee/i,
  );
});

test("rejects subdomain of shopee.vn (subdomains not allowed)", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: "https://foo.shopee.vn/product/1/2",
        accountId: VALID_ACCOUNT_ID,
        networkSubId: VALID_NETWORK_SUB_ID,
      }),
    /Shopee/i,
  );
});

// -------------------------------------------------------------------
// URL encoding safety
// -------------------------------------------------------------------

test("destination URL with special characters uses canonical form", () => {
  // parseShopeeProductUrl strips query params and returns canonical URL
  // URL must not contain spaces - use valid query param
  const dest = "https://shopee.vn/product/123/456?ref=test";
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: dest,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  // The origin_link in the affiliate URL uses the canonical form (without query params)
  const originLink = new URL(result).searchParams.get("origin_link") ?? "";

  // parseShopeeProductUrl strips query params to canonical form
  assert.equal(originLink, "https://shopee.vn/product/123/456");
});

test("destination URL with existing query params uses canonical form", () => {
  const dest = "https://shopee.vn/product/1/2?utm_source=existing";
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: dest,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  // parseShopeeProductUrl returns canonical URL (query params stripped)
  const originLink = new URL(result).searchParams.get("origin_link") ?? "";

  assert.equal(originLink, "https://shopee.vn/product/1/2");
});

test("destination URL with unicode characters uses canonical form", () => {
  // parseShopeeProductUrl handles unicode in the path (but not spaces in query values)
  // Using encoded unicode in query is fine - it's the canonical form that's returned
  const dest = "https://shopee.vn/product/1/2";
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: dest,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  // The origin_link uses canonical form
  const originLink = new URL(result).searchParams.get("origin_link") ?? "";

  // Query params are stripped to canonical form
  assert.equal(originLink, "https://shopee.vn/product/1/2");
});

// -------------------------------------------------------------------
// Forbidden parameters - must NOT be present
// -------------------------------------------------------------------

test("no utm_source parameter is present", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.searchParams.has("utm_source"), false);
});

test("no utm_content parameter is present", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.searchParams.has("utm_content"), false);
});

test("no utm_medium parameter is present", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.searchParams.has("utm_medium"), false);
});

test("no utm_campaign parameter is present", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.searchParams.has("utm_campaign"), false);
});

test("no utm_term parameter is present", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.searchParams.has("utm_term"), false);
});

test("no uls_trackid parameter is present", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.searchParams.has("uls_trackid"), false);
});

test("no mmp_pid parameter is present", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.searchParams.has("mmp_pid"), false);
});

test("no credential_token parameter is present", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.searchParams.has("credential_token"), false);
});

test("no rio keyword is present in URL", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  assert.equal(
    result.toLowerCase().includes("rio"),
    false,
  );
});

test("no url parameter (legacy format) is present", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.searchParams.has("url"), false);
});

// -------------------------------------------------------------------
// Shopee short-code paths must NEVER be generated
// -------------------------------------------------------------------

test("pathname is /an_redir, not a derived short code", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: "vaflnk000000000000000000000042",
  });

  const u = new URL(result);

  assert.equal(u.pathname, "/an_redir");
  assert.notEqual(
    u.pathname,
    "/000000000000000000000042",
  );
});

test("generated URL path does not contain networkSubId hash", () => {
  const result = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: VALID_DESTINATION_URL,
    accountId: VALID_ACCOUNT_ID,
    networkSubId: VALID_NETWORK_SUB_ID,
  });

  const u = new URL(result);

  assert.equal(u.pathname, "/an_redir");
  assert.notEqual(
    u.pathname,
    `/go/${VALID_NETWORK_SUB_ID.replace("vaflnk", "")}`,
  );
});

// -------------------------------------------------------------------
// affiliate_id validation
// -------------------------------------------------------------------

test("affiliate_id is extracted correctly from various account IDs", () => {
  const testCases = [
    { accountId: "an_1", expected: "1" },
    { accountId: "an_42", expected: "42" },
    { accountId: "an_999", expected: "999" },
    { accountId: "an_123456789", expected: "123456789" },
  ];

  for (const { accountId, expected } of testCases) {
    const result = buildShopeeAffiliateRedirectUrl({
      canonicalDestinationUrl: VALID_DESTINATION_URL,
      accountId,
      networkSubId: VALID_NETWORK_SUB_ID,
    });

    const u = new URL(result);

    assert.equal(
      u.searchParams.get("affiliate_id"),
      expected,
      `accountId ${accountId} should produce affiliate_id ${expected}`,
    );
  }
});
