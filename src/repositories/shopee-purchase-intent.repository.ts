import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "@/db/client";
import { shopeePurchaseIntents } from "@/db/schema";

import {
  buildShopeePurchaseIntentPayload,
  validateShopeePurchaseIntentPayload,
  type ShopeePurchaseIntentPayload,
} from "@/lib/cashback/shopee-purchase-persistence-helper";

/**
 * Typed error thrown when an intent payload fails server-side
 * validation before INSERT. Surfaces a code + the underlying list of
 * field-level validation errors so the action layer can decide how
 * to log it.
 */
export class ShopeePurchaseIntentValidationError extends Error {
  readonly code = "shopee_purchase_intent_validation_failed";
  readonly errors: string[];

  constructor(errors: string[]) {
    super(
      `Shopee purchase intent payload validation failed: ${errors.join(", ")}`,
    );
    this.name = "ShopeePurchaseIntentValidationError";
    this.errors = errors;
  }
}

/**
 * Typed error thrown when the underlying INSERT raises. The action
 * layer treats this as `persistence_failed` and aborts the redirect.
 *
 * The original error is preserved on `cause` for logs but is never
 * exposed to the buyer.
 */
export class ShopeePurchaseIntentInsertError extends Error {
  readonly code = "shopee_purchase_intent_insert_failed";
  constructor(cause: unknown) {
    super(
      "Failed to persist Shopee purchase intent",
      { cause },
    );
    this.name = "ShopeePurchaseIntentInsertError";
  }
}

/**
 * Best-effort, non-blocking correlation result returned by
 * `findRecentRedirectPreparedIntentAsync`. The route uses this only for
 * debug logging — it never blocks the redirect on the lookup.
 */
export interface CorrelatedShopeePurchaseIntent {
  id: string;
  publisherId: string;
  trackingLinkId: string;
  networkSubId: string;
  shortCode: string;
  createdAt: Date;
  redirectPreparedAt: Date;
}

export interface PersistedShopeePurchaseIntent {
  id: string;
  publisherId: string;
  trackingLinkId: string;
  networkSubId: string;
  shortCode: string;
  status: "created" | "redirect_prepared" | "redirect_failed" | "persistence_failed";
  createdAt: Date;
  redirectPreparedAt: Date | null;
}

interface InsertedIntentRow {
  id: string;
  publisherId: string;
  trackingLinkId: string;
  networkSubId: string;
  shortCode: string;
  status: string;
  createdAt: Date;
  redirectPreparedAt: Date | null;
}

function mapInsertedRow(
  row: InsertedIntentRow,
): PersistedShopeePurchaseIntent {
  return {
    id: row.id,
    publisherId: row.publisherId,
    trackingLinkId: row.trackingLinkId,
    networkSubId: row.networkSubId,
    shortCode: row.shortCode,
    status: row.status as PersistedShopeePurchaseIntent["status"],
    createdAt: row.createdAt,
    redirectPreparedAt: row.redirectPreparedAt,
  };
}

/**
 * Persist one buyer purchase-intent row.
 *
 * This is the single insertion boundary for Phase 20H.3b. The action
 * layer calls it exactly once per successful handoff attempt, AFTER
 * every upstream validation has succeeded:
 *
 *  - authentication
 *  - product URL canonicalization
 *  - tracking link creation
 *  - affiliate URL build / verify
 *
 * The payload it receives must already be server-derived. We re-run
 * the pure validation pass here so a future caller cannot bypass the
 * action's orchestration and write a malformed row.
 */
export async function persistShopeePurchaseIntentAsync(
  payload: ShopeePurchaseIntentPayload,
): Promise<PersistedShopeePurchaseIntent> {
  const validation = validateShopeePurchaseIntentPayload(payload);

  if (!validation.ok) {
    throw new ShopeePurchaseIntentValidationError(
      validation.errors,
    );
  }

  try {
    const [inserted] = await db
      .insert(shopeePurchaseIntents)
      .values({
        publisherId: payload.publisherId,
        trackingLinkId: payload.trackingLinkId,
        networkSubId: payload.networkSubId,
        shortCode: payload.shortCode,
        originalProductUrl: payload.originalProductUrl,
        canonicalProductUrl: payload.canonicalProductUrl,
        shopId: payload.shopId,
        itemId: payload.itemId,
        campaignId: payload.campaignId,
        offerId: payload.offerId,
        affiliateUrl: payload.affiliateUrl,
        quoteSnapshot: payload.quoteSnapshot,
        status: payload.status,
        redirectPreparedAt:
          payload.status === "redirect_prepared"
            ? new Date()
            : null,
      })
      .returning({
        id: shopeePurchaseIntents.id,
        publisherId: shopeePurchaseIntents.publisherId,
        trackingLinkId: shopeePurchaseIntents.trackingLinkId,
        networkSubId: shopeePurchaseIntents.networkSubId,
        shortCode: shopeePurchaseIntents.shortCode,
        status: shopeePurchaseIntents.status,
        createdAt: shopeePurchaseIntents.createdAt,
        redirectPreparedAt:
          shopeePurchaseIntents.redirectPreparedAt,
      });

    if (!inserted) {
      throw new ShopeePurchaseIntentInsertError(
        new Error("INSERT returned no row"),
      );
    }

    return mapInsertedRow(inserted);
  } catch (error) {
    if (
      error instanceof ShopeePurchaseIntentValidationError ||
      error instanceof ShopeePurchaseIntentInsertError
    ) {
      throw error;
    }

    throw new ShopeePurchaseIntentInsertError(error);
  }
}

/**
 * Re-export so the action layer does not have to import both the
 * repository and the helper module separately when it wants to build
 * and persist in one call.
 */
export { buildShopeePurchaseIntentPayload };

/**
 * Default correlation window for /go/<shortCode> -> purchase-intent
 * matching. Thirty minutes is long enough to cover typical handoff
 * latency (server action -> buyer click) without polluting the match
 * with stale intents. Kept as a constant so it can be overridden in
 * tests.
 */
export const DEFAULT_INTENT_CORRELATION_WINDOW_MS = 30 * 60 * 1000;

/**
 * Best-effort lookup of the most recent `redirect_prepared` Shopee
 * purchase intent for `(publisherId, shortCode)` inside the correlation
 * window. Used by Phase 20H.3c to log a debug-only correlation between
 * the persisted click audit and the persisted intent — it does NOT
 * block the redirect and it does NOT mutate any row.
 *
 * Contract:
 *  - Returns `null` when no intent matches OR when the lookup itself
 *    fails. Never throws. Legacy `/go/<shortCode>` links without a
 *    matching intent must remain redirectable.
 *  - The returned row is the freshest match by `createdAt desc`.
 *  - The lookup reads only; it never writes.
 *  - The route is expected to log the result, not surface it.
 */
export async function findRecentRedirectPreparedIntentAsync({
  publisherId,
  shortCode,
  windowMs = DEFAULT_INTENT_CORRELATION_WINDOW_MS,
  now = new Date(),
}: {
  publisherId: string;
  shortCode: string;
  windowMs?: number;
  now?: Date;
}): Promise<CorrelatedShopeePurchaseIntent | null> {
  try {
    if (!publisherId || !shortCode) return null;
    if (!Number.isFinite(windowMs) || windowMs <= 0) return null;

    const lowerBound = new Date(now.getTime() - windowMs);

    const [matched] = await db
      .select({
        id: shopeePurchaseIntents.id,
        publisherId: shopeePurchaseIntents.publisherId,
        trackingLinkId: shopeePurchaseIntents.trackingLinkId,
        networkSubId: shopeePurchaseIntents.networkSubId,
        shortCode: shopeePurchaseIntents.shortCode,
        createdAt: shopeePurchaseIntents.createdAt,
        redirectPreparedAt: shopeePurchaseIntents.redirectPreparedAt,
      })
      .from(shopeePurchaseIntents)
      .where(
        and(
          eq(shopeePurchaseIntents.publisherId, publisherId),
          eq(shopeePurchaseIntents.shortCode, shortCode),
          eq(shopeePurchaseIntents.status, "redirect_prepared"),
          gte(shopeePurchaseIntents.createdAt, lowerBound),
        ),
      )
      .orderBy(desc(shopeePurchaseIntents.createdAt))
      .limit(1);

    if (!matched) return null;
    if (!matched.redirectPreparedAt) return null;

    return {
      id: matched.id,
      publisherId: matched.publisherId,
      trackingLinkId: matched.trackingLinkId,
      networkSubId: matched.networkSubId,
      shortCode: matched.shortCode,
      createdAt: matched.createdAt,
      redirectPreparedAt: matched.redirectPreparedAt,
    };
  } catch {
    // Best-effort: never let the correlation lookup break a redirect.
    return null;
  }
}