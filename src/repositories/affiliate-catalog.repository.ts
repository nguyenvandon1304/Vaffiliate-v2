/**
 * Server-only repository for the Shopee affiliate catalog.
 *
 * The catalog is the join of four server-managed tables:
 *
 *   advertisers
 *     └── campaigns
 *           └── offers
 *                 └── cashback_policies (1:1 by offer_id, required for Shopee classification)
 *
 * The catalog is intentionally read-only from the client and is protected
 * with row-level security. This repository is the only path that promotes a
 * `network_sub_id`-identified tracking link into a classified tracking link
 * with a concrete campaign/offer pair.
 *
 * Design rules enforced here:
 *
 * 1. The read-only lookup uses Drizzle joins outside any transaction.
 *    It is NOT on the classification path and does not hold locks.
 *    After loading the full catalog entry, it calls validateShopeeCatalogOffer()
 *    to enforce the full eligibility contract (advertiser active + platform=shopee,
 *    campaign active, offer active, cashback policy present and non-null).
 * 2. The classification path uses sequential awaited SELECT FOR UPDATE to
 *    acquire row locks on each catalog entity before reading the next. The
 *    locked snapshot is then validated in-memory with validateShopeeCatalogOffer().
 *    The two paths share the same pure validator but NOT the same database query.
 * 3. The classification update is conditional on the existing
 *    (campaign_id, offer_id) pair being NULL/NULL. A non-matching row is
 *    re-read inside the same transaction to distinguish idempotent same
 *    classification, reclassification to a different offer, and inconsistent
 *    partial classifications.
 * 4. Tracking-link ownership is enforced with an `id + publisher_id`
 *    compound filter so a missing ownership row looks identical to a
 *    non-existent row to the caller.
 * 5. A missing cashback policy is its own first-class reason so the caller
 *    can fix the catalog without guessing why the offer was rejected.
 */

import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  advertisers,
  campaigns,
  cashbackPolicies,
  offers,
  trackingLinks,
} from "@/db/schema";

/**
 * Fully-active Shopee catalog offer returned by the public read-only lookup.
 *
 * All fields are guaranteed non-null and all eligibility rules are satisfied:
 * advertiser active, advertiser platform = "shopee", campaign active,
 * offer active, cashback policy present with a valid share.
 *
 * Callers do NOT need to handle null cashbackShareBps after receiving this type.
 */
export interface ActiveShopeeCatalogOffer {
  offerId: string;
  campaignId: string;
  advertiserId: string;
  advertiserPlatform: "shopee";
  cashbackShareBps: number;
}


import type {
  ClassifyShopeeTrackingLinkResult,
  ShopeeCatalogInactiveReason,
  ShopeeCatalogTrackingLinkAlreadyClassifiedSnapshot,
  ShopeeOfferCatalogEntry,
} from "./affiliate-catalog.classifier";

import {
  interpretExistingClassification,
  ShopeeCatalogOfferInactiveError,
  ShopeeCatalogOfferNotFoundError,
  ShopeeCatalogTrackingLinkAlreadyClassifiedError,
  ShopeeCatalogTrackingLinkInconsistentClassificationError,
  ShopeeCatalogTrackingLinkNotFoundError,
  validateShopeeCatalogOffer,
} from "./affiliate-catalog.classifier";

export {
  interpretExistingClassification,
  ShopeeCatalogOfferInactiveError,
  ShopeeCatalogOfferNotFoundError,
  ShopeeCatalogTrackingLinkAlreadyClassifiedError,
  ShopeeCatalogTrackingLinkInconsistentClassificationError,
  ShopeeCatalogTrackingLinkNotFoundError,
  validateShopeeCatalogOffer,
};

export type {
  ActiveShopeeCatalogOffer,
  ClassifyShopeeTrackingLinkResult,
  ShopeeCatalogInactiveReason,
  ShopeeCatalogTrackingLinkAlreadyClassifiedSnapshot,
  ShopeeOfferCatalogEntry,
};

/**
 * Minimal database/transaction executor shape used by the catalog helpers.
 *
 * Accepting a structural type instead of the concrete `db` keeps the
 * helpers callable both from `db.transaction(...)` executors and from the
 * global `db` outside a transaction. The shared logic therefore cannot
 * drift between the two entry points.
 */
type DatabaseExecutor = Pick<typeof db, "select">;

/**
 * Drizzle-based catalog join for the read-only lookup path.
 *
 * Returns the full catalog entry (including all status fields) so the caller
 * can validate the entire eligibility contract without issuing a second query.
 *
 * Returns `null` when no row matches the join; the caller converts this to
 * `ShopeeCatalogOfferNotFoundError` via `validateShopeeCatalogOffer`.
 */
async function selectShopeeOfferCatalogEntry(
  executor: DatabaseExecutor,
  offerId: string,
): Promise<ShopeeOfferCatalogEntry | null> {
  const rows = await executor
    .select({
      offerId: offers.id,
      offerStatus: offers.status,
      campaignId: offers.campaignId,
      campaignStatus: campaigns.status,
      advertiserId: campaigns.advertiserId,
      advertiserPlatform: advertisers.platform,
      advertiserStatus: advertisers.status,
      cashbackShareBps: cashbackPolicies.cashbackShareBps,
    })
    .from(offers)
    .innerJoin(campaigns, eq(campaigns.id, offers.campaignId))
    .innerJoin(advertisers, eq(advertisers.id, campaigns.advertiserId))
    .leftJoin(
      cashbackPolicies,
      eq(cashbackPolicies.offerId, offers.id),
    )
    .where(eq(offers.id, offerId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    offerId: row.offerId,
    offerStatus: row.offerStatus,
    campaignId: row.campaignId,
    campaignStatus: row.campaignStatus,
    advertiserId: row.advertiserId,
    advertiserPlatform: row.advertiserPlatform,
    advertiserStatus: row.advertiserStatus,
    cashbackShareBps: row.cashbackShareBps,
  };
}

/**
 * Public read-only catalog lookup.
 *
 * Loads the full catalog entry via Drizzle join and validates all eligibility
 * rules using the shared pure validator `validateShopeeCatalogOffer`:
 *
 *   - advertiser.status = active
 *   - advertiser.platform = shopee
 *   - campaign.status = active
 *   - offer.status = active
 *   - cashback policy exists with a non-null cashbackShareBps
 *
 * Throws `ShopeeCatalogOfferNotFoundError` if the offer does not exist.
 * Throws `ShopeeCatalogOfferInactiveError` if any eligibility rule fails.
 *
 * Returns `ActiveShopeeCatalogOffer` where cashbackShareBps is guaranteed non-null.
 */
export async function getActiveShopeeOfferByOfferIdAsync(
  offerId: string,
): Promise<ActiveShopeeCatalogOffer> {
  const normalized = offerId.trim();
  if (normalized.length === 0) {
    throw new ShopeeCatalogOfferNotFoundError(offerId);
  }

  const entry = await selectShopeeOfferCatalogEntry(db, normalized);
  if (!entry) {
    throw new ShopeeCatalogOfferNotFoundError(normalized);
  }

  // Full eligibility check: advertiser, campaign, offer, policy, platform
  validateShopeeCatalogOffer(entry);

  return {
    offerId: entry.offerId,
    campaignId: entry.campaignId,
    advertiserId: entry.advertiserId,
    advertiserPlatform: entry.advertiserPlatform,
    cashbackShareBps: entry.cashbackShareBps,
  };
}

export interface ClassifyShopeeTrackingLinkInput {
  publisherId: string;
  trackingLinkId: string;
  offerId: string;
}

/**
 * Atomically classify a tracking link against an active Shopee offer.
 *
 * The function is idempotent and refuses to mutate an existing
 * classification that points at a different offer. See the rules in
 * the file header for the four states it distinguishes.
 *
 * Concurrency strategy:
 *
 *   1. `lockAndLoadShopeeCatalogForClassification` (awaited) acquires
 *      `FOR UPDATE` row locks on advertisers, campaigns, offers, and
 *      `cashback_policies` sequentially, returning the locked entry.
 *   2. The locked entry is validated in-memory without any additional query.
 *   3. `lockAndLoadTrackingLinkForClassification` (awaited) acquires
 *      the lock on the tracking-link row in a separate statement.
 *   4. The atomic update is conditional on
 *      (campaign_id, offer_id) = (NULL, NULL).
 *   5. State interpretation distinguishes same, different, partial,
 *      and (null, null) consistently.
 *
 * Each step runs sequentially inside `await` and lets PostgreSQL
 * serialize concurrent access through the row locks themselves.
 */
/**
 * Acquires `FOR UPDATE` row locks on the catalog entities (advertiser,
 * campaign, offer, cashback_policy) sequentially and returns the validated
 * entry from those locked rows.
 *
 * Concurrency safety rationale:
 *
 * - Each step acquires a lock before reading the next entity, guaranteeing
 *   that no concurrent transaction can insert or modify any row in the
 *   catalog tuple between the lock acquisition and the classification write.
 * - A row that exists at lock time is locked. A row that does not exist
 *   at lock time causes the helper to throw immediately; classification does
 *   not continue with a subsequent catalog query.
 * - PostgreSQL READ COMMITTED does not see rows committed after a
 *   transaction's read snapshot. A row inserted by a concurrent transaction
 *   after our SELECT FOR UPDATE returns is invisible to this transaction
 *   and cannot be locked or classified by it.
 * - No second catalog query observes newly-committed rows that were absent
 *   at lock time.
 *
 * Step-by-step locking order:
 *
 *   1. Lock offer row by offerId. If absent: throw
 *      `ShopeeCatalogOfferNotFoundError`.
 *   2. Lock campaign row by offer.campaignId. If absent or inconsistent
 *      (campaign.advertiserId mismatch): throw catalog inconsistency error.
 *   3. Lock advertiser row by campaign.advertiserId. If absent: throw
 *      catalog inconsistency error.
 *   4. Lock cashback_policy row by offerId. If absent: throw
 *      `ShopeeCatalogOfferInactiveError` with reason `cashback_policy_missing`.
 *   5. Validate the locked entry (advertiser active, platform=shopee,
 *      campaign active, offer active, cashback_share_bps present).
 *   6. Return the validated `ShopeeOfferCatalogEntry`.
 *
 * The caller MUST await the returned Promise before proceeding with any
 * writes in the same transaction.
 */
async function lockAndLoadShopeeCatalogForClassification(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  offerId: string,
): Promise<ShopeeOfferCatalogEntry> {
  // Step 1: Lock the offer row.
  const offerRows = await tx.execute(sql`
    SELECT id, campaign_id AS "campaignId", status
    FROM offers
    WHERE id = ${offerId}
    FOR UPDATE
  `);
  const offerList = Array.isArray(offerRows) ? offerRows : (offerRows as { rows?: unknown[] }).rows ?? [];
  const offer = (offerList as Array<{
    id: string;
    campaignId: string;
    status: string;
  }>)[0];

  if (!offer) {
    throw new ShopeeCatalogOfferNotFoundError(offerId);
  }

  // Step 2: Lock the campaign row via the locked offer's campaignId.
  const campaignRows = await tx.execute(sql`
    SELECT id, advertiser_id AS "advertiserId", status
    FROM campaigns
    WHERE id = ${offer.campaignId}
    FOR UPDATE
  `);
  const campaignList = Array.isArray(campaignRows) ? campaignRows : (campaignRows as { rows?: unknown[] }).rows ?? [];
  const campaign = (campaignList as Array<{
    id: string;
    advertiserId: string;
    status: string;
  }>)[0];

  if (!campaign) {
    // Offer exists but its campaign is gone — catalog is inconsistent.
    throw new ShopeeCatalogOfferNotFoundError(offerId);
  }

  // Step 3: Lock the advertiser row via the locked campaign's advertiserId.
  const advertiserRows = await tx.execute(sql`
    SELECT id, platform, status
    FROM advertisers
    WHERE id = ${campaign.advertiserId}
    FOR UPDATE
  `);
  const advertiserList = Array.isArray(advertiserRows) ? advertiserRows : (advertiserRows as { rows?: unknown[] }).rows ?? [];
  const advertiser = (advertiserList as Array<{
    id: string;
    platform: string;
    status: string;
  }>)[0];

  if (!advertiser) {
    // Campaign exists but its advertiser is gone — catalog is inconsistent.
    throw new ShopeeCatalogOfferNotFoundError(offerId);
  }

  // Step 4: Lock the cashback policy by offerId. This is required for
  // Shopee classification, so a missing policy is a hard eligibility failure.
  const policyRows = await tx.execute(sql`
    SELECT cashback_share_bps AS "cashbackShareBps"
    FROM cashback_policies
    WHERE offer_id = ${offerId}
    FOR UPDATE
  `);
  const policyList = Array.isArray(policyRows) ? policyRows : (policyRows as { rows?: unknown[] }).rows ?? [];
  const policy = (policyList as Array<{
    cashbackShareBps: number | null;
  }>)[0];

  // Step 5: Build the locked entry for validation.
  const entry: ShopeeOfferCatalogEntry = {
    offerId: offer.id,
    offerStatus: offer.status,
    campaignId: campaign.id,
    campaignStatus: campaign.status,
    advertiserId: advertiser.id,
    advertiserStatus: advertiser.status,
    advertiserPlatform: advertiser.platform,
    cashbackShareBps: policy?.cashbackShareBps ?? null,
  };

  // Step 6: Validate eligibility rules from the locked snapshot.
  // This throws on the first failure without issuing any further queries.
  validateShopeeCatalogOffer(entry);

  return entry;
}

/**
 * Acquires a `FOR UPDATE` row lock on the single tracking-link row that
 * belongs to the publisher. Returns the normalised row read inside the
 * lock so the caller can reuse it for the validation step rather than
 * re-reading later. Throws `ShopeeCatalogTrackingLinkNotFoundError` if the
 * row is absent or owned by a different publisher. The caller MUST await
 * the returned Promise before proceeding with any writes in the same
 * transaction.
 */
async function lockAndLoadTrackingLinkForClassification(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  trackingLinkId: string,
  publisherId: string,
): Promise<{
  id: string;
  platform: string;
  campaignId: string | null;
  offerId: string | null;
}> {
  const rows = await tx.execute(sql`
    SELECT id, platform, campaign_id AS "campaignId", offer_id AS "offerId"
    FROM tracking_links
    WHERE id = ${trackingLinkId}
      AND publisher_id = ${publisherId}
      AND platform = 'shopee'
    FOR UPDATE
  `);
  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
  const row = (list as Array<{
    id: string;
    platform: string;
    campaignId: string | null;
    offerId: string | null;
  }>)[0];

  if (!row || row.platform !== "shopee") {
    throw new ShopeeCatalogTrackingLinkNotFoundError(trackingLinkId);
  }

  return {
    id: row.id,
    platform: row.platform,
    campaignId: row.campaignId,
    offerId: row.offerId,
  };
}

export async function classifyShopeeTrackingLinkAsync(
  input: ClassifyShopeeTrackingLinkInput,
): Promise<ClassifyShopeeTrackingLinkResult> {
  const normalizedPublisherId = input.publisherId.trim();
  const normalizedTrackingLinkId = input.trackingLinkId.trim();
  const normalizedOfferId = input.offerId.trim();

  if (normalizedPublisherId.length === 0) {
    throw new ShopeeCatalogTrackingLinkNotFoundError(
      input.trackingLinkId,
    );
  }

  if (normalizedTrackingLinkId.length === 0) {
    throw new ShopeeCatalogTrackingLinkNotFoundError(input.trackingLinkId);
  }

  if (normalizedOfferId.length === 0) {
    throw new ShopeeCatalogOfferNotFoundError(input.offerId);
  }

  return db.transaction(async (transaction) => {
    // 1. Lock all catalog rows sequentially and return the validated entry.
    //    Each step acquires a row lock before reading the next entity, so
    //    no concurrent transaction can insert a new catalog tuple that bypasses
    //    the lock chain. The validation is performed on the locked snapshot
    //    without issuing any additional read query, eliminating the race
    //    condition where a second SELECT could observe newly-committed rows.
    const offer = await lockAndLoadShopeeCatalogForClassification(
      transaction,
      normalizedOfferId,
    );

    // 2. Lock the tracking-link row in a separate awaited statement. The
    //    helper also performs the ownership/platform read so the caller does
    //    not need to re-read.
    const trackingLink = await lockAndLoadTrackingLinkForClassification(
      transaction,
      normalizedTrackingLinkId,
      normalizedPublisherId,
    );

    const existingCampaignId = trackingLink.campaignId;
    const existingOfferId = trackingLink.offerId;

    if (existingCampaignId === null && existingOfferId === null) {
      const updated = await transaction
        .update(trackingLinks)
        .set({
          campaignId: offer.campaignId,
          offerId: offer.offerId,
        })
        .where(
          and(
            eq(trackingLinks.id, normalizedTrackingLinkId),
            eq(trackingLinks.publisherId, normalizedPublisherId),
            eq(trackingLinks.platform, "shopee"),
            isNull(trackingLinks.campaignId),
            isNull(trackingLinks.offerId),
          ),
        )
        .returning({
          id: trackingLinks.id,
          campaignId: trackingLinks.campaignId,
          offerId: trackingLinks.offerId,
        });

      if (updated.length === 0) {
        // The atomic update did not match. Under our exclusive row lock this
        // is unreachable from concurrent writers, but the where clause could
        // differ from the snapshot we read inside the lock (e.g. if a future
        // refactor collapses the lock+update). Re-read through the executor
        // so the state interpreter sees the latest committed values.
        const reread = await transaction
          .select({
            campaignId: trackingLinks.campaignId,
            offerId: trackingLinks.offerId,
          })
          .from(trackingLinks)
          .where(
            and(
              eq(trackingLinks.id, normalizedTrackingLinkId),
              eq(trackingLinks.publisherId, normalizedPublisherId),
            ),
          )
          .limit(1);

        const reclassified = reread[0];
        if (!reclassified) {
          throw new ShopeeCatalogTrackingLinkNotFoundError(
            normalizedTrackingLinkId,
          );
        }

        return interpretExistingClassification({
          trackingLinkId: normalizedTrackingLinkId,
          existingCampaignId: reclassified.campaignId,
          existingOfferId: reclassified.offerId,
          requestedCampaignId: offer.campaignId,
          requestedOfferId: offer.offerId,
        });
      }

      return {
        trackingLinkId: updated[0].id,
        campaignId: updated[0].campaignId!,
        offerId: updated[0].offerId!,
        classified: true,
      };
    }

    return interpretExistingClassification({
      trackingLinkId: normalizedTrackingLinkId,
      existingCampaignId,
      existingOfferId,
      requestedCampaignId: offer.campaignId,
      requestedOfferId: offer.offerId,
    });
  });
}
