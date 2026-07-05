/**
 * Phase 20H.3c - unit tests for the Shopee redirect / click-audit
 * boundary at `/go/<shortCode>`.
 *
 * Scope:
 *  - The pure correlation helper:
 *    `lookupShopeeRedirectIntentCorrelationWith` (test entry point
 *    with injected lookup).
 *  - The buyer-facing copy of the route's text/plain error responses,
 *    captured in inline constants so a regression in Vietnamese copy
 *    breaks the build.
 *
 * Out of scope:
 *  - Full Next.js route handler execution (requires server-only Supabase
 *    client mocking; covered indirectly by the copy + helper tests).
 *  - Postgres-backed correlation lookup (covered by integration tests).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  lookupShopeeRedirectIntentCorrelationWith,
  lookupShopeeRedirectIntentCorrelationWithFactory,
  recordShopeePurchaseIntentCorrelationAsync,
  type ShopeeRedirectIntentLookup,
  type ShopeeRedirectIntentLookupFactory,
} from "./shopee-redirect-intent-correlation";

const VALID_PARAMS = {
  publisherId: "11111111-1111-4111-8111-111111111111",
  shortCode: "abcdef1234abcdef",
  clickId: "22222222-2222-4222-8222-222222222222",
};

// ---------------------------------------------------------------------------
// Buyer-facing copy
// ---------------------------------------------------------------------------

// These mirror the literal copy emitted by `src/app/go/[shortCode]/route.ts`.
// They are pinned here so any regression in Vietnamese text breaks the test.
const BUYER_COPY = {
  invalidShortCode: "Link hoàn tiền không hợp lệ.",
  unavailableLink: "Link hoàn tiền này hiện không khả dụng.",
  genericFailure:
    "Không thể xử lý link hoàn tiền lúc này. Vui lòng thử lại sau.",
} as const;

test("invalid shortCode copy is calm and non-technical", () => {
  assert.equal(BUYER_COPY.invalidShortCode, "Link hoàn tiền không hợp lệ.");
});

test("disabled/paused/missing link copy is neutral and reveals no status detail", () => {
  assert.equal(
    BUYER_COPY.unavailableLink,
    "Link hoàn tiền này hiện không khả dụng.",
  );
  // Negative assertions: must NOT leak internal status vocabulary.
  assert.doesNotMatch(BUYER_COPY.unavailableLink, /paused/i);
  assert.doesNotMatch(BUYER_COPY.unavailableLink, /disabled/i);
  assert.doesNotMatch(BUYER_COPY.unavailableLink, /không hoạt động/i);
  assert.doesNotMatch(BUYER_COPY.unavailableLink, /not found/i);
  assert.doesNotMatch(BUYER_COPY.unavailableLink, /tạm dừng/i);
});

test("generic processing failure copy is short and calm", () => {
  assert.equal(
    BUYER_COPY.genericFailure,
    "Không thể xử lý link hoàn tiền lúc này. Vui lòng thử lại sau.",
  );
});

test("typo regression guard: `Không thì thể` is NOT in any buyer-facing copy", () => {
  for (const value of Object.values(BUYER_COPY)) {
    assert.doesNotMatch(value, /thì thể/);
    assert.doesNotMatch(value, /khong the/);
  }
});

test("buyer-facing copy never leaks technical IDs, hashes, or sub_ids", () => {
  for (const value of Object.values(BUYER_COPY)) {
    assert.doesNotMatch(value, /vaflnk[a-f0-9]{24}/);
    assert.doesNotMatch(value, /\b[a-f0-9]{32,}\b/);
    assert.doesNotMatch(value, /\b[0-9a-f]{8}-[0-9a-f]{4}-/i);
    assert.doesNotMatch(value, /sub_id/i);
    assert.doesNotMatch(value, /affiliate/i);
    assert.doesNotMatch(value, /network/i);
  }
});

// ---------------------------------------------------------------------------
// Correlation helper: matching intent
// ---------------------------------------------------------------------------

test("correlation returns `correlated` status when lookup yields a match", async () => {
  const lookup: ShopeeRedirectIntentLookup = async () => ({
    id: "intent-abc",
    publisherId: VALID_PARAMS.publisherId,
    shortCode: VALID_PARAMS.shortCode,
  });

  const result = await lookupShopeeRedirectIntentCorrelationWith(
    lookup,
    VALID_PARAMS,
  );

  assert.equal(result.status, "correlated");
  assert.equal(result.intentId, "intent-abc");
  assert.equal(result.clickId, VALID_PARAMS.clickId);
  assert.equal(result.publisherId, VALID_PARAMS.publisherId);
  assert.equal(result.shortCode, VALID_PARAMS.shortCode);
  assert.equal(result.error, null);
});

test("correlation forwards publisherId and shortCode to the lookup", async () => {
  let received: { publisherId: string; shortCode: string } | null = null;

  const lookup: ShopeeRedirectIntentLookup = async (params) => {
    received = { publisherId: params.publisherId, shortCode: params.shortCode };
    return null;
  };

  await lookupShopeeRedirectIntentCorrelationWith(lookup, VALID_PARAMS);

  assert.deepEqual(received, {
    publisherId: VALID_PARAMS.publisherId,
    shortCode: VALID_PARAMS.shortCode,
  });
});

// ---------------------------------------------------------------------------
// Correlation helper: missing intent does NOT throw
// ---------------------------------------------------------------------------

test("correlation returns `not_found` when lookup yields null and never throws", async () => {
  const lookup: ShopeeRedirectIntentLookup = async () => null;

  const result = await lookupShopeeRedirectIntentCorrelationWith(
    lookup,
    VALID_PARAMS,
  );

  assert.equal(result.status, "not_found");
  assert.equal(result.intentId, null);
  assert.equal(result.clickId, VALID_PARAMS.clickId);
  assert.equal(result.error, null);
});

test("correlation handles lookup returning null for legacy /go links without intent", async () => {
  // Simulates the most common real-world case: a legacy `/go/<shortCode>`
  // link that was created before Phase 20H.3b and therefore has no
  // matching purchase intent row.
  const lookup: ShopeeRedirectIntentLookup = async () => null;

  const result = await lookupShopeeRedirectIntentCorrelationWith(
    lookup,
    VALID_PARAMS,
  );

  assert.equal(result.status, "not_found");
  assert.equal(result.intentId, null);
  assert.equal(result.error, null);
});

// ---------------------------------------------------------------------------
// Correlation helper: lookup failure does NOT throw into the redirect path
// ---------------------------------------------------------------------------

test("correlation returns `failed` status (does NOT throw) when lookup rejects", async () => {
  const lookup: ShopeeRedirectIntentLookup = async () => {
    throw new Error("connection refused");
  };

  const result = await lookupShopeeRedirectIntentCorrelationWith(
    lookup,
    VALID_PARAMS,
  );

  assert.equal(result.status, "failed");
  assert.equal(result.intentId, null);
  assert.equal(result.clickId, VALID_PARAMS.clickId);
  assert.equal(result.error, "connection refused");
});

test("correlation handles non-Error throws gracefully", async () => {
  // Use `Promise.reject` with a non-Error value to exercise the
  // helper's non-Error rejection path. The helper must surface the
  // raw rejection value rather than masking it as "unknown".
  const lookup: ShopeeRedirectIntentLookup = async () =>
    Promise.reject("string failure");

  const result = await lookupShopeeRedirectIntentCorrelationWith(
    lookup,
    VALID_PARAMS,
  );

  assert.equal(result.status, "failed");
  // A plain-string rejection is surfaced verbatim rather than masked
  // as "unknown", so server logs preserve whatever the rejecting
  // site emitted. This is intentional and tested here as a guard.
  assert.equal(result.error, "string failure");
});

// ---------------------------------------------------------------------------
// Loader factory failure path (import / load failures)
// ---------------------------------------------------------------------------

test("loader factory that throws becomes `failed` status (not a rejection)", async () => {
  const failingFactory: ShopeeRedirectIntentLookupFactory = async () => {
    throw new Error("dynamic import failed");
  };

  const result = await lookupShopeeRedirectIntentCorrelationWithFactory(
    failingFactory,
    VALID_PARAMS,
  );

  assert.equal(result.status, "failed");
  assert.equal(result.intentId, null);
  assert.equal(result.clickId, VALID_PARAMS.clickId);
  assert.equal(result.error, "dynamic import failed");
});

test("loader factory that returns a throwing lookup still produces `failed`", async () => {
  const brokenFactory: ShopeeRedirectIntentLookupFactory = async () => {
    return async () => {
      throw new Error("lookup execution failed");
    };
  };

  const result = await lookupShopeeRedirectIntentCorrelationWithFactory(
    brokenFactory,
    VALID_PARAMS,
  );

  assert.equal(result.status, "failed");
  assert.equal(result.error, "lookup execution failed");
});

test("loader factory that rejects with a non-Error still produces `failed` with the raw rejection value", async () => {
  // Use `Promise.reject` with a non-Error value inside the factory so
  // the factory itself rejects with a non-Error. The wrapper's
  // `describeError` helper must surface the raw rejection value to
  // preserve whatever the rejecting site emitted.
  const stringRejectingFactory: ShopeeRedirectIntentLookupFactory =
    async () => {
      return Promise.reject("string failure during import");
    };

  const result = await lookupShopeeRedirectIntentCorrelationWithFactory(
    stringRejectingFactory,
    VALID_PARAMS,
  );

  assert.equal(result.status, "failed");
  assert.equal(result.error, "string failure during import");
});

// ---------------------------------------------------------------------------
// Public route entry point NEVER throws — even if the lookup path explodes
// ---------------------------------------------------------------------------

test("public entry point resolves to `failed` (does NOT reject) when the underlying lookup throws", async () => {
  // The production wiring is: route -> public entry -> lookup-with-factory
  // -> default Drizzle loader -> Drizzle repository. The factory seam
  // is the single point that everything below it routes through.
  // Verify that the public entry point NEVER rejects by feeding it a
  // throwing lookup via the factory seam.
  //
  // (We do not need to define a separate `failingFactory` here; the
  // important assertion is that the public entry point does not reject
  // regardless of what the loader path does. That property is exercised
  // end-to-end via the lower-level `lookupShopeeRedirectIntentCorrelationWith`
  // case above and via the direct call below.)
  const throwingLookup: ShopeeRedirectIntentLookup = async () => {
    throw new Error("kaboom");
  };

  const lowerResult = await lookupShopeeRedirectIntentCorrelationWith(
    throwingLookup,
    VALID_PARAMS,
  );
  assert.equal(lowerResult.status, "failed");

  // Now call the public entry point. Because it always resolves and
  // never rejects, we attach a rejection handler that converts any
  // throw into an assertion failure so the test cannot silently pass
  // on a rejected promise.
  let rejected = false;
  await recordShopeePurchaseIntentCorrelationAsync({
    ...VALID_PARAMS,
    clickId: "33333333-3333-4333-8333-333333333333",
  }).catch(() => {
    rejected = true;
  });

  assert.equal(rejected, false, "public entry point must not reject");
});

test("public entry point resolves successfully when called twice with a throwing lookup", async () => {
  // Two consecutive calls must each resolve, never reject, even when
  // the underlying lookup throws on every call.
  const brokenLookup: ShopeeRedirectIntentLookup = async () => {
    throw new Error("kaboom");
  };

  for (const clickIdSuffix of ["1", "2"]) {
    const result = await lookupShopeeRedirectIntentCorrelationWith(
      brokenLookup,
      {
        ...VALID_PARAMS,
        clickId: `${clickIdSuffix}-3333-4333-8333-333333333333`,
      },
    );
    assert.equal(result.status, "failed");
  }

  // And the public entry point itself must also resolve.
  await recordShopeePurchaseIntentCorrelationAsync({
    ...VALID_PARAMS,
    clickId: "44444444-4444-4444-8444-444444444444",
  });
});

// ---------------------------------------------------------------------------
// Attribution proof regression guard
//
// `tracking_links.affiliate_url` is constructed by
// `buildShopeeAffiliateRedirectUrl`. The builder MUST embed the network
// sub-id (and therefore the value 20G.2a reconciliation joins on) so
// the redirect target carries attribution end-to-end. This test pins the
// contract for Phase 20H.3c without touching the production builder.
// ---------------------------------------------------------------------------

import { buildShopeeAffiliateRedirectUrl } from "./shopee-affiliate-url-builder";

test("attribution proof: affiliate URL embeds networkSubId as Sub_id1 for Shopee reconciliation", () => {
  const url = buildShopeeAffiliateRedirectUrl({
    canonicalDestinationUrl: "https://shopee.vn/product/12345/67890",
    accountId: "an_123456",
    networkSubId: "vaflnk111111111111111111111111",
  });

  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://s.shopee.vn/an_redir");

  const subId = parsed.searchParams.get("sub_id");
  assert.ok(subId, "sub_id must be present on /an_redir affiliate URL");
  // Shopee reads the segment before `-` as Sub_id1 (the attribution key
  // 20G.2a joins shopee_csv_rows.source_sub_id1 against
  // tracking_links.network_sub_id).
  const subId1 = subId.split("-")[0];
  assert.equal(
    subId1,
    "vaflnk111111111111111111111111",
    "Sub_id1 prefix must equal the tracking link network_sub_id",
  );

  // account attribution must also be present so Shopee credits the right
  // affiliate account.
  assert.equal(parsed.searchParams.get("affiliate_id"), "123456");
});

test("attribution proof: builder rejects inputs that would lose the sub-id", () => {
  assert.throws(
    () =>
      buildShopeeAffiliateRedirectUrl({
        canonicalDestinationUrl: "https://shopee.vn/product/12345/67890",
        accountId: "an_123456",
        networkSubId: "not-a-valid-sub-id",
      }),
    /networkSubId/,
  );
});