import test from "node:test";
import assert from "node:assert/strict";
import { buildShopeeAffiliateRedirectUrl } from "./shopee-affiliate-url-builder";
import { decideNullPersistenceOutcome, decideExistingUrlOutcome } from "./shopee-persistence-decisions";

const ACCOUNT_ID = "an_123456";
const NETWORK_SUB_ID = "vaflnk0000000000000000000001ab";
const CANONICAL_URL = "https://shopee.vn/product/12345/67890";

function buildExpectedUrl() {
  return buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: CANONICAL_URL,
    accountId: ACCOUNT_ID,
    networkSubId: NETWORK_SUB_ID,
  });
}

test("21 NULL succeeds", () => {
  const url = buildExpectedUrl();
  const o = decideNullPersistenceOutcome(
    { updated: true },
    { found: false, affiliateUrl: null },
    url,
    "/track/abc123",
    "abc123"
  );
  assert.equal(o.action, "success");
});

test("22 race success", () => {
  const url = buildExpectedUrl();
  const o = decideNullPersistenceOutcome(
    { updated: false },
    { found: true, affiliateUrl: url },
    url,
    "/track/abc123",
    "abc123"
  );
  assert.equal(o.action, "success");
});

test("22 race null fail", () => {
  const url = buildExpectedUrl();
  const o = decideNullPersistenceOutcome(
    { updated: false },
    { found: true, affiliateUrl: null },
    url,
    "/track/abc123",
    "abc123"
  );
  assert.equal(o.action, "failure");
});

test("22 race diff fail", () => {
  const url = buildExpectedUrl();
  const o = decideNullPersistenceOutcome(
    { updated: false },
    { found: true, affiliateUrl: "x" },
    url,
    "/track/abc123",
    "abc123"
  );
  assert.equal(o.action, "failure");
});

test("24 exact success", async () => {
  const url = buildExpectedUrl();
  const o = await decideExistingUrlOutcome(
    url,
    url,
    async () => ({ valid: true }),
    NETWORK_SUB_ID,
    ACCOUNT_ID,
    CANONICAL_URL,
    "/track/abc123",
    "abc123"
  );
  assert.equal(o.action, "success");
});

test("23 diff fail", async () => {
  const url = buildExpectedUrl();
  const o = await decideExistingUrlOutcome(
    "x",
    url,
    async () => ({ valid: false, errorCode: "x", errorMessage: "x" }),
    NETWORK_SUB_ID,
    ACCOUNT_ID,
    CANONICAL_URL,
    "/track/abc123",
    "abc123"
  );
  assert.equal(o.action, "failure");
});

test("safe shape", () => {
  const s = {
    ok: false,
    message: "Cau hinh",
    shortCode: null as string | null,
    trackingPath: null as string | null,
    productUrl: null as string | null,
  };
  assert.equal(s.ok, false);
  assert.ok(!s.message.includes("SHOPEE"));
});
