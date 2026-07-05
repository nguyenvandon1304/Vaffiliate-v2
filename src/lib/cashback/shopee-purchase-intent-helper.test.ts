import test from "node:test";
import assert from "node:assert/strict";

import {
  buildShopeePurchaseIntentPayload,
  buildShopeePurchaseIntentQuoteSnapshot,
  SHOPEE_PURCHASE_INTENT_STATUSES,
  validateShopeePurchaseIntentPayload,
} from "./shopee-purchase-persistence-helper";

const validPublisherId =
  "00000000-0000-4000-8000-000000000001";
const validTrackingLinkId =
  "00000000-0000-4000-8000-000000000002";
const validNetworkSubId =
  "vaflnk0000000000000000000001ab";
const validShortCode = "ci20h3bshortcode123";

function buildValidPayload() {
  return buildShopeePurchaseIntentPayload({
    publisherId: validPublisherId,
    trackingLinkId: validTrackingLinkId,
    networkSubId: validNetworkSubId,
    shortCode: validShortCode,
    originalProductUrl:
      "https://shopee.vn/some-slug-i.12345.67890",
    canonicalProductUrl:
      "https://shopee.vn/product/12345/67890",
    shopId: "12345",
    itemId: "67890",
    campaignId: null,
    offerId: null,
    affiliateUrl:
      "https://s.shopee.vn/an_redir?origin_link=https%3A%2F%2Fshopee.vn%2Fproduct%2F12345%2F67890&affiliate_id=123456&sub_id=" +
      validNetworkSubId +
      "-web-direct-na-na",
    quoteSnapshot: null,
    status: "redirect_prepared",
  });
}

test("valid payload passes validation", () => {
  const payload = buildValidPayload();
  const result = validateShopeePurchaseIntentPayload(payload);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("invalid publisherId is rejected", () => {
  const payload = buildValidPayload();
  const result = validateShopeePurchaseIntentPayload({
    ...payload,
    publisherId: "not-a-uuid",
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes("publisherId")),
  );
});

test("invalid networkSubId is rejected", () => {
  const payload = buildValidPayload();
  const result = validateShopeePurchaseIntentPayload({
    ...payload,
    networkSubId: "vaflnk-XX",
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes("networkSubId")),
  );
});

test("invalid shortCode is rejected", () => {
  const payload = buildValidPayload();
  const result = validateShopeePurchaseIntentPayload({
    ...payload,
    shortCode: "tooshort",
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes("shortCode")),
  );
});

test("invalid status is rejected", () => {
  const payload = buildValidPayload();
  // Bypass the type by widening to a string at runtime.
  const result = validateShopeePurchaseIntentPayload({
    ...payload,
    status: "made_up_status" as never,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("status")));
});

test("non-HTTPS affiliateUrl is rejected", () => {
  const payload = buildValidPayload();
  const result = validateShopeePurchaseIntentPayload({
    ...payload,
    affiliateUrl: "http://s.shopee.vn/an_redir?...",
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes("affiliateUrl")),
  );
});

test("non-digit shopId is rejected", () => {
  const payload = buildValidPayload();
  const result = validateShopeePurchaseIntentPayload({
    ...payload,
    shopId: "abc12",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("shopId")));
});

test("non-digit itemId is rejected", () => {
  const payload = buildValidPayload();
  const result = validateShopeePurchaseIntentPayload({
    ...payload,
    itemId: "12-34",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("itemId")));
});

test("campaign/offer pair must be both null or both populated", () => {
  const payload = buildValidPayload();
  const onlyCampaign = validateShopeePurchaseIntentPayload({
    ...payload,
    campaignId: "ci-20h3b-campaign",
    offerId: null,
  });
  assert.equal(onlyCampaign.ok, false);

  const onlyOffer = validateShopeePurchaseIntentPayload({
    ...payload,
    campaignId: null,
    offerId: "ci-20h3b-offer",
  });
  assert.equal(onlyOffer.ok, false);

  const both = validateShopeePurchaseIntentPayload({
    ...payload,
    campaignId: "ci-20h3b-campaign",
    offerId: "ci-20h3b-offer",
  });
  assert.equal(both.ok, true);
});

test("quote snapshot with valid status passes", () => {
  const payload = buildValidPayload();
  const result = validateShopeePurchaseIntentPayload({
    ...payload,
    quoteSnapshot: buildShopeePurchaseIntentQuoteSnapshot({
      status: "available",
      cashbackShareBps: 6000,
      estimatedCashbackVnd: 3000,
      productPriceVnd: 100000,
      reason: null,
      message: "ï½ cï½ thï½ng tin sï½n phï½m.",
      capturedAt: new Date().toISOString(),
    }),
  });
  assert.equal(result.ok, true);
});

test("quote snapshot with invalid status fails", () => {
  const payload = buildValidPayload();
  const result = validateShopeePurchaseIntentPayload({
    ...payload,
    quoteSnapshot: buildShopeePurchaseIntentQuoteSnapshot({
      // widening to never so the invalid literal reaches runtime
      status: "weird" as never,
      cashbackShareBps: null,
      estimatedCashbackVnd: null,
      productPriceVnd: null,
      reason: null,
      message: null,
      capturedAt: "2026-07-05T00:00:00.000Z",
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) =>
      e.includes("quoteSnapshot.status"),
    ),
  );
});

test("quote snapshot with empty capturedAt fails", () => {
  const payload = buildValidPayload();
  const result = validateShopeePurchaseIntentPayload({
    ...payload,
    quoteSnapshot: buildShopeePurchaseIntentQuoteSnapshot({
      status: "unavailable",
      cashbackShareBps: null,
      estimatedCashbackVnd: null,
      productPriceVnd: null,
      reason: "no_active_offer",
      message: "Hiï½n chï½a cï½ chï½ï½ng trï½nh.",
      capturedAt: "",
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) =>
      e.includes("quoteSnapshot.capturedAt"),
    ),
  );
});

test("SHOPEE_PURCHASE_INTENT_STATUSES contains all four statuses", () => {
  assert.equal(SHOPEE_PURCHASE_INTENT_STATUSES.length, 4);
  assert.ok(
    SHOPEE_PURCHASE_INTENT_STATUSES.includes("created"),
  );
  assert.ok(
    SHOPEE_PURCHASE_INTENT_STATUSES.includes(
      "redirect_prepared",
    ),
  );
  assert.ok(
    SHOPEE_PURCHASE_INTENT_STATUSES.includes(
      "redirect_failed",
    ),
  );
  assert.ok(
    SHOPEE_PURCHASE_INTENT_STATUSES.includes(
      "persistence_failed",
    ),
  );
});

test("buildShopeePurchaseIntentPayload trims string inputs", () => {
  const payload = buildShopeePurchaseIntentPayload({
    publisherId: "  " + validPublisherId + "  ",
    trackingLinkId: "  " + validTrackingLinkId + "  ",
    networkSubId: "  " + validNetworkSubId + "  ",
    shortCode: "  " + validShortCode + "  ",
    originalProductUrl: "  https://shopee.vn/x-i.1.2  ",
    canonicalProductUrl: "  https://shopee.vn/product/1/2  ",
    shopId: "  12345  ",
    itemId: "  67890  ",
    campaignId: null,
    offerId: null,
    affiliateUrl:
      "  https://s.shopee.vn/an_redir?x=1  ",
    quoteSnapshot: null,
    status: "created",
  });
  assert.equal(payload.publisherId, validPublisherId);
  assert.equal(payload.trackingLinkId, validTrackingLinkId);
  assert.equal(payload.networkSubId, validNetworkSubId);
  assert.equal(payload.shortCode, validShortCode);
  assert.equal(
    payload.originalProductUrl,
    "https://shopee.vn/x-i.1.2",
  );
  assert.equal(
    payload.canonicalProductUrl,
    "https://shopee.vn/product/1/2",
  );
  assert.equal(payload.shopId, "12345");
  assert.equal(payload.itemId, "67890");
  assert.equal(payload.status, "created");
});

test("buildShopeePurchaseIntentPayload treats blank campaign/offer as null", () => {
  const payload = buildShopeePurchaseIntentPayload({
    publisherId: validPublisherId,
    trackingLinkId: validTrackingLinkId,
    networkSubId: validNetworkSubId,
    shortCode: validShortCode,
    originalProductUrl: "https://shopee.vn/x-i.1.2",
    canonicalProductUrl: "https://shopee.vn/product/1/2",
    shopId: "1",
    itemId: "2",
    campaignId: "   ",
    offerId: "",
    affiliateUrl: "https://s.shopee.vn/an_redir?x=1",
    quoteSnapshot: null,
    status: "created",
  });
  assert.equal(payload.campaignId, null);
  assert.equal(payload.offerId, null);
});

test("no secret/token fields exist on the payload shape", () => {
  const payload = buildValidPayload();
  // Defense-in-depth: even if a future contributor adds a stray
  // field, the public payload shape must never carry credentials.
  const forbidden = [
    "accessToken",
    "refreshToken",
    "password",
    "sessionCookie",
    "ipHash",
    "userAgentHash",
  ];
  for (const key of forbidden) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(payload, key),
      false,
      `payload must not contain '${key}'`,
    );
  }
});

test(
  "Phase 20H.3d commissionRateBps is persisted by the snapshot constructor",
  () => {
    const snapshot = buildShopeePurchaseIntentQuoteSnapshot({
      status: "available",
      cashbackShareBps: 6000,
      estimatedCashbackVnd: 19380,
      productPriceVnd: 161500,
      commissionRateBps: 2000,
      reason: null,
      message: null,
      capturedAt: "2026-07-05T00:00:00.000Z",
    });
    assert.equal(snapshot.commissionRateBps, 2000);
    assert.equal(snapshot.estimatedCashbackVnd, 19380);
    assert.equal(snapshot.productPriceVnd, 161500);
  },
);

test(
  "Phase 20H.3d payload validator accepts commissionRateBps within range",
  () => {
    const payload = {
      ...buildValidPayload(),
      quoteSnapshot: buildShopeePurchaseIntentQuoteSnapshot({
        status: "available",
        cashbackShareBps: 6000,
        estimatedCashbackVnd: 19380,
        productPriceVnd: 161500,
        commissionRateBps: 2000,
        reason: null,
        message: null,
        capturedAt: new Date().toISOString(),
      }),
    };
    const result = validateShopeePurchaseIntentPayload(payload);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  },
);

test(
  "Phase 20H.3d payload validator rejects commissionRateBps outside range",
  () => {
    const payload = {
      ...buildValidPayload(),
      quoteSnapshot: buildShopeePurchaseIntentQuoteSnapshot({
        status: "available",
        cashbackShareBps: 6000,
        estimatedCashbackVnd: 19380,
        productPriceVnd: 161500,
        commissionRateBps: 15000,
        reason: null,
        message: null,
        capturedAt: new Date().toISOString(),
      }),
    };
    const result = validateShopeePurchaseIntentPayload(payload);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) =>
        e.includes("commissionRateBps"),
      ),
    );
  },
);

test(
  "Phase 20H.3d payload validator accepts absent commissionRateBps for backwards compatibility",
  () => {
    // Historical rows persisted before Phase 20H.3d have no
    // commissionRateBps field. The validator must tolerate that.
    const payload = {
      ...buildValidPayload(),
      quoteSnapshot: {
        status: "available" as const,
        cashbackShareBps: 6000,
        estimatedCashbackVnd: 19380,
        productPriceVnd: 161500,
        reason: null,
        message: null,
        capturedAt: new Date().toISOString(),
      },
    };
    const result = validateShopeePurchaseIntentPayload(payload);
    assert.equal(result.ok, true);
  },
);