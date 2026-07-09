/**
 * Phase 20I.4 -- server-only Shopee Open API offer feed live fetch
 * foundation.
 *
 * This file is the SHELL that the production wiring will sit on top
 * of. It does NOT implement the SHA256 signing algorithm (Shopee's
 * docs were not available when this file was written); instead it
 * provides:
 *
 *   - the GraphQL endpoint constant;
 *   - a typed wrapper around the injected fetch;
 *   - the auth provider injection point (see
 *     `shopee-offer-auth.types.ts`);
 *   - a fail-closed result type so the catalog source never crashes
 *     because the live feed is unavailable;
 *   - an in-memory TTL cache abstraction;
 *   - a constructor that defaults to "disabled" -- no live network
 *     traffic unless a caller explicitly opts in.
 *
 * The foundation is intentionally pure-ish: the only I/O surface is
 * the injected `fetchImpl`, so the entire layer is testable under
 * `node --test` without touching the network.
 */

import type {
  ShopeeOpenApiAuthProvider,
  ShopeeOpenApiAuthHeaders,
} from "./shopee-offer-auth.types";
import { MissingShopeeOpenApiAuthProvider } from "./shopee-offer-auth.types";
import {
  buildBrandOfferV2Query,
  buildProductOfferV2Query,
  buildShopeeOfferV2Query,
  type BrandOfferV2QueryInput,
  type ProductOfferV2QueryInput,
  type ShopeeGraphqlRequest,
  type ShopeeOfferV2QueryInput,
} from "./shopee-offer-graphql.types";
import type {
  BrandOfferV2Raw,
  ProductOfferV2Raw,
  ShopeeBrandOfferConnectionV2Raw,
  ShopeeOfferConnectionV2Raw,
  ShopeeOfferV2Raw,
  ShopeeProductOfferConnectionV2Raw,
} from "./shopee-offer-raw.types";

/** Default Shopee Open API v2 GraphQL endpoint. */
export const SHOPEE_OPEN_API_GRAPHQL_ENDPOINT =
  "https://open-api.affiliate.shopee.vn/graphql";

/** Default TTL for the in-memory cache (60 seconds). */
export const DEFAULT_SHOPEE_LIVE_CACHE_TTL_MS = 60_000;

/** Default hard timeout for one HTTP attempt (10 seconds). */
export const DEFAULT_SHOPEE_LIVE_TIMEOUT_MS = 10_000;

/** Reason vocabulary for the fail-closed result. */
export type ShopeeLiveFailureReason =
  | "live-disabled"
  | "auth-missing"
  | "auth-threw"
  | "network-error"
  | "timeout"
  | "non-2xx"
  | "unexpected-content-type"
  | "body-too-large"
  | "bad-shape"
  | "graphql-errors";

export interface ShopeeLiveOk<T> {
  readonly ok: true;
  readonly source: "shopee_offer_v2" | "brand_offer_v2" | "product_offer_v2";
  readonly value: T;
  readonly fetchedAt: string;
  readonly cacheHit: boolean;
}

export interface ShopeeLiveErr {
  readonly ok: false;
  readonly source: "shopee_offer_v2" | "brand_offer_v2" | "product_offer_v2";
  readonly reason: ShopeeLiveFailureReason;
  readonly message: string;
}

export type ShopeeLiveResult<T> = ShopeeLiveOk<T> | ShopeeLiveErr;

/**
 * Cache entry. `expiresAt` is an epoch-ms number so the timer can
 * compare it cheaply. The cache is process-local; multi-process
 * deployments will need a shared cache but that is out of scope for
 * Phase 20I.4.
 */
interface CacheEntry {
  readonly expiresAt: number;
  readonly body: string;
}

export interface ShopeeLiveFetchOptions {
  readonly fetchImpl?: typeof fetch;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  /**
   * When true (default false), the foundation attempts a real
   * network call. Production wiring will flip this when the env
   * variables are present and the SHA256 signer is wired.
   */
  readonly liveEnabled?: boolean;
}

/**
 * Server-only Shopee live fetch client. Always constructed with the
 * null-object auth provider so missing credentials fail closed.
 */
export class ShopeeOpenApiLiveClient {
  readonly endpoint: string;
  readonly timeoutMs: number;
  readonly now: () => number;
  readonly liveEnabled: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: Map<string, CacheEntry> = new Map();

  constructor(opts: ShopeeLiveFetchOptions = {}) {
    this.endpoint = opts.endpoint ?? SHOPEE_OPEN_API_GRAPHQL_ENDPOINT;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_SHOPEE_LIVE_TIMEOUT_MS;
    this.now = opts.now ?? Date.now;
    this.liveEnabled = opts.liveEnabled ?? false;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /**
   * Fetch a page of shopeeOfferV2 raw nodes. Returns a fail-closed
   * result; never throws.
   */
  async fetchShopeeOfferV2(
    input: ShopeeOfferV2QueryInput,
    auth: ShopeeOpenApiAuthProvider = new MissingShopeeOpenApiAuthProvider(),
  ): Promise<ShopeeLiveResult<ReadonlyArray<ShopeeOfferV2Raw>>> {
    return this.fetchTyped(input, auth, "shopee_offer_v2", (body) => {
      const conn = parseShopeeOfferConnection(body);
      return { nodes: conn.nodes, source: "shopee_offer_v2" as const };
    });
  }

  /**
   * Fetch a page of brandOfferV2 raw nodes.
   */
  async fetchBrandOfferV2(
    input: BrandOfferV2QueryInput,
    auth: ShopeeOpenApiAuthProvider = new MissingShopeeOpenApiAuthProvider(),
  ): Promise<ShopeeLiveResult<ReadonlyArray<BrandOfferV2Raw>>> {
    return this.fetchTyped(input, auth, "brand_offer_v2", (body) => {
      const conn = parseBrandOfferConnection(body);
      return { nodes: conn.nodes, source: "brand_offer_v2" as const };
    });
  }

  /**
   * Fetch a page of productOfferV2 raw nodes.
   */
  async fetchProductOfferV2(
    input: ProductOfferV2QueryInput,
    auth: ShopeeOpenApiAuthProvider = new MissingShopeeOpenApiAuthProvider(),
  ): Promise<ShopeeLiveResult<ReadonlyArray<ProductOfferV2Raw>>> {
    return this.fetchTyped(input, auth, "product_offer_v2", (body) => {
      const conn = parseProductOfferConnection(body);
      return { nodes: conn.nodes, source: "product_offer_v2" as const };
    });
  }

  /**
   * Test-only: clear the in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  private async fetchTyped<
    TInput,
    TSource extends ShopeeLiveSource,
    TParsed,
  >(
    input: TInput,
    auth: ShopeeOpenApiAuthProvider,
    source: TSource,
    parse: (body: string) => {
      readonly nodes: ReadonlyArray<TParsed>;
      readonly source: TSource;
    },
  ): Promise<ShopeeLiveResult<ReadonlyArray<TParsed>>> {
    if (!this.liveEnabled) {
      return {
        ok: false,
        source,
        reason: "live-disabled",
        message: "Shopee live feed is disabled by configuration.",
      };
    }

    let signed: ShopeeOpenApiAuthHeaders;
    try {
      signed = await auth.signRequest();
    } catch (err) {
      return {
        ok: false,
        source,
        reason: "auth-missing",
        message:
          err instanceof Error
            ? "auth provider refused to sign the request"
            : "auth provider refused to sign the request",
      };
    }

    const request = buildGraphqlRequest(source, input);
    const cacheKey = stableCacheKey(source, request);
    const cached = this.readCache(cacheKey);
    if (cached) {
      const parsed = parse(cached);
      return {
        ok: true,
        source,
        value: parsed.nodes,
        fetchedAt: new Date(this.now()).toISOString(),
        cacheHit: true,
      };
    }

    let body: string;
    try {
      body = await this.postOnce(signed, request);
    } catch (err) {
      const errName =
        typeof err === "object" && err !== null && "name" in err
          ? String((err as { name: unknown }).name)
          : "";
      const isAbort =
        errName === "AbortError" ||
        errName === "TimeoutError" ||
        errName === "AbortController";
      return {
        ok: false,
        source,
        reason: isAbort ? "timeout" : "network-error",
        message:
          err instanceof Error
            ? err.message
            : "Shopee live fetch failed",
      };
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return {
        ok: false,
        source,
        reason: "bad-shape",
        message: "Shopee live response was not valid JSON.",
      };
    }

    if (!isObject(json)) {
      return {
        ok: false,
        source,
        reason: "bad-shape",
        message: "Shopee live response was not a JSON object.",
      };
    }
    if (Array.isArray(json.errors) && json.errors.length > 0) {
      return {
        ok: false,
        source,
        reason: "graphql-errors",
        message: `Shopee live response carried ${json.errors.length} GraphQL error(s).`,
      };
    }

    this.writeCache(cacheKey, body);
    const parsed = parse(body);
    return {
      ok: true,
      source,
      value: parsed.nodes,
      fetchedAt: new Date(this.now()).toISOString(),
      cacheHit: false,
    };
  }

  private async postOnce(
    signed: ShopeeOpenApiAuthHeaders,
    request: ShopeeGraphqlRequest,
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: signed.authorization,
        },
        body: JSON.stringify({
          query: request.query,
          variables: request.variables,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status < 200 || response.status > 299) {
      throw new Error(
        `Shopee live HTTP status ${response.status}`,
      );
    }
    const text = await response.text();
    if (text.length > 4 * 1024 * 1024) {
      throw new Error("Shopee live response body too large");
    }
    return text;
  }

  private readCache(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.body;
  }

  private writeCache(key: string, body: string): void {
    this.cache.set(key, {
      body,
      expiresAt: this.now() + DEFAULT_SHOPEE_LIVE_CACHE_TTL_MS,
    });
  }
}

type ShopeeLiveSource =
  | "shopee_offer_v2"
  | "brand_offer_v2"
  | "product_offer_v2";

function buildGraphqlRequest(
  source: ShopeeLiveSource,
  input: unknown,
): ShopeeGraphqlRequest {
  switch (source) {
    case "shopee_offer_v2":
      return buildShopeeOfferV2Query(
        input as ShopeeOfferV2QueryInput,
      );
    case "brand_offer_v2":
      return buildBrandOfferV2Query(
        input as BrandOfferV2QueryInput,
      );
    case "product_offer_v2":
      return buildProductOfferV2Query(
        input as ProductOfferV2QueryInput,
      );
  }
}

function parseShopeeOfferConnection(
  body: string,
): ShopeeOfferConnectionV2Raw {
  const json = JSON.parse(body) as { data?: unknown };
  if (!isObject(json) || !isObject(json.data)) return { nodes: [] as ReadonlyArray<ShopeeOfferV2Raw> };
  const conn = (json.data as Record<string, unknown>).shopeeOfferV2;
  if (!isObject(conn)) return { nodes: [] as ReadonlyArray<ShopeeOfferV2Raw> };
  const nodes = Array.isArray((conn as Record<string, unknown>).nodes)
    ? ((conn as Record<string, unknown>).nodes as ShopeeOfferV2Raw[])
    : [];
  const pageInfo =
    isObject((conn as Record<string, unknown>).pageInfo)
      ? ((conn as Record<string, unknown>).pageInfo as Record<
          string,
          unknown
        >)
      : null;
  return { nodes, pageInfo: pageInfo as never };
}

function parseBrandOfferConnection(
  body: string,
): ShopeeBrandOfferConnectionV2Raw {
  const json = JSON.parse(body) as { data?: unknown };
  if (!isObject(json) || !isObject(json.data)) return { nodes: [] as ReadonlyArray<BrandOfferV2Raw> };
  const conn = (json.data as Record<string, unknown>).brandOfferV2;
  if (!isObject(conn)) return { nodes: [] as ReadonlyArray<BrandOfferV2Raw> };
  const nodes = Array.isArray((conn as Record<string, unknown>).nodes)
    ? ((conn as Record<string, unknown>).nodes as BrandOfferV2Raw[])
    : [];
  const pageInfo =
    isObject((conn as Record<string, unknown>).pageInfo)
      ? ((conn as Record<string, unknown>).pageInfo as Record<
          string,
          unknown
        >)
      : null;
  return { nodes, pageInfo: pageInfo as never };
}

function parseProductOfferConnection(
  body: string,
): ShopeeProductOfferConnectionV2Raw {
  const json = JSON.parse(body) as { data?: unknown };
  if (!isObject(json) || !isObject(json.data)) return { nodes: [] as ReadonlyArray<ProductOfferV2Raw> };
  const conn = (json.data as Record<string, unknown>).productOfferV2;
  if (!isObject(conn)) return { nodes: [] as ReadonlyArray<ProductOfferV2Raw> };
  const nodes = Array.isArray((conn as Record<string, unknown>).nodes)
    ? ((conn as Record<string, unknown>).nodes as ProductOfferV2Raw[])
    : [];
  const pageInfo =
    isObject((conn as Record<string, unknown>).pageInfo)
      ? ((conn as Record<string, unknown>).pageInfo as Record<
          string,
          unknown
        >)
      : null;
  return { nodes, pageInfo: pageInfo as never };
}

function stableCacheKey(
  source: ShopeeLiveSource,
  request: ShopeeGraphqlRequest,
): string {
  // Phase 20I.4 follow-up: cache key MUST be stable across sign
  // invocations. The signer may emit a fresh `Timestamp=` per call,
  // so the signed.timestamp is intentionally NOT part of the key.
  // Only the source + the GraphQL query + variables are; the
  // Authorization / Signature / Credential / Timestamp header is
  // never mixed into the cache lookup so a leaked key value can
  // never escape through the cache map.
  return `${source}|${request.query}|${JSON.stringify(request.variables)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
