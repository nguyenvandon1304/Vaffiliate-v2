/**
 * Phase 20I.4 -- server-only Shopee Open API auth provider contract.
 *
 * Shopee Open API v2 requests must carry a signed Authorization
 * header of the form:
 *
 *   Authorization: SHA256 Credential=..., Signature=..., Timestamp=...
 *
 * The exact signing algorithm is documented by Shopee and is NOT
 * something this codebase invents. Phase 20I.4 ships the contract
 * only; the production wiring will fill in the implementation in a
 * later phase. Until then, the foundation refuses to issue any
 * request when the auth provider is missing (fail-closed).
 *
 * The AuthProvider interface is intentionally narrow so a future
 * implementation cannot accidentally widen the scope of what the
 * caller can request.
 */

export interface ShopeeOpenApiAuthHeaders {
  /**
   * The full value of the Authorization header. The provider is
   * responsible for serialising Credential, Signature and Timestamp
   * into the documented format.
   */
  readonly authorization: string;
  /**
   * ISO-8601 timestamp the provider used to sign the request.
   * Carried back so the caller can include it in retry logs / xray
   * metadata. NEVER logged with any internal id attached.
   */
  readonly timestamp: string;
}

export interface ShopeeOpenApiAuthProvider {
  /**
   * Build the signed headers for a single GraphQL request. Called
   * ONCE per HTTP attempt so the timestamp can be fresh. MUST
   * throw when credentials are unavailable; the live fetch
   * foundation treats any throw as "fail closed".
   */
  signRequest(): Promise<ShopeeOpenApiAuthHeaders>;
}

/**
 * Null-object auth provider used by tests and the disabled-live
 * path. It deliberately refuses to sign anything so callers cannot
 * accidentally enable a real network call without a real provider.
 */
export class MissingShopeeOpenApiAuthProvider implements ShopeeOpenApiAuthProvider {
  async signRequest(): Promise<ShopeeOpenApiAuthHeaders> {
    throw new Error(
      "shopee-open-api: auth provider missing -- live feed disabled",
    );
  }
}

/**
 * Type guard used by the live foundation to decide whether to call
 * fetch at all. Returns false when the provider is the null-object
 * (or any provider that throws before signing) so the foundation
 * can fall back to manual / mock.
 */
export function isLiveAuthProviderAvailable(
  provider: ShopeeOpenApiAuthProvider,
): provider is ShopeeOpenApiAuthProvider {
  return !(provider instanceof MissingShopeeOpenApiAuthProvider);
}
