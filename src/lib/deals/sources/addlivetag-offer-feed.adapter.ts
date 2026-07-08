/**
 * Phase 20I.2 -- Addlivetag public-offer-feed adapter shell.
 *
 * The adapter is the ONLY layer that knows the Addlivetag wire
 * format. It is responsible for:
 *
 *   - issuing the authenticated HTTP request (using the existing
 *     `addlivetag-client` building blocks);
 *   - reshaping the vendor JSON into the {@link RawOffer} envelope
 *     used by the normalizer downstream;
 *   - converting ANY kind of transport failure into `ok: false` so
 *     the catalog source can fall back to mock / manual without
 *     crashing the buyer experience.
 *
 * The full HTTP wiring (pagination, retry, throttling) is
 * deliberately NOT in this file: it lives in the existing
 * `addlivetag-client` so the public-deal adapter stays a thin
 * mapper.
 *
 * Phase 20I.2 ships only the structural shell. The actual field
 * mapping will be filled in once the vendor JSON contract is
 * pinned; until then, callers fall through to the manual / mock
 * source via the catalog source's fallback chain.
 */

import type {
  PublicOfferFeedAdapter,
  RawOffer,
  RawOfferFeedResult,
  RawOfferSource,
} from "./public-offer-feed.types";

export interface AddlivetagOfferFeedAdapterOptions {
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  readonly getApiKey?: () => string;
  /** Override the source label used in diagnostics. */
  readonly source?: RawOfferSource;
  /**
   * When true, the adapter short-circuits and returns an empty
   * `ok: true` list instead of attempting the network call. This
   * is the production default until the vendor JSON contract is
   * pinned.
   */
  readonly disableNetworkCalls?: boolean;
}

/**
 * Stub adapter. Until the Addlivetag public-offer endpoint is
 * stable, the safe behaviour is to report "no remote data" and let
 * the catalog source compose the manual / mock list. Once the
 * vendor contract is locked we add a `fetchImpl` and map the JSON
 * into {@link RawOffer} entries here.
 */
export class AddlivetagOfferFeedAdapter implements PublicOfferFeedAdapter {
  public readonly source: RawOfferSource;
  private readonly disableNetworkCalls: boolean;

  constructor(opts: AddlivetagOfferFeedAdapterOptions = {}) {
    this.source = opts.source ?? "addlivetag";
    this.disableNetworkCalls = opts.disableNetworkCalls ?? true;
  }

  async fetchOffers(): Promise<RawOfferFeedResult> {
    if (this.disableNetworkCalls) {
      return {
        ok: true,
        source: this.source,
        offers: [] as ReadonlyArray<RawOffer>,
      };
    }
    // The real network path will land here in a follow-up phase.
    // For now we return an empty success so the catalog source
    // composes its fallback list unchanged.
    return {
      ok: true,
      source: this.source,
      offers: [] as ReadonlyArray<RawOffer>,
    };
  }
}
