/**
 * Phase 20I.2 -- Raw shape of an external public offer feed entry.
 *
 * Deliberately permissive: real Addlivetag / Shopee-like payloads vary
 * wildly across versions and merchants. The adapter that produces these
 * records is the ONLY place that has to know the wire format; the
 * normalizer downstream only consumes this typed envelope so the rest of
 * the codebase stays insulated from vendor-specific quirks.
 *
 * No internal identifiers are listed here. Any vendor field that LOOKS
 * like a tracking id / token / sub-id is mapped out via {@link
 * RawOfferTrackingHints}; the normalizer is responsible for dropping
 * those before anything touches the buyer-facing type.
 *
 * The `extra` bag is intentionally `unknown`: it carries the rest of
 * the raw payload for debugging / lossless audit, but it must never be
 * forwarded to the UI. The sanitizer discards it on the way out.
 */

import type { DealPlatform } from "@/services/public-deals.types";

/**
 * Best-effort description of where the offer comes from. Drives the
 * `source` field on the normalized {@link PublicDeal} so the catalog
 * can show provenance to operators and to QA scripts.
 */
export type RawOfferSource =
  | "manual"
  | "mock"
  | "addlivetag"
  | "shopee-feed";

/**
 * Vendor payload variant -- every external feed describes offers in
 * its own dialect. The adapter normalises the variant to one of
 * these high-level kinds so the public-catalog layer only ever sees
 * a single decision tree.
 */
export type RawOfferKindHint =
  | "voucher_code"
  | "deal"
  | "cashback_program"
  | "unknown";

/**
 * Hint fields that vendors use to embed their own tracking state.
 * None of these are allowed to reach the buyer-facing model.
 *
 * Kept here so the sanitizer can document exactly which fields it
 * strips, and so audit scripts can grep for accidental leakage.
 */
export interface RawOfferTrackingHints {
  readonly affiliateUrl?: unknown;
  readonly shortCode?: unknown;
  readonly subId?: unknown;
  readonly subId1?: unknown;
  readonly subId2?: unknown;
  readonly subId3?: unknown;
  readonly clickId?: unknown;
  readonly clickId2?: unknown;
  readonly networkSubId?: unknown;
  readonly sourceSubId1?: unknown;
  readonly sourceSubId2?: unknown;
  readonly purchaseIntentId?: unknown;
  readonly trackingLinkId?: unknown;
  readonly publisherId?: unknown;
  readonly trackingPath?: unknown;
  readonly an_redir?: unknown;
  readonly vaflnk?: unknown;
  readonly token?: unknown;
  readonly aff_sub?: unknown;
  readonly aff_sub1?: unknown;
  readonly aff_sub2?: unknown;
}

/**
 * Raw shape of a single offer record coming out of a feed adapter.
 *
 * Required fields are intentionally minimal so a missing title or
 * image does not abort the entire catalog -- the normalizer treats
 * those as recoverable defaults. Anything else lives in `extra`
 * where the sanitizer can ignore it safely.
 */
export interface RawOffer {
  /** Vendor-stable id; may contain dashes / vendor prefix. */
  readonly vendorId: string;
  readonly platform: DealPlatform;
  readonly kind: RawOfferKindHint;
  readonly title?: string;
  readonly description?: string;
  readonly imageUrl?: string;
  readonly destinationUrl?: string;
  readonly categoryHint?: string;
  readonly priceText?: string;
  readonly discountText?: string;
  readonly voucherLabel?: string;
  readonly cashbackHint?: string;
  /** ISO-8601 string; the normalizer does not assume Date objects. */
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly status?: "active" | "expired" | "upcoming" | "unknown";
  readonly tracking?: RawOfferTrackingHints;
  /** Anything else from the vendor payload. Discouraged to read. */
  readonly extra?: Record<string, unknown>;
}

/**
 * What a feed adapter returns. `ok: false` means the fetch failed
 * and the catalog should fall back to manual / mock source without
 * crashing the buyer experience.
 */
export type RawOfferFeedResult =
  | { readonly ok: true; readonly source: RawOfferSource; readonly offers: ReadonlyArray<RawOffer> }
  | { readonly ok: false; readonly source: RawOfferSource; readonly reason: string };

export interface PublicOfferFeedAdapter {
  readonly source: RawOfferSource;
  /**
   * Fetch a page of raw offers. Implementations MUST never throw on
   * transient failures; they MUST return `ok: false` so the catalog
   * source can fall back gracefully.
   */
  fetchOffers(): Promise<RawOfferFeedResult>;
}
