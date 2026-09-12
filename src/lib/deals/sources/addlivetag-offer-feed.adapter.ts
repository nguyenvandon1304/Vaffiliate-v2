/**
 * Phase 20I.2 / P1.1 -- Addlivetag public-offer-feed adapter.
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
 * The Offers API is a read-only, cached feed. This adapter fetches the
 * first page of the campaign feed and maps only buyer-safe fields into
 * the canonical RawOffer envelope. The catalog source remains the
 * fallback boundary when the provider is unavailable.
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
  readonly pageSize?: number;
  readonly timeoutMs?: number;
  readonly source?: RawOfferSource;
  readonly disableNetworkCalls?: boolean;
}

export class AddlivetagOfferFeedAdapter implements PublicOfferFeedAdapter {
  public readonly source: RawOfferSource;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly pageSize: number;
  private readonly timeoutMs: number;
  private readonly disableNetworkCalls: boolean;

  constructor(opts: AddlivetagOfferFeedAdapterOptions = {}) {
    this.source = opts.source ?? "addlivetag";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? "https://data.addlivetag.com/offers/shopee-offer.php";
    this.pageSize = Math.min(50, Math.max(1, Math.trunc(opts.pageSize ?? 50)));
    this.timeoutMs = Math.min(15_000, Math.max(1_000, Math.trunc(opts.timeoutMs ?? 8_000)));
    this.disableNetworkCalls = opts.disableNetworkCalls ?? false;
  }

  async fetchOffers(): Promise<RawOfferFeedResult> {
    if (this.disableNetworkCalls) {
      return {
        ok: true,
        source: this.source,
        offers: [] as ReadonlyArray<RawOffer>,
      };
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("page", "1");
    url.searchParams.set("limit", String(this.pageSize));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      return { ok: false, source: this.source, reason: "network-error" };
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return {
        ok: false,
        source: this.source,
        reason: `http-${response.status}`,
      };
    }

    let body: unknown;
    try {
      const text = await response.text();
      if (text.length > 4 * 1024 * 1024) {
        return { ok: false, source: this.source, reason: "body-too-large" };
      }
      body = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, source: this.source, reason: "invalid-json" };
    }

    if (!isRecord(body) || body.status !== "success" || !Array.isArray(body.offers)) {
      return { ok: false, source: this.source, reason: "invalid-response" };
    }

    const offers = body.offers
      .filter(isRecord)
      .map((offer) => mapOffer(offer))
      .filter((offer): offer is RawOffer => offer !== null);

    return { ok: true, source: this.source, offers };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result.length > 0 ? result : undefined;
}

function readRate(value: unknown): number | undefined {
  const rate = typeof value === "number" ? value : Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : undefined;
}

function readEpochSeconds(value: unknown): string | undefined {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000).toISOString();
}

function stableVendorId(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `addlivetag-offer-${hash.toString(16).padStart(8, "0")}`;
}

function mapOffer(raw: Record<string, unknown>): RawOffer | null {
  const title = readString(raw.name);
  const destinationUrl = readString(raw.link) ?? readString(raw.originalLink);
  if (!title || !destinationUrl) return null;

  const commissionRate = readRate(raw.commissionRate);
  const validFrom = readEpochSeconds(raw.startTime);
  const validUntil = readEpochSeconds(raw.endTime);
  const now = Date.now();
  const startMs = validFrom === undefined ? null : Date.parse(validFrom);
  const endMs = validUntil === undefined ? null : Date.parse(validUntil);
  return {
    vendorId: stableVendorId(`${destinationUrl}|${title}`),
    platform: "shopee",
    kind: "deal",
    title,
    description: "Ưu đãi có thể thay đổi theo điều kiện của sàn.",
    imageUrl: readString(raw.image),
    destinationUrl,
    categoryHint: "popular",
    discountText: typeof raw.type === "number" ? `Ưu đãi Shopee loại ${raw.type}` : undefined,
    cashbackHint:
      commissionRate === undefined
        ? undefined
        : `Hoa hồng chiến dịch ${(commissionRate * 100).toFixed(2)}%`,
    commissionRate,
    validFrom,
    validUntil,
    status: endMs !== null && endMs <= now
      ? "expired"
      : startMs !== null && startMs > now
        ? "upcoming"
        : "active",
  };
}
