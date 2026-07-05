/**
 * Phase 20H.3b -- pure decision helpers for Shopee purchase-intent
 * persistence.
 *
 * The buyer handoff inside `initiateShopeePurchaseAction` ends with
 * the server returning `/go/<shortCode>`. Before that response leaves
 * the action boundary, we want one durable first-party record of the
 * handoff so that:
 *
 *  - downstream audit can answer "which Vaffiliate user / tracking
 *    link initiated this redirect"
 *  - Phase 20G.2a reconciliation can join intent rows to canonical
 *    conversions via `tracking_link_id` / `network_sub_id`
 *  - support can attribute abandoned or post-redirect failures to a
 *    specific buyer action
 *
 * These helpers do NOT touch the database. They classify the typed
 * data the action already validated and build a validated payload
 * the repository can persist. They also classify the typed
 * `persistence-failure` result that the action uses to abort the
 * redirect path.
 *
 * Reused from `shopee-persistence-decisions.ts`:
 *  - the same race-handling philosophy (typed update result + reload
 *    result) is mirrored here so the action layer's branching stays
 *    uniform across persistence steps.
 */

export type ShopeePurchaseIntentStatus =
  | "created"
  | "redirect_prepared"
  | "redirect_failed"
  | "persistence_failed";

export const SHOPEE_PURCHASE_INTENT_STATUSES: readonly ShopeePurchaseIntentStatus[] =
  Object.freeze([
    "created",
    "redirect_prepared",
    "redirect_failed",
    "persistence_failed",
  ]);

const NETWORK_SUB_ID_PATTERN = /^vaflnk[a-f0-9]{24}$/;
const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{10,32}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The immutable, server-derived fields we want to persist for one
 * buyer handoff attempt.
 *
 * Every field here is constructed by the server action from
 * already-validated server-side data. Nothing on this shape comes
 * from the buyer beyond the literal productUrl string they pasted,
 * and that string is stored verbatim in `originalProductUrl` -- not
 * re-derived or trusted.
 */
export interface ShopeePurchaseIntentPayload {
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
  /**
   * Server-validated quote snapshot. JSONB-serializable. The action
   * builds this from `resolveShopeeProductPreview` output -- which is
   * already server-side validated -- and stores it as an opaque
   * snapshot. The repository never treats this as a guarantee.
   */
  quoteSnapshot: ShopeePurchaseIntentQuoteSnapshot | null;
  status: ShopeePurchaseIntentStatus;
}

/**
 * Snapshot shape persisted to JSONB. Intentionally narrow and
 * serializable. The fields mirror the typed preview result so a
 * future audit query can answer "at intent time, what did the
 * preview show the buyer?" without re-fetching Shopee.
 *
 * Phase 20H.3d adds `commissionRateBps` as an additive nullable
 * field so audit can reconstruct why the buyer saw the estimate
 * they saw. Older rows with no `commissionRateBps` are tolerated
 * by the JSONB-tolerant repository and validator; new persistence
 * always writes a non-null `commissionRateBps` whenever
 * `status === "available"`.
 */
export interface ShopeePurchaseIntentQuoteSnapshot {
  status: "available" | "unavailable";
  cashbackShareBps: number | null;
  estimatedCashbackVnd: number | null;
  productPriceVnd: number | null;
  /**
   * Phase 20H.3d: Shopee commission rate captured at intent time.
   * Always present for newly written `available` snapshots. May be
   * `null` for `unavailable` snapshots or for historical rows
   * persisted before this field existed.
   */
  commissionRateBps?: number | null;
  reason: string | null;
  message: string | null;
  capturedAt: string;
}

export interface ShopeePurchaseIntentPayloadValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateShopeePurchaseIntentPayload(
  payload: ShopeePurchaseIntentPayload,
): ShopeePurchaseIntentPayloadValidationResult {
  const errors: string[] = [];

  if (!UUID_PATTERN.test(payload.publisherId.trim())) {
    errors.push("publisherId must be a uuid");
  }

  if (!UUID_PATTERN.test(payload.trackingLinkId.trim())) {
    errors.push("trackingLinkId must be a uuid");
  }

  if (!NETWORK_SUB_ID_PATTERN.test(payload.networkSubId.trim())) {
    errors.push(
      "networkSubId must match the pattern vaflnk[a-f0-9]{24}",
    );
  }

  if (!SHORT_CODE_PATTERN.test(payload.shortCode.trim())) {
    errors.push("shortCode must match the tracking-link short-code shape");
  }

  if (!payload.originalProductUrl.trim()) {
    errors.push("originalProductUrl must be a non-empty string");
  }

  if (!payload.canonicalProductUrl.trim()) {
    errors.push("canonicalProductUrl must be a non-empty string");
  }

  if (!payload.shopId.trim() || !/^[0-9]+$/.test(payload.shopId.trim())) {
    errors.push("shopId must be a non-empty ASCII digit string");
  }

  if (!payload.itemId.trim() || !/^[0-9]+$/.test(payload.itemId.trim())) {
    errors.push("itemId must be a non-empty ASCII digit string");
  }

  // campaign_id and offer_id follow the tracking_links classification-pair
  // invariant (either both null or both non-null). The repository
  // re-asserts this with a CHECK constraint; we surface a typed error
  // here so the action layer never ships a payload the DB will reject.
  const hasCampaign =
    typeof payload.campaignId === "string" &&
    payload.campaignId.trim().length > 0;
  const hasOffer =
    typeof payload.offerId === "string" &&
    payload.offerId.trim().length > 0;

  if (hasCampaign !== hasOffer) {
    errors.push(
      "campaignId and offerId must either both be null or both be non-empty",
    );
  }

  if (!payload.affiliateUrl.trim().startsWith("https://")) {
    errors.push("affiliateUrl must use HTTPS");
  }

  if (!SHOPEE_PURCHASE_INTENT_STATUSES.includes(payload.status)) {
    errors.push(`status must be one of: ${SHOPEE_PURCHASE_INTENT_STATUSES.join(", ")}`);
  }

  if (payload.quoteSnapshot !== null) {
    const q = payload.quoteSnapshot;
    if (q.status !== "available" && q.status !== "unavailable") {
      errors.push("quoteSnapshot.status must be 'available' or 'unavailable'");
    }
    if (q.capturedAt.trim().length === 0) {
      errors.push("quoteSnapshot.capturedAt must be a non-empty ISO string");
    }
    if (q.commissionRateBps !== undefined && q.commissionRateBps !== null) {
      if (
        typeof q.commissionRateBps !== "number" ||
        !Number.isInteger(q.commissionRateBps) ||
        !Number.isSafeInteger(q.commissionRateBps) ||
        q.commissionRateBps < 0 ||
        q.commissionRateBps > 10_000
      ) {
        errors.push(
          "quoteSnapshot.commissionRateBps must be null or an integer in [0, 10000]",
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Build a fully validated payload from action-validated inputs.
 *
 * This is a pure constructor -- it does no I/O. The action layer is
 * expected to have already produced the typed tracking-link result,
 * the typed product resolution, and the typed affiliate URL.
 */
export function buildShopeePurchaseIntentPayload(args: {
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
  status: ShopeePurchaseIntentStatus;
}): ShopeePurchaseIntentPayload {
  return {
    publisherId: args.publisherId.trim(),
    trackingLinkId: args.trackingLinkId.trim(),
    networkSubId: args.networkSubId.trim(),
    shortCode: args.shortCode.trim(),
    originalProductUrl: args.originalProductUrl.trim(),
    canonicalProductUrl: args.canonicalProductUrl.trim(),
    shopId: args.shopId.trim(),
    itemId: args.itemId.trim(),
    campaignId:
      typeof args.campaignId === "string" && args.campaignId.trim().length > 0
        ? args.campaignId.trim()
        : null,
    offerId:
      typeof args.offerId === "string" && args.offerId.trim().length > 0
        ? args.offerId.trim()
        : null,
    affiliateUrl: args.affiliateUrl.trim(),
    quoteSnapshot: args.quoteSnapshot,
    status: args.status,
  };
}

/**
 * Decision outcome for the intent persistence step.
 *
 * Mirrors the shape used by `shopee-persistence-decisions.ts` so the
 * action layer's branching stays uniform.
 */
export type ShopeePurchaseIntentPersistenceOutcome =
  | { action: "success"; payload: ShopeePurchaseIntentPayload }
  | { action: "failure"; message: string; failureReason: string };

/**
 * Build a snapshot from a typed preview result. Returns `null` when
 * the preview did not produce a usable quote (e.g. the user reached
 * the CTA without a quote -- still allowed). The repository stores
 * `null` for `quote_snapshot` in that case.
 *
 * Phase 20H.3d adds `commissionRateBps`. The argument is optional
 * for backward compatibility with callers that have not been
 * updated yet; if absent, the snapshot stores `null`. The
 * validator still tolerates both null and absent values.
 */
export function buildShopeePurchaseIntentQuoteSnapshot(args: {
  status: "available" | "unavailable";
  cashbackShareBps: number | null;
  estimatedCashbackVnd: number | null;
  productPriceVnd: number | null;
  commissionRateBps?: number | null;
  reason: string | null;
  message: string | null;
  capturedAt: string;
}): ShopeePurchaseIntentQuoteSnapshot {
  return {
    status: args.status,
    cashbackShareBps: args.cashbackShareBps,
    estimatedCashbackVnd: args.estimatedCashbackVnd,
    productPriceVnd: args.productPriceVnd,
    commissionRateBps:
      typeof args.commissionRateBps === "number"
        ? args.commissionRateBps
        : null,
    reason: args.reason,
    message: args.message,
    capturedAt: args.capturedAt.trim(),
  };
}