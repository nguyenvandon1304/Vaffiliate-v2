import "server-only";

import {
  buildShopeePurchaseIntentPayload,
  type ShopeePurchaseIntentQuoteSnapshot,
  type ShopeePurchaseIntentStatus,
} from "@/lib/cashback/shopee-purchase-intent-helper.runtime";

import {
  persistShopeePurchaseIntentAsync,
  type PersistedShopeePurchaseIntent,
} from "@/repositories/shopee-purchase-intent.repository";

/**
 * Service-layer boundary for Shopee buyer purchase intents.
 *
 * The server action calls into this service -- never into the
 * repository directly -- so:
 *
 *  - payload assembly lives in one place
 *  - the action stays a thin orchestrator
 *  - tests can stub the service without touching Drizzle
 *  - future quote-aware intent variants have a single hook to extend
 *
 * The runtime helper path (`shopee-purchase-intent-helper.runtime`)
 * is intentionally separate from the pure helper so a future test
 * can stub the pure module without dragging in the runtime wrapper.
 */

/**
 * Re-exported here so the server action does not need to import the
 * pure helper module separately. The runtime wrapper simply re-exports
 * the same types and constructors; it exists so the runtime boundary
 * for `server-only` modules is explicit and discoverable.
 */
export type { ShopeePurchaseIntentStatus };

export interface RecordShopeePurchaseIntentInput {
  publisherId: string;
  trackingLinkId: string;
  networkSubId: string;
  shortCode: string;
  originalProductUrl: string;
  canonicalProductUrl: string;
  shopId: string;
  itemId: string;
  campaignId: string | null;
  offerId: string | null;
  affiliateUrl: string;
  quoteSnapshot: ShopeePurchaseIntentQuoteSnapshot | null;
}

export type RecordShopeePurchaseIntentResult =
  | { ok: true; intent: PersistedShopeePurchaseIntent }
  | { ok: false; failureReason: string };

/**
 * Build a validated intent payload and persist it. Returns a typed
 * discriminated union so the action can branch without try/catch.
 *
 * Persistence failures are NOT raised here -- they are surfaced as
 * `{ ok: false, failureReason }` so the action can decide on the
 * buyer-facing copy without leaking the underlying error.
 *
 * Validation failures are still raised (the action must not catch a
 * programming bug silently), but the action catches them and
 * converts them to the same typed failure shape.
 */
export async function recordShopeePurchaseIntentAsync(
  input: RecordShopeePurchaseIntentInput,
  options: {
    status: ShopeePurchaseIntentStatus;
  },
): Promise<RecordShopeePurchaseIntentResult> {
  const payload = buildShopeePurchaseIntentPayload({
    publisherId: input.publisherId,
    trackingLinkId: input.trackingLinkId,
    networkSubId: input.networkSubId,
    shortCode: input.shortCode,
    originalProductUrl: input.originalProductUrl,
    canonicalProductUrl: input.canonicalProductUrl,
    shopId: input.shopId,
    itemId: input.itemId,
    campaignId: input.campaignId,
    offerId: input.offerId,
    affiliateUrl: input.affiliateUrl,
    quoteSnapshot: input.quoteSnapshot,
    status: options.status,
  });

  try {
    const intent = await persistShopeePurchaseIntentAsync(payload);
    return { ok: true, intent };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      failureReason:
        reason.length > 0
          ? reason.slice(0, 200)
          : "persistence_failed",
    };
  }
}