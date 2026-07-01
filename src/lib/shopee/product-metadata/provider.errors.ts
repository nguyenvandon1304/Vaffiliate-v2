/**
 * Typed error surface for the Shopee product metadata provider.
 *
 * Each failure mode has its own code so that downstream layers can
 * map provider errors to UI messages, metrics, or retry policies
 * without sniffing exception messages.
 *
 * All errors extend {@link ShopeeProductMetadataError} which is a
 * regular Error subclass (not a generic Error) so `instanceof` checks
 * work consistently across runtimes.
 */

export type ShopeeProductMetadataErrorCode =
  | "metadata_unavailable"
  | "metadata_incomplete"
  | "provider_timeout"
  | "provider_response_invalid"
  | "product_unavailable"
  | "product_not_found"
  | "redirect_to_hostile_target"
  | "too_many_redirects"
  | "redirect_failed"
  | "body_too_large"
  | "unexpected_content_type"
  | "non_2xx_response";

const ERROR_MESSAGES: Readonly<
  Record<ShopeeProductMetadataErrorCode, string>
> = {
  metadata_unavailable:
    "Shopee product metadata could not be fetched",
  metadata_incomplete:
    "Shopee product metadata is incomplete for this product",
  provider_timeout:
    "Shopee product metadata provider timed out",
  provider_response_invalid:
    "Shopee product metadata response is invalid",
  product_unavailable:
    "Shopee product is no longer available",
  product_not_found:
    "Shopee product was not found at the given URL",
  redirect_to_hostile_target:
    "Shopee product metadata fetch was redirected to a disallowed host",
  too_many_redirects:
    "Shopee product metadata fetch exceeded the redirect limit",
  redirect_failed:
    "Shopee product metadata redirect could not be resolved",
  body_too_large:
    "Shopee product metadata response exceeded the size limit",
  unexpected_content_type:
    "Shopee product metadata response had an unexpected content type",
  non_2xx_response:
    "Shopee product metadata endpoint returned a non-2xx status",
};

export class ShopeeProductMetadataError extends Error {
  readonly code: ShopeeProductMetadataErrorCode;

  constructor(
    code: ShopeeProductMetadataErrorCode,
    message?: string,
  ) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = "ShopeeProductMetadataError";
    this.code = code;
  }
}