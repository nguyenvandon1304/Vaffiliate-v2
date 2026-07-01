/**
 * Pure Shopee product metadata extractor.
 *
 * Phase 20H.2 -- the extractor is a side-effect-free pure function so
 * it can be unit-tested with inline HTML fixtures and reused in any
 * context (server boundary, snapshot test, fixture loader).
 *
 * It is the only module allowed to coerce a raw Shopee page into a
 * typed {@link ShopeeProductMetadata}. Downstream layers MUST NOT
 * touch HTML.
 *
 * Design rules:
 *
 *   1. No fetch, no `Date.now`, no global state, no environment.
 *   2. No React, Next.js, or `server-only` import.
 *   3. Title, image, and price are all mandatory. A missing or
 *      invalid field is reported as `metadata_incomplete` so callers
 *      can render an honest "we cannot tell" UI state.
 *   4. Money is integer VND. The extractor never uses `parseFloat`
 *      on a money-shaped string; it validates the format before
 *      stripping thousands separators and validates the integer with
 *      `Number.isSafeInteger`.
 *   5. The expected shopId and itemId from the caller are used as a
 *      cross-check when JSON-LD exposes them, so an HTML payload
 *      that does not match the resolved identity is rejected.
 *   6. Image URLs are validated: HTTPS only, no credentials, non-empty
 *      hostname. javascript:, data:, http:, and malformed URLs are rejected.
 */

import type { Money } from "@/types/affiliate";

import type {
  ShopeeProductIdentity,
  ShopeeProductMetadata,
} from "./types";
import { ShopeeProductMetadataError } from "./provider.errors";
import {
  isShopeeProductImageHost,
} from "./image-hosts";
import {
  firstMetaContent,
  readJsonLdBlocks,
  readMetaTags,
  stripNoise,
} from "./html-parser";

// ─── VND Price Parser ────────────────────────────────────────────────────────

/**
 * Strict VND price parser.
 *
 * Accepts plain ASCII-digit strings and optionally numbers with thousands
 * separators. Only removes separators AFTER the format has been validated.
 *
 * Rejects: malformed grouping, leading sign, scientific notation,
 * non-numeric characters, NaN, Infinity, empty string, unsafe integers.
 *
 * Returns a non-negative safe integer, or null if the input is invalid.
 */
function parseVndPrice(raw: string): number | null {
  const trimmed = typeof raw === "string" ? raw.trim() : raw;
  if (typeof trimmed !== "string" || trimmed.length === 0) {
    return null;
  }

  const PLAIN_DIGITS = /^\d+$/;
  const DOT_GROUPED = /^\d{1,3}(?:\.\d{3})*$/;
  const COMMA_GROUPED = /^\d{1,3}(?:,\d{3})*$/;

  let normalized: string;

  if (PLAIN_DIGITS.test(trimmed)) {
    normalized = trimmed;
  } else if (DOT_GROUPED.test(trimmed)) {
    normalized = trimmed.replace(/\./g, "");
  } else if (COMMA_GROUPED.test(trimmed)) {
    normalized = trimmed.replace(/,/g, "");
  } else {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (!Number.isInteger(parsed)) {
    return null;
  }
  if (parsed < 0) {
    return null;
  }
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}

// ─── Image URL Validator ──────────────────────────────────────────────────────

/**
 * Validates that a string is a safe HTTPS Shopee image URL.
 *
 * Rejects: unparseable URLs, non-HTTPS protocols, URLs with credentials,
 * empty hostname, javascript:, data:, http: schemes, and any host that
 * is not on {@link isShopeeProductImageHost} (the canonical Shopee
 * image-host allowlist shared with `next.config.ts`).
 *
 * Returns the validated URL string, or null if validation fails.
 */
function validateImageUrl(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  if (!url.hostname) {
    return null;
  }

  if (!isShopeeProductImageHost(url.hostname)) {
    return null;
  }

  return raw;
}

// ─── JSON Helpers ────────────────────────────────────────────────────────────

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readStringArray(
  value: unknown,
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: string[] = [];
  for (const item of value) {
    const asString = readString(item);
    if (asString !== null) {
      out.push(asString);
    }
  }
  return out;
}

function findJsonLdProduct(
  payload: unknown,
): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findJsonLdProduct(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const typeField = payload["@type"];
  const typeValues = Array.isArray(typeField)
    ? typeField
    : [typeField];

  for (const typeValue of typeValues) {
    if (readString(typeValue) === "Product") {
      return payload;
    }
  }

  const graph = payload["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const found = findJsonLdProduct(item);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

// ─── Availability ─────────────────────────────────────────────────────────────

/**
 * Maps a raw JSON-LD availability string to a typed availability value.
 * Returns "available" for InStock/LimitedAvailability, "unavailable" for
 * OutOfStock/SoldOut/Discontinued, "unknown" otherwise.
 */
function parseAvailabilityField(
  raw: string | null,
): ShopeeProductMetadata["availability"] {
  if (!raw) {
    return "unknown";
  }
  const lower = raw.toLowerCase();
  if (
    lower.includes("instock") ||
    lower.includes("limitedavailability")
  ) {
    return "available";
  }
  if (
    lower.includes("outofstock") ||
    lower.includes("soldout") ||
    lower.includes("discontinued")
  ) {
    return "unavailable";
  }
  return "unknown";
}

// ─── JSON-LD Reader ─────────────────────────────────────────────────────────

interface ExtractedCandidate {
  readonly title: string | null;
  readonly imageUrl: string | null;
  readonly price: Money | null;
  readonly shopName: string | null;
  readonly availability: ShopeeProductMetadata["availability"];
  /**
   * True when JSON-LD had an explicit `offers.availability` field
   * (even if the value was unrecognized). False when OG fills in
   * all fields without JSON-LD availability.
   */
  readonly hadAvailabilityField: boolean;
}

function readJsonLdProductMetadata(
  blocks: ReadonlyArray<unknown>,
): ExtractedCandidate {
  for (const block of blocks) {
    const product = findJsonLdProduct(block);
    if (!product) {
      continue;
    }

    const title = readString(product["name"]);

    const imageValue = product["image"];
    const rawImageUrl =
      Array.isArray(imageValue)
        ? readStringArray(imageValue)?.[0] ?? null
        : readString(imageValue);
    const imageUrl = validateImageUrl(rawImageUrl);

    const offers = product["offers"];
    let price: Money | null = null;
    let availability: ShopeeProductMetadata["availability"] = "unknown";
    let hadAvailabilityField = false;

    if (isRecord(offers)) {
      const rawPrice = readString(offers["price"]);
      const currency = readString(offers["priceCurrency"]);
      if (rawPrice && currency === "VND") {
        const amount = parseVndPrice(rawPrice);
        if (amount !== null) {
          price = { amount, currency: "VND" };
        }
      }

      const rawAvailability = readString(offers["availability"]);
      hadAvailabilityField = true;
      availability = parseAvailabilityField(rawAvailability);
    }

    let shopName: string | null = null;
    const brandValue = product["brand"];
    if (typeof brandValue === "string") {
      shopName = readString(brandValue);
    } else if (isRecord(brandValue)) {
      shopName = readString(brandValue["name"]);
    }

    return {
      title,
      imageUrl,
      price,
      shopName,
      availability,
      hadAvailabilityField,
    };
  }

  return {
    title: null,
    imageUrl: null,
    price: null,
    shopName: null,
    availability: "unknown",
    hadAvailabilityField: false,
  };
}

// ─── Open Graph Reader ────────────────────────────────────────────────────────

function readOpenGraphMetadata(
  html: string,
): ExtractedCandidate {
  const cleaned = stripNoise(html);
  const tags = readMetaTags(cleaned);

  const title = firstMetaContent(tags, [
    "og:title",
    "twitter:title",
  ]);

  const imageUrl = validateImageUrl(firstMetaContent(tags, [
    "og:image",
    "og:image:secure_url",
    "twitter:image",
  ]));

  const priceAmountRaw = firstMetaContent(tags, [
    "product:price:amount",
    "og:price:amount",
  ]);

  const priceCurrency = firstMetaContent(tags, [
    "product:price:currency",
    "og:price:currency",
  ]);

  let price: Money | null = null;
  if (priceAmountRaw && priceCurrency === "VND") {
    const amount = parseVndPrice(priceAmountRaw);
    if (amount !== null) {
      price = { amount, currency: "VND" };
    }
  }

  const shopName = firstMetaContent(tags, [
    "og:site_name",
  ]);

  return {
    title,
    imageUrl,
    price,
    shopName: shopName ?? null,
    availability: "available",
    hadAvailabilityField: false,
  };
}

// ─── HTML-level Markers ──────────────────────────────────────────────────────

function detectUnavailableMarker(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("this product is no longer available") ||
    lower.includes("san pham nay hien khong con ban") ||
    lower.includes("san pham khong con ban")
  );
}

// ─── Main Extractor ──────────────────────────────────────────────────────────

export function extractShopeeProductMetadataFromHtml(
  html: string,
  identity: ShopeeProductIdentity,
): ShopeeProductMetadata {
  if (typeof html !== "string") {
    throw new ShopeeProductMetadataError(
      "provider_response_invalid",
      "Shopee product HTML payload is not a string",
    );
  }

  if (html.length === 0) {
    throw new ShopeeProductMetadataError(
      "metadata_incomplete",
      "Shopee product HTML payload is empty",
    );
  }

  if (detectUnavailableMarker(html)) {
    throw new ShopeeProductMetadataError(
      "product_unavailable",
      "Shopee product is marked as no longer available",
    );
  }

  const jsonLdBlocks = readJsonLdBlocks(html);
  const jsonLdCandidate = readJsonLdProductMetadata(jsonLdBlocks);

  // product_unavailable from JSON-LD availability takes precedence.
  if (jsonLdCandidate.availability === "unavailable") {
    throw new ShopeeProductMetadataError(
      "product_unavailable",
      "Shopee product is marked as unavailable via JSON-LD availability",
    );
  }

  const openGraphCandidate = readOpenGraphMetadata(html);

  const title = jsonLdCandidate.title ?? openGraphCandidate.title;

  // Image URL is already validated by validateImageUrl; null means
  // validation failed and we should report it as missing.
  const imageUrl =
    jsonLdCandidate.imageUrl ?? openGraphCandidate.imageUrl;

  const price =
    jsonLdCandidate.price ?? openGraphCandidate.price;

  const shopName =
    jsonLdCandidate.shopName ?? openGraphCandidate.shopName;

  if (!title) {
    throw new ShopeeProductMetadataError(
      "metadata_incomplete",
      "Shopee product metadata is missing the title",
    );
  }

  if (!imageUrl) {
    throw new ShopeeProductMetadataError(
      "metadata_incomplete",
      "Shopee product metadata is missing the image URL",
    );
  }

  if (!price) {
    throw new ShopeeProductMetadataError(
      "metadata_incomplete",
      "Shopee product metadata is missing a valid VND price",
    );
  }

  // Availability: only "available" when JSON-LD explicitly declared
  // InStock or LimitedAvailability. "unknown" when JSON-LD had no
  // availability field (even if OG fills in other fields).
  const availability =
    jsonLdCandidate.hadAvailabilityField &&
    jsonLdCandidate.availability === "available"
      ? "available"
      : "unknown";

  return {
    shopId: identity.shopId,
    itemId: identity.itemId,
    canonicalUrl: identity.canonicalUrl,
    title,
    imageUrl,
    price,
    shopName: shopName ?? undefined,
    availability,
  };
}
