/**
 * Phase 20I.2 -- deterministic in-memory implementation of
 * {@link PublicOfferFeedAdapter}.
 *
 * Use this when:
 *
 *   - running unit tests;
 *   - running locally without API credentials;
 *   - the production adapter fails and the catalog needs a safe
 *     fallback (the catalog source wraps a real adapter with this
 *     mock automatically).
 *
 * The mock MUST always return `ok: true` so callers can rely on it
 * as the bottom of the fallback chain.
 */

import type {
  PublicOfferFeedAdapter,
  RawOffer,
  RawOfferFeedResult,
  RawOfferSource,
} from "./public-offer-feed.types";

export interface MockOfferFeedAdapterOptions {
  readonly source?: RawOfferSource;
  readonly offers?: ReadonlyArray<RawOffer>;
  /** Simulate a failure for testing the catalog fallback path. */
  readonly forceFailure?: { readonly reason: string };
}

export class MockOfferFeedAdapter implements PublicOfferFeedAdapter {
  public readonly source: RawOfferSource;
  private readonly offers: ReadonlyArray<RawOffer>;
  private readonly forceFailure: { readonly reason: string } | undefined;

  constructor(opts: MockOfferFeedAdapterOptions = {}) {
    this.source = opts.source ?? "mock";
    this.offers = opts.offers ?? [];
    this.forceFailure = opts.forceFailure;
  }

  async fetchOffers(): Promise<RawOfferFeedResult> {
    if (this.forceFailure) {
      return {
        ok: false,
        source: this.source,
        reason: this.forceFailure.reason,
      };
    }
    return {
      ok: true,
      source: this.source,
      offers: this.offers,
    };
  }
}
