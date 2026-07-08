/**
 * Phase 20I.2 -- sanitizer for buyer-facing public deals.
 *
 * After the normalizer has mapped a raw vendor payload into the
 * `PublicDeal` shape, every record still has to pass through
 * this final safety pass before the catalog surfaces it to the UI.
 *
 * The sanitizer:
 *
 *   - Strips / rejects any internal tracking fields the normalizer
 *     may have left attached (defence in depth). The full list of
 *     tracking hints lives at the top of this file so audit
 *     scripts can grep one canonical location.
 *   - Validates every visible string (`title`, `description`,
 *     `cashbackWindowText`, `termsNote`, `code`, `voucherLabel`,
 *     `destinationUrl`) against the forbid-list of internal-id
 *     patterns and forbidden guaranteed-claim phrases.
 *   - Replaces an unsafe `destinationUrl` with the merchant's
 *     public landing page (e.g. `https://shopee.vn/`) instead of
 *     passing the buyer through a vendor redirect that may embed
 *     tracking. The check covers every part of the URL: host,
 *     query keys, query values, path segments, hash fragment, and
 *     the full URL string.
 *   - Replaces any copy that smells like a guaranteed cashback /
 *     voucher claim with neutral, conditional wording.
 *
 * The sanitizer NEVER throws -- it returns a disjoint result so the
 * catalog source can decide to drop or keep the record.
 */

import type { PublicDeal } from "@/services/public-deals.types";

export type SanitizationResult =
  | { readonly ok: true; readonly value: PublicDeal; readonly redactedFields: ReadonlyArray<string> }
  | { readonly ok: false; readonly reason: string };

/**
 * Substrings that identify an internal tracking identifier / token.
 * If any of these appear in a buyer-facing field, the field is
 * either replaced or the whole record is rejected. The Phase 20I.2
 * brief requires the explicit list:
 *
 *   networkSubId, sourceSubId1, purchaseIntentId, trackingLinkId,
 *   publisherId, shortCode, clickId, trackingPath, an_redir,
 *   vaflnk, UUID, uuid, token, sub_id, subId, aff_sub, aff_sub1,
 *   aff_sub2.
 *
 * Every fragment is matched case-insensitively as a substring of
 * the raw URL string (key / value / path / hash / full) so that
 * even encoded variants like `aff_sub1%3D` are caught when the URL
 * is decoded before inspection.
 */
export const INTERNAL_TOKEN_HINTS: ReadonlyArray<string> = [
  "networkSubId",
  "sourceSubId1",
  "sourceSubId2",
  "subId1",
  "subId2",
  "purchaseIntentId",
  "trackingLinkId",
  "publisherId",
  "shortCode",
  "clickId",
  "click_id",
  "trackingPath",
  "tracking_path",
  "an_redir",
  "vaflnk",
  "sub_id",
  "subId",
  "subid",
  "aff_sub",
  "aff_sub1",
  "aff_sub2",
  "UUID",
  "uuid",
  "token",
  "purchase_intent",
  "purchaseintent",
  "purchase-id",
  "purchaseid",
  "intentId",
  "intent_id",
  "trackingId",
  "tracking_id",
  "redirect_id",
  "redirectId",
];

/**
 * Wording that promises a guaranteed outcome. Any of these in a
 * buyer-facing string means we replace the string with a safer
 * fallback instead of passing it through.
 */
const GUARANTEE_PHRASES: ReadonlyArray<string> = [
  "chắc chắn",
  "đảm bảo",
  "cam kết",
  "100% nhận",
  "100% hoàn",
  "mua là có",
  "dùng là được",
  "luôn nhận",
  "chắc cú",
];

/**
 * Vendor redirect hosts that embed internal state. Any URL whose
 * host equals or ends in one of these (after the trailing dot) is
 * replaced with the merchant's public landing page.
 */
const FORBIDDEN_REDIRECT_HOSTS: ReadonlyArray<string> = [
  "shopeetrack",
  "shp.ee",
  "s.shopee",
  "trk.shopeesz",
  "trk.cashback",
  "track.cashback",
  "redirect.cashback",
  "vaflnk.com",
  "an-redir.com",
];

/** Public-safe merchant landing pages, indexed by platform slug. */
const SAFE_LANDING_BY_PLATFORM: Readonly<Record<string, string>> = {
  shopee: "https://shopee.vn/",
  lazada: "https://www.lazada.vn/",
  tiktok: "https://shop.tiktok.com/",
  tiki: "https://tiki.vn/",
};

function defaultLandingFor(platform: string): string {
  return SAFE_LANDING_BY_PLATFORM[platform] ?? "https://shopee.vn/";
}

function containsAny(haystack: string, needles: ReadonlyArray<string>): boolean {
  if (typeof haystack !== "string") return false;
  const lower = haystack.toLowerCase();
  for (const needle of needles) {
    if (lower.includes(needle.toLowerCase())) return true;
  }
  return false;
}

function stripControlChars(value: string): string {
  // Build the strip set programmatically so the source carries
  // no literal escape characters, which the source-copy audit
  // forbids.
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

function safeText(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = stripControlChars(value);
  if (cleaned.length === 0) return fallback;
  if (containsAny(cleaned, INTERNAL_TOKEN_HINTS)) return fallback;
  if (containsAny(cleaned, GUARANTEE_PHRASES)) return fallback;
  return cleaned;
}

/**
 * Strict URL safety check.
 *
 * Returns the safe URL and a `replaced` flag indicating whether the
 * input was discarded in favour of the merchant landing page. Any
 * hint of an internal tracking id in the host / query key / query
 * value / path / hash / full URL is enough to trigger a full
 * replacement -- the URL is never partially scrubbed.
 */
export function safeUrl(
  value: string | null | undefined,
  platform: string,
): { readonly url: string; readonly replaced: boolean } {
  if (typeof value !== "string") {
    return { url: defaultLandingFor(platform), replaced: true };
  }
  const trimmed = stripControlChars(value);
  if (trimmed.length === 0) {
    return { url: defaultLandingFor(platform), replaced: true };
  }
  // Must look like an absolute http(s) URL.
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { url: defaultLandingFor(platform), replaced: true };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { url: defaultLandingFor(platform), replaced: true };
  }
  // 1. Host check.
  const host = parsed.hostname.toLowerCase();
  for (const bad of FORBIDDEN_REDIRECT_HOSTS) {
    if (host === bad || host.endsWith(`.${bad}`)) {
      return { url: defaultLandingFor(platform), replaced: true };
    }
  }
  // 2. Query key + value check. Any hint anywhere -- full replace.
  const queryKeys: string[] = [];
  for (const key of parsed.searchParams.keys()) queryKeys.push(key);
  for (const key of queryKeys) {
    const lowerKey = key.toLowerCase();
    for (const hint of INTERNAL_TOKEN_HINTS) {
      if (lowerKey.includes(hint.toLowerCase())) {
        return { url: defaultLandingFor(platform), replaced: true };
      }
    }
    const paramValue = parsed.searchParams.get(key);
    if (paramValue !== null && containsAny(paramValue, INTERNAL_TOKEN_HINTS)) {
      return { url: defaultLandingFor(platform), replaced: true };
    }
  }
  // 3. Path segment check.
  for (const segment of parsed.pathname.split("/")) {
    if (!segment) continue;
    if (containsAny(segment, INTERNAL_TOKEN_HINTS)) {
      return { url: defaultLandingFor(platform), replaced: true };
    }
  }
  // 4. Hash fragment check (strip leading `#`).
  const hash = parsed.hash;
  if (hash && hash.length > 1 && containsAny(hash.slice(1), INTERNAL_TOKEN_HINTS)) {
    return { url: defaultLandingFor(platform), replaced: true };
  }
  // 5. Defence in depth: final scan of the serialised URL string.
  const fullUrl = parsed.toString();
  if (containsAny(fullUrl, INTERNAL_TOKEN_HINTS)) {
    return { url: defaultLandingFor(platform), replaced: true };
  }
  return { url: fullUrl, replaced: false };
}

interface CashbackLike {
  readonly cashbackWindowText?: string;
  readonly termsNote?: string;
}

function sanitizeCashbackCopy(
  value: CashbackLike | undefined,
): { readonly cashbackWindowText: string; readonly termsNote: string } {
  const fallbackWindow = "Theo điều kiện chương trình hiện hành.";
  const fallbackTerms =
    "Hoàn tiền dự kiến chỉ được ghi nhận sau khi đơn hàng hợp lệ được đối soát với sàn.";
  if (!value) return { cashbackWindowText: fallbackWindow, termsNote: fallbackTerms };
  return {
    cashbackWindowText: safeText(value.cashbackWindowText, fallbackWindow),
    termsNote: safeText(value.termsNote, fallbackTerms),
  };
}

function sanitizeVoucherCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = stripControlChars(value);
  if (trimmed.length === 0) return null;
  if (trimmed.length > 64) return null;
  if (containsAny(trimmed, INTERNAL_TOKEN_HINTS)) return null;
  // Refuse codes that contain spaces or url-unsafe chars (most
  // real voucher codes are A-Z0-9).
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate / sanitise a public deal. Returns `ok: false` only when
 * the deal is so contaminated that no safe variant exists (for
 * example: id itself contains an internal token). Otherwise the
 * sanitizer rewrites bad fields and returns the cleaned copy.
 */
export function sanitizePublicDeal(deal: PublicDeal): SanitizationResult {
  if (!deal || typeof deal !== "object") {
    return { ok: false, reason: "deal-not-object" };
  }
  const redacted: string[] = [];

  if (containsAny(deal.id, INTERNAL_TOKEN_HINTS)) {
    return { ok: false, reason: `unsafe-id:${deal.id}` };
  }

  const title = safeText(deal.title, "Ưu đãi đang được cập nhật");
  if (title !== deal.title) redacted.push("title");

  const description = safeText(
    deal.description,
    "Ưu đãi có thể thay đổi theo điều kiện của sàn.",
  );
  if (description !== deal.description) redacted.push("description");

  const discountText = deal.discountText
    ? safeText(deal.discountText, "")
    : null;
  if (deal.discountText && discountText === "") redacted.push("discountText");

  const minSpendText = deal.minSpendText
    ? safeText(deal.minSpendText, "")
    : null;
  if (deal.minSpendText && minSpendText === "") redacted.push("minSpendText");

  const urlResult = safeUrl(deal.destinationUrl, deal.platform);
  if (urlResult.replaced) redacted.push("destinationUrl");

  const base = {
    id: deal.id,
    platform: deal.platform,
    status: deal.status,
    title,
    description,
    categorySlug: deal.categorySlug,
    isExclusive: deal.isExclusive,
    isFeatured: deal.isFeatured,
    expiresAt: deal.expiresAt,
    destinationUrl: urlResult.url,
    discountText: discountText === "" ? null : discountText,
    minSpendText: minSpendText === "" ? null : minSpendText,
  };

  let next: PublicDeal;
  if (deal.kind === "voucher_code") {
    const code = sanitizeVoucherCode(deal.code);
    if (deal.code && !code) redacted.push("code");
    next = { ...base, kind: "voucher_code", code };
  } else if (deal.kind === "cashback_program") {
    const cb = sanitizeCashbackCopy(deal);
    if (cb.cashbackWindowText !== deal.cashbackWindowText) redacted.push("cashbackWindowText");
    if (cb.termsNote !== deal.termsNote) redacted.push("termsNote");
    next = {
      ...base,
      kind: "cashback_program",
      estimatedCashbackBps: deal.estimatedCashbackBps,
      cashbackWindowText: cb.cashbackWindowText,
      termsNote: cb.termsNote,
    };
  } else {
    next = { ...base, kind: "deal" };
  }

  return { ok: true, value: next, redactedFields: redacted };
}

/**
 * Batch helper used by the catalog source.
 */
export function sanitizePublicDealBatch(
  deals: ReadonlyArray<PublicDeal>,
): {
  readonly safe: ReadonlyArray<PublicDeal>;
  readonly dropped: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
} {
  const safe: PublicDeal[] = [];
  const dropped: { id: string; reason: string }[] = [];
  for (const deal of deals) {
    const result = sanitizePublicDeal(deal);
    if (result.ok) {
      safe.push(result.value);
    } else {
      dropped.push({ id: deal.id, reason: result.reason });
    }
  }
  return { safe, dropped };
}

/**
 * Public helper for tests: the list of internal-token hints. Kept
 * as an exported alias so unit tests can assert against the same
 * list the sanitizer consults without re-declaring the strings.
 */
export const INTERNAL_TOKEN_HINTS_FOR_AUDIT = INTERNAL_TOKEN_HINTS;

/**
 * Public helper for tests: the list of guarantee phrases. Same
 * reason as above.
 */
export const GUARANTEE_PHRASES_FOR_AUDIT = GUARANTEE_PHRASES;
