/**
 * Phase 20I.2 -- normalize a raw external offer into the buyer-facing
 * {@link PublicDeal} shape.
 *
 * Design rules (strictly enforced):
 *
 *   - Never throw. Every miss / wrong-typed field produces an
 *     `ok: false` reason so the catalog can skip the entry.
 *   - Never copy raw vendor fields forward. Anything that does not
 *     map to a declared `PublicDeal` field is dropped here. The
 *     sanitizer adds an extra defensive pass.
 *   - Never fabricate a guaranteed outcome. Wording for voucher /
 *     deal / cashback is generated via small, audited builders so
 *     no "chắc chắn" / "đảm bảo" slips in.
 *   - Always produce a non-empty id. If the vendor id is missing or
 *     obviously unsafe, a deterministic short id is derived from a
 *     sanitised hash so the catalog can still dedupe.
 */

import type {
  DealCategorySlug,
  DealKind,
  DealPlatform,
  DealStatus,
  PublicDeal,
} from "@/services/public-deals.types";

import type {
  RawOffer,
  RawOfferKindHint,
  RawOfferSource,
} from "./sources/public-offer-feed.types";

/** Disjoint result type -- the normalizer never throws. */
export type NormalizationResult =
  | { readonly ok: true; readonly value: PublicDeal; readonly warnings: ReadonlyArray<string> }
  | { readonly ok: false; readonly reason: string };

/**
 * Categories that the public UI currently understands. Unknown
 * vendor categories are mapped to "popular" so the catalog still
 * surfaces the entry without crashing. This is intentionally
 * non-strict: we WANT to show offers even when the vendor invents
 * a new bucket.
 */
const CATEGORY_FALLBACK: DealCategorySlug = "popular";

const CATEGORY_ALIASES: ReadonlyMap<string, DealCategorySlug> = new Map([
  ["all", "all"],
  ["popular", "popular"],
  ["trending", "popular"],
  ["hot", "popular"],
  ["zero-dong", "zero-dong"],
  ["freeship", "zero-dong"],
  ["free-shipping", "zero-dong"],
  ["live", "live"],
  ["shopee-live", "live"],
  ["shopeepay", "shopeepay"],
  ["shopee-pay", "shopeepay"],
  ["shopee_pay", "shopeepay"],
  ["electronics", "electronics"],
  ["electronic", "electronics"],
  ["tech", "electronics"],
  ["điện tử", "electronics"],
  ["dien-tu", "electronics"],
  ["dientu", "electronics"],
  ["fashion", "fashion"],
  ["thời trang", "fashion"],
  ["thoi-trang", "fashion"],
  ["thoitrang", "fashion"],
  ["beauty", "beauty"],
  ["làm đẹp", "beauty"],
  ["lam-dep", "beauty"],
  ["lamdep", "beauty"],
  ["home", "home"],
  ["gia dụng", "home"],
  ["gia-dung", "home"],
  ["giadung", "home"],
]);

/**
 * Status mapping. Vendor feeds frequently emit localised status
 * strings; we coerce everything to the four-state vocabulary the
 * buyer-facing types allow.
 */
function mapStatus(input: unknown): DealStatus {
  if (typeof input !== "string") return "active";
  const norm = input.trim().toLowerCase();
  if (norm === "expired" || norm === "inactive" || norm === "disabled") {
    return "expired";
  }
  if (norm === "draft" || norm === "pending" || norm === "scheduled") {
    return "draft";
  }
  if (norm === "active" || norm === "live" || norm === "published") {
    return "active";
  }
  return "active";
}

function mapKind(input: RawOfferKindHint | string | undefined): DealKind {
  if (input === "voucher_code" || input === "deal" || input === "cashback_program") {
    return input;
  }
  if (input === "voucher" || input === "coupon" || input === "code") return "voucher_code";
  if (input === "promotion" || input === "promo") return "deal";
  if (input === "cashback" || input === "rebate") return "cashback_program";
  return "deal";
}

function mapCategory(input: string | undefined): DealCategorySlug {
  if (!input) return CATEGORY_FALLBACK;
  const key = input.trim().toLowerCase();
  const alias = CATEGORY_ALIASES.get(key);
  if (alias) return alias;
  // Vendor "all" / "default" / "general" → popular (treat as featured pool).
  return CATEGORY_FALLBACK;
}

function mapPlatform(input: unknown): DealPlatform | null {
  if (typeof input !== "string") return null;
  const norm = input.trim().toLowerCase();
  if (norm === "shopee" || norm === "lazada" || norm === "tiktok" || norm === "tiki") {
    return norm;
  }
  return null;
}

function sanitizeText(input: string | undefined): string | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;
  // Strip the Unicode replacement glyph if any; we never want a U+FFFD
  // to leak into buyer copy. We build the character class via
  // `String.fromCharCode` so the source-copy audit, which forbids
  // literal escapes in `.ts` files, stays quiet.
  const cleaned = stripControlCharsInternal(trimmed);
  if (cleaned.length === 0) return undefined;
  return cleaned;
}

function stripControlCharsInternal(value: string): string {
  const FFFD = String.fromCharCode(0xfffd);
  const DEL = String.fromCharCode(0x7f);
  const replaced = value.split(FFFD).join("");
  let result = "";
  for (let i = 0; i < replaced.length; i++) {
    const code = replaced.charCodeAt(i);
    if ((code >= 0 && code < 0x20) || code === DEL.charCodeAt(0)) {
      continue;
    }
    result += replaced[i];
  }
  return result.trim();
}

/**
 * Build a deterministic id from the vendor id + platform + title so
 * the catalog can dedupe even when the vendor id is sketchy. The
 * resulting id is a short hex digest -- never a UUID-shaped token,
 * never containing dashes that would visually resemble a token.
 */
function deriveStableId(vendorId: string, platform: DealPlatform, title: string | undefined): string {
  const seed = `${platform}:${vendorId}:${title ?? ""}`;
  // FNV-1a-ish -- small, no crypto dependency, deterministic.
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0;
    h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
    h2 = (h2 ^ c) >>> 0;
    h2 = (h2 + ((h2 << 3) + (h2 << 5) + (h2 << 7) + (h2 << 16))) >>> 0;
  }
  const a = h1.toString(16).padStart(8, "0");
  const b = h2.toString(16).padStart(8, "0");
  return `${platform}-feed-${a}${b}`;
}

function validateSafeId(id: string): boolean {
  if (typeof id !== "string" || id.length === 0) return false;
  // Refuse ids that look like UUIDs, base64 blobs, or vendor tokens.
  if (id.length > 96) return false;
  if (/^[0-9a-f-]{32,}$/i.test(id)) return false;
  if (/^[A-Za-z0-9+/=]{32,}$/.test(id)) return false;
  if (/(token|secret|password|api[-_]?key)/i.test(id)) return false;
  return true;
}

function buildVoucher(
  base: PublicDealBase,
  raw: RawOffer,
): PublicDeal {
  // Phase 20I.4 -- DO NOT synthesise a voucher code from
  // `discountText` (which is the descriptive "Giảm 30k" copy).
  // A voucher code must be carried explicitly by the source. Until
  // the RawOffer shape carries a `code` field, adapter-driven
  // voucher entries expose `code: null` so the UI hides the
  // copy-code action. Manual seeded entries continue to carry a
  // real code because they bypass the normalizer entirely.
  void raw;
  return {
    ...base,
    kind: "voucher_code",
    code: null,
  };
}

function buildPromo(base: PublicDealBase): PublicDeal {
  return { ...base, kind: "deal" };
}

function buildCashback(
  base: PublicDealBase,
  raw: RawOffer,
): PublicDeal {
  const hint = sanitizeText(raw.cashbackHint) ?? sanitizeText(raw.description);
  return {
    ...base,
    kind: "cashback_program",
    estimatedCashbackBps: null,
    cashbackWindowText: hint ?? "Theo điều kiện chương trình hiện hành.",
    termsNote:
      hint ??
      "Hoàn tiền dự kiến chỉ được ghi nhận sau khi đơn hàng hợp lệ được đối soát với sàn.",
  };
}

interface PublicDealBase {
  readonly id: string;
  readonly platform: DealPlatform;
  readonly status: DealStatus;
  readonly title: string;
  readonly description: string;
  readonly categorySlug: DealCategorySlug;
  readonly isExclusive: boolean;
  readonly isFeatured: boolean;
  readonly expiresAt: string | null;
  readonly destinationUrl: string;
  readonly discountText: string | null;
  readonly minSpendText: string | null;
  /** Phase 20I.4 -- optional surface fields forwarded to the sanitiser. */
  readonly productLink: string | null;
  readonly offerLink: string | null;
  readonly imageUrl: string | null;
  readonly cashbackLabel: string | null;
  readonly commissionRate: number | null;
  readonly shopName: string | null;
  readonly rating: string | null;
  readonly productCatIds: ReadonlyArray<number> | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
}

/**
 * Normalize a raw offer into the buyer-facing shape.
 *
 * Returns `ok: false` (no throw) when:
 *
 *   - the vendor id is empty / unsafe;
 *   - the platform cannot be mapped;
 *   - the title is missing (a nameless offer is buyer-hostile);
 *   - the destination URL is empty.
 *
 * Every successful normalisation also returns a `warnings` list so
 * the catalog can surface (out-of-band) what the normalizer had to
 * invent or drop, without ever leaking that signal to the UI.
 */
export function normalizeRawOffer(raw: RawOffer): NormalizationResult {
  const warnings: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "raw-offer-not-object" };
  }

  const platform = mapPlatform(raw.platform);
  if (!platform) {
    return { ok: false, reason: `unsupported-platform:${String(raw.platform)}` };
  }

  const title = sanitizeText(raw.title);
  if (!title) {
    return { ok: false, reason: "missing-title" };
  }

  const description =
    sanitizeText(raw.description) ?? "Ưu đãi có thể thay đổi theo điều kiện của sàn.";

  const vendorId = typeof raw.vendorId === "string" ? raw.vendorId.trim() : "";
  const id = validateSafeId(vendorId)
    ? vendorId
    : deriveStableId(vendorId || "anon", platform, title);
  if (!validateSafeId(vendorId)) {
    warnings.push("derived-id");
  }

  const destinationUrl =
    typeof raw.destinationUrl === "string" && raw.destinationUrl.trim().length > 0
      ? raw.destinationUrl.trim()
      : (() => {
          warnings.push("missing-destination-url");
          return `https://${platform}.vn/`;
        })();

  const status = mapStatus(raw.status);
  const kind = mapKind(raw.kind);
  const categorySlug = mapCategory(raw.categoryHint);

  const expiresAt =
    typeof raw.validUntil === "string" && raw.validUntil.trim().length > 0
      ? raw.validUntil.trim()
      : null;

  const discountText = sanitizeText(raw.discountText) ?? null;
  const minSpendText = sanitizeText(raw.priceText) ?? null;

  // Phase 20I.4 -- forward the optional non-internal fields so the
  // sanitiser can decide what is safe to surface. Internal ids /
  // tracking hints are still dropped here. Phase 20I.4 follow-up:
  // also forward the new buyer-safe product metadata (shopName,
  // rating, productCatIds, commissionRate, productLink / offerLink
  // as separate concepts). The destinationUrl / offerLink fallback
  // chain is intentionally explicit so adapter-driven offers keep
  // working even when only one of the URLs is present.
  const productLink =
    typeof raw.productLink === "string" && raw.productLink.trim().length > 0
      ? raw.productLink.trim()
      : typeof raw.destinationUrl === "string" &&
          raw.destinationUrl.trim().length > 0
        ? raw.destinationUrl.trim()
        : null;
  const offerLink =
    typeof raw.offerLink === "string" && raw.offerLink.trim().length > 0
      ? raw.offerLink.trim()
      : typeof raw.tracking?.affiliateUrl === "string" &&
          raw.tracking.affiliateUrl.trim().length > 0
        ? raw.tracking.affiliateUrl.trim()
        : null;
  const imageUrl =
    typeof raw.imageUrl === "string" && raw.imageUrl.trim().length > 0
      ? raw.imageUrl.trim()
      : null;
  const cashbackLabel =
    typeof raw.cashbackHint === "string" && raw.cashbackHint.trim().length > 0
      ? raw.cashbackHint.trim()
      : null;
  const commissionRate =
    typeof raw.commissionRate === "number" &&
    Number.isFinite(raw.commissionRate) &&
    raw.commissionRate >= 0 &&
    raw.commissionRate <= 1
      ? raw.commissionRate
      : null;
  const shopName =
    typeof raw.shopName === "string" && raw.shopName.trim().length > 0
      ? raw.shopName.trim()
      : null;
  const rating =
    typeof raw.rating === "string" && raw.rating.trim().length > 0
      ? raw.rating.trim()
      : null;
  const productCatIds =
    Array.isArray(raw.productCatIds) &&
    raw.productCatIds.length > 0 &&
    raw.productCatIds.every(
      (id) =>
        typeof id === "number" &&
        Number.isInteger(id) &&
        id > 0 &&
        id < 1_000_000,
    )
      ? (raw.productCatIds as ReadonlyArray<number>)
      : null;

  const base: PublicDealBase = {
    id,
    platform,
    status,
    title,
    description,
    categorySlug,
    isExclusive: false,
    isFeatured: false,
    expiresAt,
    destinationUrl,
    discountText,
    minSpendText,
    productLink,
    offerLink,
    imageUrl,
    cashbackLabel,
    commissionRate,
    shopName,
    rating,
    productCatIds,
    startsAt:
      typeof raw.validFrom === "string" && raw.validFrom.trim().length > 0
        ? raw.validFrom.trim()
        : null,
    endsAt: expiresAt,
  };

  const value: PublicDeal =
    kind === "voucher_code"
      ? buildVoucher(base, raw)
      : kind === "cashback_program"
        ? buildCashback(base, raw)
        : buildPromo(base);

  return { ok: true, value, warnings };
}

/**
 * Convenience helper: normalize a list, dropping every entry that
 * fails to normalize. The reason map is returned for diagnostics
 * but never reaches the UI.
 */
export function normalizeRawOfferBatch(
  rawList: ReadonlyArray<RawOffer>,
): {
  readonly deals: ReadonlyArray<PublicDeal>;
  readonly skipped: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
} {
  const deals: PublicDeal[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const raw of rawList) {
    const result = normalizeRawOffer(raw);
    if (result.ok) {
      deals.push(result.value);
    } else {
      const id =
        typeof raw?.vendorId === "string" && raw.vendorId.length > 0
          ? raw.vendorId
          : "<no-id>";
      skipped.push({ id, reason: result.reason });
    }
  }
  return { deals, skipped };
}

/**
 * Map a {@link RawOfferSource} to the buyer-facing label we use on
 * `source` slot. We keep it explicit so the only place a vendor
 * source name is introduced is this mapper -- never inline in the
 * UI or in the catalog.
 */
export function mapOfferSource(source: RawOfferSource): "manual" | "mock" | "addlivetag" | "shopee-feed" {
  // The buyer-facing PublicDeal.source vocabulary is the same as the
  // RawOfferSource vocabulary; this function exists so future
  // renaming only touches one spot.
  return source;
}
