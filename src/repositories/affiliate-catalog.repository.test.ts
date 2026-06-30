import test from "node:test";
import assert from "node:assert/strict";

import {
  interpretExistingClassification,
  ShopeeCatalogOfferInactiveError,
  ShopeeCatalogOfferNotFoundError,
  ShopeeCatalogTrackingLinkAlreadyClassifiedError,
  ShopeeCatalogTrackingLinkInconsistentClassificationError,
  ShopeeCatalogTrackingLinkNotFoundError,
  ShopeeOfferCatalogEntry,
  validateShopeeCatalogOffer,
} from "./affiliate-catalog.classifier";

// ---------------------------------------------------------------------------
// Error class shapes
// ---------------------------------------------------------------------------

test("ShopeeCatalogOfferNotFoundError carries offerId and has correct name", () => {
  const err = new ShopeeCatalogOfferNotFoundError("offer-abc");
  assert.equal(err.name, "ShopeeCatalogOfferNotFoundError");
  assert.equal(err.offerId, "offer-abc");
  assert.match(err.message, /offer-abc/);
});

test("ShopeeCatalogOfferInactiveError carries offerId, reason, and has correct name", () => {
  const err = new ShopeeCatalogOfferInactiveError(
    "offer-xyz",
    "cashback_policy_missing",
  );
  assert.equal(err.name, "ShopeeCatalogOfferInactiveError");
  assert.equal(err.offerId, "offer-xyz");
  assert.equal(err.reason, "cashback_policy_missing");
  assert.match(err.message, /offer-xyz/);
  assert.match(err.message, /cashback_policy_missing/);
});

test("ShopeeCatalogTrackingLinkNotFoundError carries trackingLinkId and has correct name", () => {
  const err = new ShopeeCatalogTrackingLinkNotFoundError("tl-123");
  assert.equal(err.name, "ShopeeCatalogTrackingLinkNotFoundError");
  assert.equal(err.trackingLinkId, "tl-123");
  assert.match(err.message, /tl-123/);
});

test("ShopeeCatalogTrackingLinkAlreadyClassifiedError carries all five fields", () => {
  const err = new ShopeeCatalogTrackingLinkAlreadyClassifiedError(
    "tl-1",
    "camp-old",
    "offer-old",
    "camp-new",
    "offer-new",
  );
  assert.equal(err.name, "ShopeeCatalogTrackingLinkAlreadyClassifiedError");
  assert.equal(err.trackingLinkId, "tl-1");
  assert.equal(err.existingCampaignId, "camp-old");
  assert.equal(err.existingOfferId, "offer-old");
  assert.equal(err.requestedCampaignId, "camp-new");
  assert.equal(err.requestedOfferId, "offer-new");
  assert.match(err.message, /tl-1/);
  assert.match(err.message, /camp-old/);
  assert.match(err.message, /offer-old/);
  assert.match(err.message, /camp-new/);
  assert.match(err.message, /offer-new/);
});

test("ShopeeCatalogTrackingLinkInconsistentClassificationError carries all three fields", () => {
  const err = new ShopeeCatalogTrackingLinkInconsistentClassificationError(
    "tl-9",
    "camp-half",
    null,
  );
  assert.equal(err.name, "ShopeeCatalogTrackingLinkInconsistentClassificationError");
  assert.equal(err.trackingLinkId, "tl-9");
  assert.equal(err.existingCampaignId, "camp-half");
  assert.equal(err.existingOfferId, null);
  assert.match(err.message, /tl-9/);
  assert.match(err.message, /camp-half/);
});

// ---------------------------------------------------------------------------
// interpretExistingClassification -- pure branching logic
// ---------------------------------------------------------------------------

test("NULL/NULL existing pair throws already-classified when requested pair is set", () => {
  // The (null, null) pair is normally handled by the caller before reaching
  // `interpretExistingClassification`. When it does reach here, the function
  // behaves defensively: (null, null) is not equal to a populated requested
  // pair, so it throws AlreadyClassified. This is a deliberate corner-case
  // behaviour, not a happy path.
  assert.throws(
    () =>
      interpretExistingClassification({
        trackingLinkId: "tl-1",
        existingCampaignId: null,
        existingOfferId: null,
        requestedCampaignId: "camp-1",
        requestedOfferId: "offer-1",
      }),
    ShopeeCatalogTrackingLinkAlreadyClassifiedError,
  );
});

test("campaign set / offer NULL throws inconsistent classification error", () => {
  assert.throws(
    () =>
      interpretExistingClassification({
        trackingLinkId: "tl-2",
        existingCampaignId: "camp-2",
        existingOfferId: null,
        requestedCampaignId: "camp-3",
        requestedOfferId: "offer-3",
      }),
    ShopeeCatalogTrackingLinkInconsistentClassificationError,
  );
});

test("campaign NULL / offer set throws inconsistent classification error", () => {
  assert.throws(
    () =>
      interpretExistingClassification({
        trackingLinkId: "tl-3",
        existingCampaignId: null,
        existingOfferId: "offer-4",
        requestedCampaignId: "camp-5",
        requestedOfferId: "offer-5",
      }),
    ShopeeCatalogTrackingLinkInconsistentClassificationError,
  );
});

test("same campaignId plus same offerId returns classified=false (idempotent)", () => {
  const result = interpretExistingClassification({
    trackingLinkId: "tl-same",
    existingCampaignId: "camp-a",
    existingOfferId: "offer-b",
    requestedCampaignId: "camp-a",
    requestedOfferId: "offer-b",
  });
  assert.equal(result.trackingLinkId, "tl-same");
  assert.equal(result.campaignId, "camp-a");
  assert.equal(result.offerId, "offer-b");
  assert.equal(result.classified, false);
});

test("different campaignId throws already-classified error", () => {
  assert.throws(
    () =>
      interpretExistingClassification({
        trackingLinkId: "tl-diff",
        existingCampaignId: "camp-old",
        existingOfferId: "offer-old",
        requestedCampaignId: "camp-new",
        requestedOfferId: "offer-old",
      }),
    ShopeeCatalogTrackingLinkAlreadyClassifiedError,
  );
});

test("different offerId throws already-classified error", () => {
  assert.throws(
    () =>
      interpretExistingClassification({
        trackingLinkId: "tl-diff2",
        existingCampaignId: "camp-same",
        existingOfferId: "offer-old",
        requestedCampaignId: "camp-same",
        requestedOfferId: "offer-new",
      }),
    ShopeeCatalogTrackingLinkAlreadyClassifiedError,
  );
});

test("both campaignId and offerId different throws already-classified error", () => {
  assert.throws(
    () =>
      interpretExistingClassification({
        trackingLinkId: "tl-both",
        existingCampaignId: "camp-x",
        existingOfferId: "offer-x",
        requestedCampaignId: "camp-y",
        requestedOfferId: "offer-y",
      }),
    ShopeeCatalogTrackingLinkAlreadyClassifiedError,
  );
});

// ---------------------------------------------------------------------------
// Integration-test gaps documented for future coverage
//
// - SELECT FOR UPDATE lock ordering requires real PostgreSQL
// - Concurrent classification race requires real PostgreSQL
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// validateShopeeCatalogOffer -- pure validation on locked snapshot
// ---------------------------------------------------------------------------

const validEntry: ShopeeOfferCatalogEntry = {
  offerId: "offer-valid",
  offerStatus: "active",
  campaignId: "camp-valid",
  campaignStatus: "active",
  advertiserId: "adv-valid",
  advertiserStatus: "active",
  advertiserPlatform: "shopee",
  cashbackShareBps: 6000,
};

test("validateShopeeCatalogOffer accepts a fully valid entry", () => {
  assert.doesNotThrow(() => validateShopeeCatalogOffer(validEntry));
});

test("validateShopeeCatalogOffer throws on missing cashback policy", () => {
  assert.throws(
    () =>
      validateShopeeCatalogOffer({
        ...validEntry,
        cashbackShareBps: null,
      }),
    ShopeeCatalogOfferInactiveError,
  );
  assert.throws(
    () =>
      validateShopeeCatalogOffer({
        ...validEntry,
        cashbackShareBps: undefined as unknown as number | null,
      }),
    ShopeeCatalogOfferInactiveError,
  );
});

test("validateShopeeCatalogOffer throws on disabled advertiser", () => {
  assert.throws(
    () =>
      validateShopeeCatalogOffer({
        ...validEntry,
        advertiserStatus: "disabled",
      }),
    ShopeeCatalogOfferInactiveError,
  );
});

test("validateShopeeCatalogOffer throws on non-shopee platform", () => {
  assert.throws(
    () =>
      validateShopeeCatalogOffer({
        ...validEntry,
        advertiserPlatform: "tiktok",
      }),
    ShopeeCatalogOfferInactiveError,
  );
});

test("validateShopeeCatalogOffer throws on inactive campaign", () => {
  assert.throws(
    () =>
      validateShopeeCatalogOffer({
        ...validEntry,
        campaignStatus: "paused",
      }),
    ShopeeCatalogOfferInactiveError,
  );
  assert.throws(
    () =>
      validateShopeeCatalogOffer({
        ...validEntry,
        campaignStatus: "disabled",
      }),
    ShopeeCatalogOfferInactiveError,
  );
});

test("validateShopeeCatalogOffer throws on inactive offer", () => {
  assert.throws(
    () =>
      validateShopeeCatalogOffer({
        ...validEntry,
        offerStatus: "paused",
      }),
    ShopeeCatalogOfferInactiveError,
  );
  assert.throws(
    () =>
      validateShopeeCatalogOffer({
        ...validEntry,
        offerStatus: "disabled",
      }),
    ShopeeCatalogOfferInactiveError,
  );
});

test("validateShopeeCatalogOffer throws on cashback_policy_missing before other checks", () => {
  // When cashback policy is missing, the error reason must be cashback_policy_missing
  // regardless of other entity states. This is intentional so the operator can
  // fix the catalog deterministically.
  try {
    validateShopeeCatalogOffer({
      ...validEntry,
      cashbackShareBps: null,
      advertiserStatus: "disabled",
      campaignStatus: "paused",
      offerStatus: "disabled",
    });
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof ShopeeCatalogOfferInactiveError);
    assert.equal(
      (err as ShopeeCatalogOfferInactiveError).reason,
      "cashback_policy_missing",
    );
  }
});

test("validateShopeeCatalogOffer exposes correct error reason values", () => {
  const cases: Array<{
    modify: Partial<ShopeeOfferCatalogEntry>;
    reason: "advertiser_disabled" | "advertiser_platform_mismatch" | "campaign_inactive" | "offer_inactive" | "cashback_policy_missing";
  }> = [
    { modify: { advertiserStatus: "disabled" }, reason: "advertiser_disabled" },
    { modify: { advertiserPlatform: "tiktok" }, reason: "advertiser_platform_mismatch" },
    { modify: { campaignStatus: "paused" }, reason: "campaign_inactive" },
    { modify: { offerStatus: "paused" }, reason: "offer_inactive" },
    { modify: { cashbackShareBps: null }, reason: "cashback_policy_missing" },
  ];

  for (const { modify, reason } of cases) {
    try {
      validateShopeeCatalogOffer({ ...validEntry, ...modify });
      assert.fail(`should have thrown for reason: ${reason}`);
    } catch (err) {
      assert.ok(err instanceof ShopeeCatalogOfferInactiveError);
      assert.equal(
        (err as ShopeeCatalogOfferInactiveError).reason,
        reason,
        `expected reason "${reason}"`,
      );
    }
  }
});

test("validateShopeeCatalogOffer passes for cashbackShareBps of 0", () => {
  // 0 bps is valid (platform keeps 100%)
  assert.doesNotThrow(() =>
    validateShopeeCatalogOffer({
      ...validEntry,
      cashbackShareBps: 0,
    }),
  );
});

test("validateShopeeCatalogOffer passes for cashbackShareBps of 10000", () => {
  // 10000 bps is valid (publisher gets 100%)
  assert.doesNotThrow(() =>
    validateShopeeCatalogOffer({
      ...validEntry,
      cashbackShareBps: 10_000,
    }),
  );
});
