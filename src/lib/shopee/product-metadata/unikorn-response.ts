import type { Money } from "@/types/affiliate";

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import {
  parseShopeeProductUrl,
  ShopeeProductUrlParseError,
} from "@/lib/shopee/product-url-parser";
import type {
  ShopeeProductAvailability,
  ShopeeProductMetadata,
} from "./types";
import { ShopeeProductMetadataError } from "./provider.errors";
import { isShopeeProductImageHost } from "./image-hosts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isNonEmptyDigitString(value: string): boolean {
  if (value.length === 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

/**
 * Normalize an itemId or shopId field from the Unikorn response.
 *
 * Accepts only:
 *   - safe integer numbers (Number.isSafeInteger + non-negative)
 *   - non-empty ASCII digit strings
 *
 * Numeric values that have already lost precision (unsafe integers) are
 * rejected. Digit strings are accepted as-is without coercion.
 */
function normalizeNumericId(raw: unknown): string | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    if (!Number.isSafeInteger(raw)) return null;
    if (raw < 0) return null;
    const str = String(raw);
    if (!isNonEmptyDigitString(str)) return null;
    return str;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!isNonEmptyDigitString(trimmed)) return null;
    return trimmed;
  }
  return null;
}

function parseRating(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw < 0 || raw > 5) return null;
    return raw;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < 0 || parsed > 5) return null;
    return parsed;
  }
  return null;
}

function validateHttpsImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  if (!isShopeeProductImageHost(url.hostname)) return null;
  return raw;
}

type SupportedDataSource = "api" | "db";

function parseDataSource(raw: unknown): SupportedDataSource | null {
  if (raw === "api") return "api";
  if (raw === "db") return "db";
  return null;
}

export function parseUnikornProductDataResponse(
  input: unknown,
  identity: ShopeeProductIdentity,
): ShopeeProductMetadata {
  if (!isRecord(input)) {
    throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response must be a plain object");
  }

  const status = input["status"];
  if (status !== "success") {
    throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response status is not success");
  }

  const productInfo = input["productInfo"];
  if (!isRecord(productInfo)) {
    throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response productInfo is missing or invalid");
  }

  const dataSource = parseDataSource(productInfo["dataSource"]);
  if (dataSource === null) {
    throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response has unsupported dataSource");
  }

  const itemId = normalizeNumericId(productInfo["itemId"]);
  if (itemId === null) {
    throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response itemId is invalid");
  }
  if (itemId !== identity.itemId) {
    throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response itemId does not match resolved identity");
  }

  // shopId is optional: if present it must be a valid digit string matching identity.shopId
  if (productInfo["shopId"] !== undefined && productInfo["shopId"] !== null) {
    const shopId = normalizeNumericId(productInfo["shopId"]);
    if (shopId === null) {
      throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response shopId is malformed");
    }
    if (shopId !== identity.shopId) {
      throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response shopId does not match resolved identity");
    }
  }
  // If shopId is absent or null, productLink identity verification guards the response

  const productName = readString(productInfo["productName"]);
  if (productName === null) {
    throw new ShopeeProductMetadataError("metadata_incomplete", "Unikorn API response productName is missing or empty");
  }

  // Price must be a positive safe integer (Number.isSafeInteger and >= 1).
  const rawPrice = productInfo["price"];
  let priceAmount: number | null = null;
  if (typeof rawPrice === "number" && Number.isFinite(rawPrice)) {
    if (Number.isInteger(rawPrice) && Number.isSafeInteger(rawPrice) && rawPrice > 0) {
      priceAmount = rawPrice;
    }
  } else if (typeof rawPrice === "string") {
    const trimmed = rawPrice.trim();
    if (isNonEmptyDigitString(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && Number.isInteger(parsed) && Number.isSafeInteger(parsed) && parsed > 0) {
        priceAmount = parsed;
      }
    }
  }
  if (priceAmount === null) {
    if (rawPrice === undefined || rawPrice === null || rawPrice === 0) {
      throw new ShopeeProductMetadataError("metadata_incomplete", "Unikorn API response price is missing or zero");
    }
    throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response price is invalid");
  }

  const rawImageUrl = readString(productInfo["imageUrl"]);
  if (productInfo["imageUrl"] === undefined || productInfo["imageUrl"] === null) {
    throw new ShopeeProductMetadataError("metadata_incomplete", "Unikorn API response imageUrl is missing");
  }
  if (rawImageUrl === null) {
    throw new ShopeeProductMetadataError("metadata_incomplete", "Unikorn API response imageUrl is empty");
  }
  const imageUrl = validateHttpsImageUrl(rawImageUrl);
  if (imageUrl === null) {
    throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response imageUrl is invalid");
  }

  const rawProductLink = readString(productInfo["productLink"]);
  if (rawProductLink === null) {
    throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response productLink is missing");
  }

  // Delegate productLink validation to the canonical Shopee product URL parser
  // so the Unikorn boundary inherits the same protections used for user input:
  // HTTPS only, allowlisted host, no credentials, no unexpected port, valid
  // product path, valid numeric shopId/itemId, no short links, no shope.ee,
  // no shopee.com, no arbitrary host. A typed parse failure becomes a typed
  // provider_response_invalid error here. shopId/itemId must still match the
  // resolved identity exactly because the canonical parser does not know
  // about the calling identity.
  let parsedLink;
  try {
    parsedLink = parseShopeeProductUrl(rawProductLink);
  } catch (error) {
    if (error instanceof ShopeeProductUrlParseError) {
      throw new ShopeeProductMetadataError(
        "provider_response_invalid",
        "Unikorn API response productLink could not be validated",
      );
    }
    throw new ShopeeProductMetadataError(
      "provider_response_invalid",
      "Unikorn API response productLink could not be validated",
    );
  }
  if (parsedLink.shopId !== identity.shopId || parsedLink.itemId !== identity.itemId) {
    throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response productLink does not match resolved identity");
  }

  const shopName = readString(productInfo["shopName"]) ?? undefined;
  if (productInfo["rating"] !== undefined) {
    const rating = parseRating(productInfo["rating"]);
    if (rating === null) {
      throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response rating is invalid");
    }
  }

  if (productInfo["sales"] !== undefined && productInfo["sales"] !== null) {
    const salesRaw = productInfo["sales"];
    let salesOk = false;
    if (typeof salesRaw === "number" && Number.isFinite(salesRaw)) {
      salesOk = Number.isInteger(salesRaw) && Number.isSafeInteger(salesRaw) && salesRaw >= 0;
    } else if (typeof salesRaw === "string") {
      const trimmed = salesRaw.trim();
      if (isNonEmptyDigitString(trimmed)) {
        const parsed = Number(trimmed);
        salesOk = Number.isFinite(parsed) && Number.isInteger(parsed) && Number.isSafeInteger(parsed) && parsed >= 0;
      }
    }
    if (!salesOk) {
      throw new ShopeeProductMetadataError("provider_response_invalid", "Unikorn API response sales is invalid");
    }
  }

  const availability: ShopeeProductAvailability = "unknown";
  const price: Money = { amount: priceAmount, currency: "VND" };

  return {
    shopId: identity.shopId,
    itemId: identity.itemId,
    canonicalUrl: identity.canonicalUrl,
    title: productName,
    imageUrl,
    price,
    shopName,
    availability,
  };
}
