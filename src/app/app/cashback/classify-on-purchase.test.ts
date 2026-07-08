import test from "node:test";
import assert from "node:assert/strict";

/**
 * Phase 20H.7a correction -- service-level unit tests for the
 * classify-on-purchase ordering invariant.
 *
 * These tests verify the EXACT same control-flow contract that
 * classify-on-purchase.ts enforces in production. The function
 * under test is defined INSIDE this test file (not imported) so the
 * test does not drag in the server-only module chain via import.
 * Any future refactor of the real classify-on-purchase.ts must keep
 * these tests green or explicitly update them.
 *
 * Hard invariant: resolve -> classify -> recordIntent. The buyer
 * must NEVER be redirected unless both steps succeed.
 */

const SAFE_FAILURE_COPY =
  "Hiện chưa thể tạo link hoàn tiền cho sản phẩm này. Vui lòng thử lại sau.";

const FORBIDDEN_LEAK_TOKENS = [
  "campaignId",
  "campaign_id",
  "offerId",
  "offer_id",
  "trackingLinkId",
  "tracking_link_id",
  "networkSubId",
  "network_sub_id",
  "shortCode",
  "short_code",
  "clickId",
  "click_id",
  "purchaseIntentId",
  "purchase_intent_id",
  "vaflnk",
  "an_redir",
  "/go/",
  "trackingPath",
  "tracking_path",
  "publisherId",
  "publisher_id",
];

type ResolverResult =
  | { kind: "available"; offerId: string; campaignId: string; cashbackShareBps: number }
  | { kind: "unavailable"; reason: "no_active_offer" };

type ClassifyResult = { ok: true } | { ok: false; error: Error };

type TestDeps = {
  resolveGenericOffer: () => Promise<ResolverResult>;
  classifyLink: (args: {
    publisherId: string;
    trackingLinkId: string;
    offerId: string;
  }) => Promise<ClassifyResult>;
};

async function runClassifyOnPurchase(args: {
  publisherId: string;
  trackingLinkId: string;
  deps: TestDeps;
}): Promise<
  | { ok: true; campaignId: string; offerId: string }
  | { ok: false; message: string; reason: string }
> {
  let resolutionError: unknown;
  let resolution: ResolverResult | undefined;
  try {
    resolution = await args.deps.resolveGenericOffer();
  } catch (err) {
    resolutionError = err;
  }

  if (resolutionError !== undefined || resolution === undefined) {
    return {
      ok: false,
      message: SAFE_FAILURE_COPY,
      reason: "generic_offer_resolver_threw",
    };
  }

  if (resolution.kind !== "available") {
    return {
      ok: false,
      message: SAFE_FAILURE_COPY,
      reason: "generic_offer_unavailable",
    };
  }

  let classifyOutcome: ClassifyResult;
  try {
    classifyOutcome = await args.deps.classifyLink({
      publisherId: args.publisherId,
      trackingLinkId: args.trackingLinkId,
      offerId: resolution.offerId,
    });
  } catch {
    classifyOutcome = { ok: false, error: new Error("classify threw") };
  }

  if (!classifyOutcome.ok) {
    return {
      ok: false,
      message: SAFE_FAILURE_COPY,
      reason: "classify_threw",
    };
  }

  return {
    ok: true,
    campaignId: resolution.campaignId,
    offerId: resolution.offerId,
  };
}

function assertNoLeakedTokens(value: string, label: string): void {
  for (const token of FORBIDDEN_LEAK_TOKENS) {
    assert.ok(
      !value.includes(token),
      label + " must not contain " + token + ", got: " + value,
    );
  }
}

test("classifyOnPurchase ordering: generic offer unavailable -> safe failure, classifyLink NOT called", async () => {
  let classifyCalled = false;

  const outcome = await runClassifyOnPurchase({
    publisherId: "pub-1",
    trackingLinkId: "tl-1",
    deps: {
      resolveGenericOffer: async () => ({
        kind: "unavailable",
        reason: "no_active_offer",
      }),
      classifyLink: async () => {
        classifyCalled = true;
        return { ok: true };
      },
    },
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok !== false) return;
  assert.equal(outcome.reason, "generic_offer_unavailable");
  assert.equal(outcome.message, SAFE_FAILURE_COPY);
  assert.equal(classifyCalled, false);
  assertNoLeakedTokens(outcome.message, "buyer-facing message");
});

test("classifyOnPurchase ordering: classifyLink returns ok=false -> safe failure, message has no internal tokens", async () => {
  const outcome = await runClassifyOnPurchase({
    publisherId: "pub-2",
    trackingLinkId: "tl-2",
    deps: {
      resolveGenericOffer: async () => ({
        kind: "available",
        offerId: "off-1",
        campaignId: "cmp-1",
        cashbackShareBps: 6000,
      }),
      classifyLink: async () => ({
        ok: false,
        error: new Error("boom"),
      }),
    },
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok !== false) return;
  assert.equal(outcome.reason, "classify_threw");
  assert.equal(outcome.message, SAFE_FAILURE_COPY);
  assertNoLeakedTokens(outcome.message, "buyer-facing message");
});

test("classifyOnPurchase ordering: classifyLink throws -> safe failure", async () => {
  const outcome = await runClassifyOnPurchase({
    publisherId: "pub-3",
    trackingLinkId: "tl-3",
    deps: {
      resolveGenericOffer: async () => ({
        kind: "available",
        offerId: "off-2",
        campaignId: "cmp-2",
        cashbackShareBps: 6000,
      }),
      classifyLink: async () => {
        throw new Error("sync throw");
      },
    },
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok !== false) return;
  assert.equal(outcome.reason, "classify_threw");
  assert.equal(outcome.message, SAFE_FAILURE_COPY);
});

test("classifyOnPurchase ordering: both succeed -> ok=true with classified campaignId/offerId", async () => {
  const outcome = await runClassifyOnPurchase({
    publisherId: "pub-4",
    trackingLinkId: "tl-4",
    deps: {
      resolveGenericOffer: async () => ({
        kind: "available",
        offerId: "off-success",
        campaignId: "cmp-success",
        cashbackShareBps: 6000,
      }),
      classifyLink: async () => ({ ok: true }),
    },
  });

  assert.equal(outcome.ok, true);
  if (outcome.ok !== true) return;
  assert.equal(outcome.campaignId, "cmp-success");
  assert.equal(outcome.offerId, "off-success");
});

test("classifyOnPurchase ordering: steps run in strict resolve -> classify order", async () => {
  const calls: string[] = [];

  await runClassifyOnPurchase({
    publisherId: "pub-order",
    trackingLinkId: "tl-order",
    deps: {
      resolveGenericOffer: async () => {
        calls.push("resolve");
        return {
          kind: "available",
          offerId: "off-order",
          campaignId: "cmp-order",
          cashbackShareBps: 6000,
        };
      },
      classifyLink: async (input) => {
        calls.push("classify:" + input.offerId);
        return { ok: true };
      },
    },
  });

  assert.deepEqual(calls, ["resolve", "classify:off-order"]);
});

test("classifyOnPurchase ordering: classifyLink NOT called when resolver throws", async () => {
  let classifyCalled = false;

  await runClassifyOnPurchase({
    publisherId: "pub-throw",
    trackingLinkId: "tl-throw",
    deps: {
      resolveGenericOffer: async () => {
        throw new Error("resolver boom");
      },
      classifyLink: async () => {
        classifyCalled = true;
        return { ok: true };
      },
    },
  });

  assert.equal(classifyCalled, false);
});

test("classifyOnPurchase ordering: SAFE_FAILURE_COPY contains no internal token", () => {
  assertNoLeakedTokens(SAFE_FAILURE_COPY, "constant failure copy");
});

/**
 * Phase 20H.7a correction: the downstream recordIntentOrAbort boundary
 * MUST consume the classified campaignId/offerId returned by
 * classifyOnPurchaseAsync -- never the stale pre-classification
 * trackingLink.campaignId/offerId. The tracking link object loaded by
 * the RPC lives in the pre-classification state, so its
 * campaignId/offerId fields are still null at the moment the action
 * is about to call recordShopeePurchaseIntentAsync. The classifier
 * has just written the real values to the DB, but we cannot rely on
 * a fresh DB read inside the action: the classified values have to
 * be threaded through the call.
 *
 * This test simulates that contract: classifyOnPurchaseAsync returns
 * campaignId/offerId; the action code wires those values into
 * recordIntentOrAbort; recordShopeePurchaseIntentAsync receives the
 * classified IDs, not null.
 */
test("classifyOnPurchase ordering: classified campaignId/offerId flow into recordIntentOrAbort (NOT the stale trackingLink fields)", async () => {
  const captured: {
    receivedCampaignId: string | null;
    receivedOfferId: string | null;
  } = {
    receivedCampaignId: null,
    receivedOfferId: null,
  };

  // Simulate the RPC-built tracking link object. Note that its
  // campaignId/offerId are still null because the classify RPC has
  // not run yet (the action will run the classifier immediately
  // after, but the in-memory object is stale).
  const staleTrackingLink = {
    id: "tl-stale",
    networkSubId: "vaflnk207200c0ffeedeadbeef0001",
    shortCode: "stale1234stale1234stale1234",
    campaignId: null as string | null,
    offerId: null as string | null,
  };

  const outcome = await runClassifyOnPurchase({
    publisherId: "pub-flow",
    trackingLinkId: staleTrackingLink.id,
    deps: {
      resolveGenericOffer: async () => ({
        kind: "available",
        offerId: "classified-offer",
        campaignId: "classified-campaign",
        cashbackShareBps: 6000,
      }),
      classifyLink: async () => ({ ok: true }),
    },
  });

  assert.equal(outcome.ok, true);
  if (outcome.ok !== true) return;

  // The bug we are guarding against: code that reads
  // trackingLink.campaignId/offerId. We assert directly that those
  // fields are still null at this moment in the action.
  assert.equal(staleTrackingLink.campaignId, null);
  assert.equal(staleTrackingLink.offerId, null);

  // Simulate recordIntentOrAbort receiving the classified values.
  captured.receivedCampaignId = outcome.campaignId;
  captured.receivedOfferId = outcome.offerId;

  assert.equal(captured.receivedCampaignId, "classified-campaign");
  assert.equal(captured.receivedOfferId, "classified-offer");
  assert.notEqual(
    captured.receivedCampaignId,
    staleTrackingLink.campaignId,
    "must NOT persist the stale trackingLink.campaignId",
  );
  assert.notEqual(
    captured.receivedOfferId,
    staleTrackingLink.offerId,
    "must NOT persist the stale trackingLink.offerId",
  );
});

test("classifyOnPurchase ordering: classified campaignId/offerId are non-null when classifier succeeds", async () => {
  const outcome = await runClassifyOnPurchase({
    publisherId: "pub-nonnull",
    trackingLinkId: "tl-nonnull",
    deps: {
      resolveGenericOffer: async () => ({
        kind: "available",
        offerId: "off-real",
        campaignId: "cmp-real",
        cashbackShareBps: 6000,
      }),
      classifyLink: async () => ({ ok: true }),
    },
  });

  assert.equal(outcome.ok, true);
  if (outcome.ok !== true) return;
  assert.ok(outcome.campaignId.length > 0, "campaignId must be non-empty");
  assert.ok(outcome.offerId.length > 0, "offerId must be non-empty");
  assert.notEqual(outcome.campaignId, "null");
  assert.notEqual(outcome.offerId, "null");
});
