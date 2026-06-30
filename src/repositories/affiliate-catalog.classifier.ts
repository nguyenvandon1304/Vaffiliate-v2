/**
 * Classification state machine for the Shopee catalog.
 *
 * Pure helpers plus error classes that have no Drizzle or database
 * dependency. Imported by `affiliate-catalog.repository.ts` at the
 * classification call site and by the standalone unit tests, so that
 * the branching logic can be verified without a live PostgreSQL
 * connection.
 *
 * If you are tempted to add `db` calls here, do not: this module must
 * stay testable via `node --import tsx --test`.
 */

export type ShopeeCatalogInactiveReason =
  | "advertiser_disabled"
  | "advertiser_platform_mismatch"
  | "campaign_inactive"
  | "offer_inactive"
  | "cashback_policy_missing"
  | "cashback_policy_invalid";

/**
 * Input type fed by callers (repository lock-and-load helpers) before
 * validation. `advertiserPlatform` is a plain `string` and `cashbackShareBps`
 * may be `null` because they come directly from the database row.
 */
export interface ShopeeOfferCatalogEntry {
  offerId: string;
  offerStatus: string;
  campaignId: string;
  campaignStatus: string;
  advertiserId: string;
  advertiserStatus: string;
  advertiserPlatform: string;
  cashbackShareBps: number | null;
}

/**
 * Active, fully-typed catalog offer produced by {@link validateShopeeCatalogOffer}.
 *
 * Extends `ShopeeOfferCatalogEntry` so the type predicate `asserts entry is
 * ActiveShopeeCatalogOffer` is valid: the asserted type must be assignable
 * to (not narrower than) the parameter type. TypeScript narrows
 * `advertiserPlatform` to the literal `"shopee"` and `cashbackShareBps`
 * to `number` after the assertion succeeds, so callers never need to
 * handle null or re-check the platform.
 */
export interface ActiveShopeeCatalogOffer extends ShopeeOfferCatalogEntry {
  advertiserPlatform: "shopee";
  cashbackShareBps: number;
}

/**
 * Validates a locked catalog entry against Shopee eligibility rules and
 * narrows its types in place.
 *
 * Unlike the previous {@link validateShopeeCatalogOffer} overload, this
 * function is an assertion — it either returns the input narrowed to
 * `ActiveShopeeCatalogOffer` (where `advertiserPlatform` is the literal
 * `"shopee"` and `cashbackShareBps` is guaranteed to be `number`) or it
 * throws `ShopeeCatalogOfferInactiveError` with a precise reason so the
 * caller can tell data-quality issues apart from intentional catalog pauses.
 *
 * Cashback policy checks enforced here mirror the database CHECK constraint
 * on `cashback_policies.cashback_share_bps` so TypeScript fails fast in
 * the application layer before a bad row reaches the database.
 */
export function validateShopeeCatalogOffer(
  entry: ShopeeOfferCatalogEntry,
): asserts entry is ActiveShopeeCatalogOffer {
  if (entry.cashbackShareBps === null || entry.cashbackShareBps === undefined) {
    throw new ShopeeCatalogOfferInactiveError(
      entry.offerId,
      "cashback_policy_missing",
    );
  }

  if (
    typeof entry.cashbackShareBps !== "number" ||
    !Number.isFinite(entry.cashbackShareBps) ||
    !Number.isSafeInteger(entry.cashbackShareBps) ||
    entry.cashbackShareBps < 0 ||
    entry.cashbackShareBps > 10_000
  ) {
    throw new ShopeeCatalogOfferInactiveError(
      entry.offerId,
      "cashback_policy_invalid",
    );
  }

  if (entry.advertiserStatus !== "active") {
    throw new ShopeeCatalogOfferInactiveError(
      entry.offerId,
      "advertiser_disabled",
    );
  }

  if (entry.advertiserPlatform !== "shopee") {
    throw new ShopeeCatalogOfferInactiveError(
      entry.offerId,
      "advertiser_platform_mismatch",
    );
  }

  if (entry.campaignStatus !== "active") {
    throw new ShopeeCatalogOfferInactiveError(
      entry.offerId,
      "campaign_inactive",
    );
  }

  if (entry.offerStatus !== "active") {
    throw new ShopeeCatalogOfferInactiveError(
      entry.offerId,
      "offer_inactive",
    );
  }
}

export interface ShopeeCatalogTrackingLinkAlreadyClassifiedSnapshot {
  trackingLinkId: string;
  existingCampaignId: string | null;
  existingOfferId: string | null;
  requestedCampaignId: string;
  requestedOfferId: string;
}

export interface ClassifyShopeeTrackingLinkResult {
  trackingLinkId: string;
  campaignId: string;
  offerId: string;
  classified: boolean;
}

export class ShopeeCatalogOfferNotFoundError extends Error {
  constructor(public readonly offerId: string) {
    super(`Active Shopee offer "${offerId}" was not found in the catalog.`);
    this.name = "ShopeeCatalogOfferNotFoundError";
  }
}

export class ShopeeCatalogOfferInactiveError extends Error {
  constructor(
    public readonly offerId: string,
    public readonly reason: ShopeeCatalogInactiveReason,
  ) {
    super(
      `Shopee offer "${offerId}" is not eligible for classification: ${reason}.`,
    );
    this.name = "ShopeeCatalogOfferInactiveError";
  }
}

export class ShopeeCatalogTrackingLinkNotFoundError extends Error {
  constructor(public readonly trackingLinkId: string) {
    super(`Tracking link "${trackingLinkId}" was not found for this publisher.`);
    this.name = "ShopeeCatalogTrackingLinkNotFoundError";
  }
}

export class ShopeeCatalogTrackingLinkAlreadyClassifiedError extends Error {
  public readonly trackingLinkId: string;
  public readonly existingCampaignId: string | null;
  public readonly existingOfferId: string | null;
  public readonly requestedCampaignId: string;
  public readonly requestedOfferId: string;

  constructor(
    trackingLinkId: string,
    existingCampaignId: string | null,
    existingOfferId: string | null,
    requestedCampaignId: string,
    requestedOfferId: string,
  ) {
    super(
      `Tracking link "${trackingLinkId}" is already classified to a different catalog entry (campaign=${existingCampaignId} offer=${existingOfferId}); cannot re-classify to campaign=${requestedCampaignId} offer=${requestedOfferId}.`,
    );
    this.name = "ShopeeCatalogTrackingLinkAlreadyClassifiedError";
    this.trackingLinkId = trackingLinkId;
    this.existingCampaignId = existingCampaignId;
    this.existingOfferId = existingOfferId;
    this.requestedCampaignId = requestedCampaignId;
    this.requestedOfferId = requestedOfferId;
  }
}

export class ShopeeCatalogTrackingLinkInconsistentClassificationError extends Error {
  constructor(
    public readonly trackingLinkId: string,
    public readonly existingCampaignId: string | null,
    public readonly existingOfferId: string | null,
  ) {
    super(
      `Tracking link "${trackingLinkId}" has inconsistent classification columns (campaign=${existingCampaignId} offer=${existingOfferId}); exactly both or exactly neither must be set.`,
    );
    this.name = "ShopeeCatalogTrackingLinkInconsistentClassificationError";
  }
}

/**
 * Classifies an existing classification result against the requested pair.
 *
 * Pure branching logic — exported so the unit tests can verify each
 * state independently of any database.
 */
export function interpretExistingClassification(
  snapshot: ShopeeCatalogTrackingLinkAlreadyClassifiedSnapshot,
): ClassifyShopeeTrackingLinkResult {
  const {
    trackingLinkId,
    existingCampaignId,
    existingOfferId,
    requestedCampaignId,
    requestedOfferId,
  } = snapshot;

  const hasCampaign = existingCampaignId !== null;
  const hasOffer = existingOfferId !== null;

  if (hasCampaign !== hasOffer) {
    throw new ShopeeCatalogTrackingLinkInconsistentClassificationError(
      trackingLinkId,
      existingCampaignId,
      existingOfferId,
    );
  }

  if (
    existingCampaignId === requestedCampaignId &&
    existingOfferId === requestedOfferId
  ) {
    return {
      trackingLinkId,
      campaignId: requestedCampaignId,
      offerId: requestedOfferId,
      classified: false,
    };
  }

  throw new ShopeeCatalogTrackingLinkAlreadyClassifiedError(
    snapshot.trackingLinkId,
    snapshot.existingCampaignId,
    snapshot.existingOfferId,
    snapshot.requestedCampaignId,
    snapshot.requestedOfferId,
  );
}
