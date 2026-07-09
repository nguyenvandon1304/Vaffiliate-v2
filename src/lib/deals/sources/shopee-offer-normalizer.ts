/**
 * Phase 20I.4 -- pure Shopee Open API v2 raw-offer -> RawOffer
 * normalizers.
 *
 * Each normalizer is a defensive parser that maps one vendor row
 * into the canonical `RawOffer` envelope that the existing
 * `public-deal-normalizer.ts` already consumes. The three
 * normalizers are deliberately independent (no shared mutable
 * state) so unit tests can drive each one in isolation.
 *
 * Strict invariants:
 *
 *   - Never throw. Every malformed input either produces an
 *     `ok: false` result or an `ok: true` value with warnings.
 *   - Never fabricate a voucher code. `kind: "voucher_code"` only
 *     stays when the source actually carried a `voucherLabel` /
 *     `voucherCode` -- the Shopee v2 endpoints do NOT carry a
 *     voucher code, so this normalizer emits `kind: "deal"` for
 *     every record.
 *   - Never leak internal IDs. `productId`, `shopId`, `brandId`,
 *     `categoryId`, `collectionId`, `offerType` are NOT carried
 *     forward into `RawOffer.extra`.
 *   - Never label a commissionRate as confirmed user cashback.
 *     The normalizer forwards `commissionRate` and `cashbackLabel`
 *     into the catalog so the UI can render conditional wording;
 *     the UI / sanitiser are still responsible for the buyer-safe
 *     copy.
 *   - commissionRate may arrive as `string` or `number`. We coerce
 *     safely with `Number()` + finite check.
 *   - periodStartTime / periodEndTime are epoch seconds. The
 *     normalizer converts to ISO-8601. We do NOT divide by 1000.
 */

import type { DealPlatform } from "@/services/public-deals.types";

import type { RawOffer } from "./public-offer-feed.types";
import type {
  BrandOfferV2Raw,
  ProductOfferV2Raw,
  ShopeeOfferV2Raw,
} from "./shopee-offer-raw.types";

export type NormalizeShopeeResult =
  | { readonly ok: true; readonly value: RawOffer; readonly warnings: ReadonlyArray<string> }
  | { readonly ok: false; readonly reason: string };

const PLATFORM: DealPlatform = "shopee";

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function safeInt(value: unknown): number | null {
  const n = safeNumber(value);
  if (n === null) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

function epochSecondsToIso(value: unknown): string | null {
  const n = safeInt(value);
  if (n === null) return null;
  if (n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function safeVendorIdSuffix(
  prefix: "shopeeOfferV2" | "brandOfferV2" | "productOfferV2",
  value: string | null | undefined,
): string {
  const seed = value ?? "";
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) >>> 0;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `${prefix}-${h.toString(16).padStart(8, "0")}`;
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function safeRating(value: unknown): string | null {
  // Phase 20I.4 follow-up -- defensive rating parser. Accepts
  // numeric values (4.5 / "4.5") and clamps to the [0..5] range. The
  // sanitiser runs again on the buyer-facing value.
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 0 || value > 5) return null;
    return value.toFixed(1);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n < 0 || n > 5) return null;
    return n.toFixed(1);
  }
  return null;
}

function safeIntArray(value: unknown): ReadonlyArray<number> | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const v of value) {
    if (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 1000000) {
      out.push(v);
    }
  }
  return out.length > 0 ? out : null;
}

function safePriceText(value: unknown): string | null {
  // Phase 20I.4 follow-up -- price is a string-only forward. We do
  // NOT yet model price on the buyer-facing PublicDeal (Phase 20I.5+
  // will model it explicitly), but we keep the parsed string here so
  // a future adapter can read it without re-parsing the raw payload.
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function pickSafestUrl(
  offerLink: unknown,
  originalLink: unknown,
): string | null {
  const offerStr = safeString(offerLink);
  const originalStr = safeString(originalLink);
  // Prefer the affiliate offerLink because that is the path the
  // platform's tracking link generator uses; the sanitiser still
  // scrubs any internal hint. Fall back to originalLink otherwise.
  return offerStr ?? originalStr;
}

/**
 * Normalize one shopeeOfferV2 row.
 */
export function normalizeShopeeOfferV2Raw(
  raw: ShopeeOfferV2Raw,
): NormalizeShopeeResult {
  const warnings: string[] = [];
  const title = safeString(raw.offerName);
  if (!title) return { ok: false, reason: "missing-title" };
  const vendorId = safeVendorIdSuffix(
    "shopeeOfferV2",
    raw.offerLink ?? raw.originalLink ?? title,
  );
  const destinationUrl = pickSafestUrl(raw.offerLink, raw.originalLink);
  if (!destinationUrl) warnings.push("missing-destination-url");
  const offerLink = safeString(raw.offerLink);
  const commissionRate = safeNumber(raw.commissionRate);
  const startsAt = epochSecondsToIso(raw.periodStartTime);
  const endsAt = epochSecondsToIso(raw.periodEndTime);
  return {
    ok: true,
    value: {
      vendorId,
      platform: PLATFORM,
      kind: "deal",
      title,
      imageUrl: safeString(raw.imageUrl) ?? undefined,
      destinationUrl: destinationUrl ?? undefined,
      validFrom: startsAt ?? undefined,
      validUntil: endsAt ?? undefined,
      status: "active",
      tracking: undefined,
      extra: undefined,
      // Phase 20I.4 follow-up -- forward the buyer-facing offer
      // metadata so the sanitiser can decide what to surface.
      offerLink: offerLink ?? undefined,
      commissionRate: commissionRate ?? undefined,
      cashbackHint: commissionRate !== null
        ? `Hoa hồng chiến dịch ${(commissionRate * 100).toFixed(2)}%`
        : undefined,
    },
    warnings,
  };
}

/**
 * Normalize one brandOfferV2 row.
 */
export function normalizeBrandOfferV2Raw(
  raw: BrandOfferV2Raw,
): NormalizeShopeeResult {
  const warnings: string[] = [];
  const title = safeString(raw.brandName);
  if (!title) return { ok: false, reason: "missing-title" };
  const vendorId = safeVendorIdSuffix(
    "brandOfferV2",
    String(raw.brandId ?? "") + "|" + title,
  );
  const destinationUrl = pickSafestUrl(raw.offerLink, raw.originalLink);
  if (!destinationUrl) warnings.push("missing-destination-url");
  const commissionRate = safeNumber(raw.commissionRate);
  const startsAt = epochSecondsToIso(raw.periodStartTime);
  const endsAt = epochSecondsToIso(raw.periodEndTime);
  return {
    ok: true,
    value: {
      vendorId,
      platform: PLATFORM,
      kind: "deal",
      title,
      imageUrl: safeString(raw.imageUrl) ?? undefined,
      destinationUrl: destinationUrl ?? undefined,
      validFrom: startsAt ?? undefined,
      validUntil: endsAt ?? undefined,
      status: "active",
      tracking: undefined,
      extra: undefined,
      offerLink: safeString(raw.offerLink) ?? undefined,
      commissionRate: commissionRate ?? undefined,
      cashbackHint: commissionRate !== null
        ? `Hoa hồng chiến dịch ${(commissionRate * 100).toFixed(2)}%`
        : undefined,
    },
    warnings,
  };
}

/**
 * Normalize one productOfferV2 row.
 */
export function normalizeProductOfferV2Raw(
  raw: ProductOfferV2Raw,
): NormalizeShopeeResult {
  const warnings: string[] = [];
  const title = safeString(raw.productName);
  if (!title) return { ok: false, reason: "missing-title" };
  const vendorId = safeVendorIdSuffix(
    "productOfferV2",
    String(raw.shopId ?? "") + "|" + title,
  );
  // Phase 20I.4 follow-up -- destinationUrl is the offer/affiliate
  // link; productLink stays as a separate field so the UI can show
  // "Xem sản phẩm" without aliasing the two. The sanitiser scrubs
  // each URL independently before reaching the buyer.
  const offerLink = safeString(raw.offerLink);
  const productLink = safeString(raw.productLink);
  const destinationUrl = offerLink ?? productLink;
  if (!destinationUrl) warnings.push("missing-destination-url");
  const commissionRate = safeNumber(raw.commissionRate);
  const startsAt = epochSecondsToIso(raw.periodStartTime);
  const endsAt = epochSecondsToIso(raw.periodEndTime);
  const shopName = safeString(raw.shopName);
  const rating = safeRating(raw.ratingStar);
  const productCatIds = safeIntArray(raw.productCatIds);
  const priceText = (() => {
    const p = safePriceText(raw.price);
    const min = safePriceText(raw.priceMin);
    const max = safePriceText(raw.priceMax);
    if (p) return p;
    if (min && max) return `${min}-${max}`;
    return null;
  })();
  return {
    ok: true,
    value: {
      vendorId,
      platform: PLATFORM,
      kind: "deal",
      title,
      imageUrl: safeString(raw.imageUrl) ?? undefined,
      destinationUrl: destinationUrl ?? undefined,
      validFrom: startsAt ?? undefined,
      validUntil: endsAt ?? undefined,
      status: "active",
      tracking: undefined,
      extra: undefined,
      // Phase 20I.4 follow-up -- forward the buyer-facing product
      // metadata. The sanitiser will scrub any of these that look
      // like tracking hints or fail validation.
      offerLink: offerLink ?? undefined,
      productLink: productLink ?? undefined,
      commissionRate: commissionRate ?? undefined,
      shopName: shopName ?? undefined,
      rating: rating ?? undefined,
      productCatIds: productCatIds ?? undefined,
      priceText: priceText ?? undefined,
      cashbackHint: commissionRate !== null
        ? `Hoa hồng chiến dịch ${(commissionRate * 100).toFixed(2)}%`
        : undefined,
    },
    warnings,
  };
}
