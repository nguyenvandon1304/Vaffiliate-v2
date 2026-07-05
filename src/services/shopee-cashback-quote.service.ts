/**
 * Phase 20H.2 -- Shopee cashback quote application service.
 *
 * Orchestrates URL resolution, metadata enrichment, offer selection,
 * and cashback allocation. Never trusts price/cashback/commission
 * data from the client.
 *
 * The module is intentionally side-effect free apart from its
 * dependency imports so it can be unit-tested with `node --test`.
 * The companion `*.service.server.ts` re-export module is the one
 * that should be imported from Server Actions because it adds the
 * `server-only` guard.
 *
 * Two result shapes are produced:
 *
 *   - {@link resolveShopeeCashbackQuoteWithDeps} — the strict
 *     `ShopeeCashbackQuoteResult` that fails on any missing
 *     dependency. Used by callers that want a hard quote.
 *
 *   - {@link resolveShopeeProductPreviewWithDeps} — the wider
 *     `ShopeeProductPreviewResult` that preserves product metadata
 *     even when the quote cannot be computed. Server Actions use
 *     this so the product preview card always renders as much
 *     information as the dependency chain actually delivered.
 */

import type { ShopeeProductIdentity } from "@/lib/shopee/product-identity";
import { calculateCashbackAllocation } from "@/lib/cashback/cashback-policy";
import type { Money } from "@/types/affiliate";
import type { CampaignId, OfferId } from "@/types/ids";
import type { ShopeeProductMetadataProvider } from "@/lib/shopee/product-metadata/types";
import type {
  ShopeeUnikornCommissionProvider,
} from "@/lib/shopee/product-metadata/unikorn-commission-client";
import type {
  ProductResolutionFailureCode,
  QuoteUnavailableReason,
  ShopeeCashbackQuote,
  ShopeeCashbackQuoteResult,
  ShopeeProductMetadataView,
  ShopeeProductPreviewResult,
} from "./shopee-cashback-quote.types";
import type { ShopeeOfferSelector } from "./shopee-offer-selector";
import type { ShopeeCatalogRepository } from "./shopee-offer-selector";
import { createShopeeOfferSelector } from "./shopee-offer-selector.factory";
import type {
  ShopeeOfferSelectorFixtureLookup,
} from "./shopee-offer-selector.factory";

export interface ResolveShopeeInput {
  productUrl: unknown;
}

export interface ResolveShopeeDependencies {
  /**
   * Resolves a Shopee product URL to a typed product identity.
   * Required — the pure service does not provide a default.
   * Production wiring supplies `resolveShopeeProductUrl`.
   */
  resolveUrl: (input: unknown) => Promise<ShopeeProductIdentity>;
  /**
   * Fetches enriched product metadata for a resolved identity.
   * Required — the pure service does not provide a default.
   * Production wiring supplies the server-guarded metadata provider.
   */
  metadataProvider: ShopeeProductMetadataProvider;
  /**
   * Selects the active Shopee offer for the product.
   * Required — the service throws if neither this nor `shopeeCatalogRepository`
   * is supplied.
   */
  offerSelector?: ShopeeOfferSelector;
  /**
   * Canonical Shopee affiliate catalog repository. If supplied alongside a
   * missing `offerSelector`, the service lazily composes a selector from it.
   */
  shopeeCatalogRepository?: ShopeeCatalogRepository;
  /**
   * Optional identity-aware commission-rate fallback consulted by the
   * offer selector last-resort path. Forwarded to
   * `createShopeeOfferSelector` whenever the service lazily composes a
   * selector from `shopeeCatalogRepository` (production wiring also
   * surfaces it through {@link resolveShopeeProductPreview}'s own
   * `offerSelector` field, which already accepts the option).
   *
   * Phase 20H.3d: production supplies
   * `lookupDevelopmentShopeeCommissionRateBps` so the canonical
   * fixture product produces an `available` quote end-to-end.
   */
  lookupFixtureCommissionRateBps?: ShopeeOfferSelectorFixtureLookup;
  /**
   * Cashback allocation function. Defaults to the canonical policy when omitted.
   */
  calculateAllocation?: typeof calculateCashbackAllocation;
  /**
   * Clock. Defaults to `() => new Date()` when omitted.
   */
  now?: () => Date;
  /**
   * Phase 20H.3f -- Unikorn Shopee Product Data API commission
   * provider. The service consults the provider FIRST as the
   * authoritative commission source whenever it is configured on the
   * dependency bundle.
   *
   * Precedence order in the preview quote path:
   *
   *   1. Unikorn commission provider (`unikornCommissionProvider`)
   *      when configured. A successful response (validated
   *      `commissionVnd > 0`) produces an `available` quote directly
   *      with `commissionSource = "unikorn_api"`, regardless of
   *      whether the offer selector returns eligible.
   *   2. The offer selector + catalog/fixture path, which is consulted
   *      only when Unikorn is absent, fails, times out, or returns an
   *      invalid commission value.
   *
   * The provider is never trusted with cashback math: it only
   * supplies the validated `productInfo.commission` value, which the
   * service feeds through the canonical cashback policy.
   *
   * Production wires the server-only Unikorn commission client.
   * Tests may omit this field to exercise the offer-selector-only
   * path (e.g. the canonical fixture regression test).
   */
  unikornCommissionProvider?: ShopeeUnikornCommissionProvider;
}

export interface ResolveShopeeContext {
  readonly identity: ShopeeProductIdentity;
  readonly product: import("@/lib/shopee/product-metadata/types").ShopeeProductMetadata;
  readonly now: () => Date;
}

export type ProductResolutionFailure = {
  readonly ok: false;
  readonly reason: ProductResolutionFailureCode;
  readonly message: string;
  /**
   * Server-resolved canonical URL, present when resolveUrl succeeded
   * but a later step (metadata fetch) failed. Used for purchase fallback.
   */
  readonly canonicalUrl?: string;
};

const PRODUCT_RESOLUTION_INPUT_MESSAGES = {
  invalid_input:
    "Vui lòng cung cấp liên kết sản phẩm Shopee dưới dạng chuỗi.",
  invalid_url:
    "Liên kết Shopee không hợp lệ.",
  unsupported_host:
    "Liên kết này không thuộc hệ thống Shopee được hỗ trợ.",
  not_product_url:
    "Không nhận diện được sản phẩm từ liên kết Shopee này.",
  redirect_failed:
    "Không thể theo dõi chuyển hướng của Shopee. Vui lòng thử lại.",
  too_many_redirects:
    "Liên kết Shopee chuyển hướng quá nhiều lần.",
} as const;

function toMetadataView(
  product: import("@/lib/shopee/product-metadata/types").ShopeeProductMetadata,
): ShopeeProductMetadataView {
  return {
    platform: "shopee",
    productUrl: product.canonicalUrl,
    productName: product.title,
    shopName: product.shopName ?? null,
    imageUrl: product.imageUrl,
    priceVnd: product.price.amount,
    availability: product.availability,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchIdentityAndProduct(
  input: ResolveShopeeInput,
  deps: ResolveShopeeDependencies,
): Promise<
  | {
      ok: true;
      identity: ShopeeProductIdentity;
      product: import("@/lib/shopee/product-metadata/types").ShopeeProductMetadata;
    }
  | ProductResolutionFailure
> {
  const { resolveUrl, metadataProvider } = deps;

  if (typeof input?.productUrl !== "string") {
    return {
      ok: false,
      reason: "invalid_input",
      message: PRODUCT_RESOLUTION_INPUT_MESSAGES.invalid_input,
    };
  }

  if (!input.productUrl.trim()) {
    return {
      ok: false,
      reason: "invalid_input",
      message: "Liên kết Shopee không được để trống.",
    };
  }

  let identity: ShopeeProductIdentity;
  try {
    identity = await resolveUrl(input.productUrl);
  } catch (error) {
    const reason = mapUrlErrorToReason(error);
    return {
      ok: false,
      reason,
      message: PRODUCT_RESOLUTION_INPUT_MESSAGES[reason],
    };
  }

  let product: Awaited<
    ReturnType<ShopeeProductMetadataProvider["getProduct"]>
  >;
  try {
    product = await metadataProvider.getProduct(identity);
  } catch (error) {
    const reason = mapMetadataErrorToReason(error);
    return {
      ok: false,
      reason,
      message: metadataFailureMessage(reason),
      canonicalUrl: identity.canonicalUrl,
    };
  }

  if (product.availability === "unavailable") {
    return {
      ok: false,
      reason: "product_unavailable",
      message: "Sản phẩm Shopee này hiện không còn được bán.",
      canonicalUrl: identity.canonicalUrl,
    };
  }

  return { ok: true, identity, product };
}

export const resolveShopeeCashbackQuoteWithDeps = async (
  input: ResolveShopeeInput,
  deps: ResolveShopeeDependencies,
): Promise<ShopeeCashbackQuoteResult> => {
  const resolved = await fetchIdentityAndProduct(input, deps);
  if (!resolved.ok) {
    return resolved;
  }

  return await buildQuoteOrFailure({
    identity: resolved.identity,
    product: resolved.product,
    now: deps.now ?? (() => new Date()),
    calculateAllocation:
      deps.calculateAllocation ?? calculateCashbackAllocation,
    offerSelector: pickOfferSelector(deps),
    unikornCommissionProvider: deps.unikornCommissionProvider,
  });
};

export const resolveShopeeProductPreviewWithDeps = async (
  input: ResolveShopeeInput,
  deps: ResolveShopeeDependencies,
): Promise<ShopeeProductPreviewResult> => {
  const resolved = await fetchIdentityAndProduct(input, deps);
  if (!resolved.ok) {
    // Forward the canonical URL from the failure result.
    // It's present when resolveUrl succeeded but metadata fetch failed.
    return {
      ok: false,
      reason: resolved.reason,
      message: resolved.message,
      product: null,
      canonicalUrl: resolved.canonicalUrl,
    };
  }

  const now = deps.now ?? (() => new Date());
  const metadataView = toMetadataView(resolved.product);

  const built = await buildQuoteOrFailure({
    identity: resolved.identity,
    product: resolved.product,
    now,
    calculateAllocation:
      deps.calculateAllocation ?? calculateCashbackAllocation,
    offerSelector: pickOfferSelector(deps),
    unikornCommissionProvider: deps.unikornCommissionProvider,
    // Only the preview path catches selector/catalog exceptions and maps them
    // to eligibility_unknown. The strict quote path keeps its throw semantics.
    onSelectorError: (error: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          "resolveShopeeProductPreview: selector/catalog failure converted to eligibility_unknown",
          error,
        );
      }
      return {
        kind: "eligibility_unknown" as const,
        message:
          "Đã nhận diện sản phẩm nhưng chưa thể xác định mức hoàn tiền.",
      };
    },
  });

  if (built.ok) {
    return {
      ok: true,
      product: { ...metadataView, fetchedAt: now().toISOString() },
      quote: {
        status: "available",
        value: built.quote,
      },
    };
  }

  if (built.category === "product_resolution") {
    return {
      ok: false,
      reason: built.reason,
      message: built.message,
      product: null,
      canonicalUrl: resolved.identity.canonicalUrl,
    };
  }

  return {
    ok: true,
    product: { ...metadataView, fetchedAt: now().toISOString() },
    quote: {
      status: "unavailable",
      reason: built.reason,
      message: built.message,
    },
  };
};

interface BuildQuoteArgs {
  identity: ShopeeProductIdentity;
  product: import("@/lib/shopee/product-metadata/types").ShopeeProductMetadata;
  now: () => Date;
  calculateAllocation: typeof calculateCashbackAllocation;
  offerSelector: ShopeeOfferSelector;
  /**
   * Phase 20H.3f (API-first precedence) -- the Unikorn commission
   * provider is consulted FIRST by the preview quote path whenever
   * it is configured. A successful response short-circuits the rest
   * of the quote pipeline; a missing provider, network failure,
   * validation failure, or invalid commission value silently falls
   * back to the offer-selector + catalog/fixture path. See
   * {@link ResolveShopeeDependencies.unikornCommissionProvider} for
   * the production wiring contract.
   */
  unikornCommissionProvider?: ShopeeUnikornCommissionProvider;
  /**
   * Optional error handler for selector/catalog exceptions. When provided,
   * exceptions from `selectOffer` are caught and routed here instead of
   * propagating. This is used by the product-preview path to convert
   * selector/catalog failures into `eligibility_unknown` while letting
   * calculation/allocation errors propagate (they are not eligibility failures).
   *
   * The strict cashback quote path does NOT provide this callback, so any
   * selector exception bubbles up as a raw Error to the caller.
   */
  onSelectorError?: (error: unknown) => {
    kind: "eligibility_unknown";
    message: string;
  };
}

type BuildQuoteResult =
  | { ok: true; quote: ShopeeCashbackQuote }
  | {
      ok: false;
      category: "product_resolution";
      reason: "metadata_incomplete";
      message: string;
    }
  | {
      ok: false;
      category: "quote_unavailable";
      reason: QuoteUnavailableReason;
      message: string;
    };

async function buildQuoteOrFailure(
  args: BuildQuoteArgs,
): Promise<BuildQuoteResult> {
  // Phase 20H.3f (API-first precedence) -- try the Unikorn commission
  // provider FIRST whenever it is configured. A successful response
  // short-circuits the rest of the quote pipeline:
  //
  //   - if the provider returns a validated commissionVnd > 0, return
  //     an `available` quote built directly on that value (NOT price ×
  //     commissionRateBps), with `commissionSource = "unikorn_api"`;
  //   - if the provider is absent, throws, times out, returns invalid
  //     JSON, returns status != "success", is missing productInfo, is
  //     missing commission, or returns commission <= 0 / negative /
  //     fractional / non-safe-integer, the call returns `null` and we
  //     fall through to the offer-selector + catalog/fixture path;
  //   - the offer-selector path remains the authoritative source
  //     whenever Unikorn cannot deliver a valid commission. The
  //     selector can still return `eligible` (catalog/fixture), in
  //     which case the existing math (`price × commissionRateBps`) is
  //     preserved and `commissionSource` is set to `"shopee_affiliate"`
  //     or `"fixture"` based on the offer selector's audit hint.
  const unikornQuote = await tryUnikornCommission(
    args.identity,
    args.unikornCommissionProvider,
  );
  if (unikornQuote) {
    return buildUnikornCommissionQuote(
      unikornQuote,
      args.product,
      args.now,
      args.calculateAllocation,
    );
  }

  let selection: import("./shopee-offer-selector").ShopeeOfferSelectionOutcome;
  try {
    selection = await args.offerSelector.selectOffer({
      identity: args.identity,
      product: args.product,
    });
  } catch (error) {
    if (args.onSelectorError) {
      const fallback = args.onSelectorError(error);
      return {
        ok: false,
        category: "quote_unavailable",
        reason: "eligibility_unknown",
        message: fallback.message,
      };
    }
    throw error;
  }

  switch (selection.kind) {
    case "no_active_offer":
      return {
        ok: false,
        category: "quote_unavailable",
        reason: "no_active_offer",
        message:
          "Hiện chưa có chương trình hoàn tiền đang hoạt động cho Shopee.",
      };

    case "not_eligible":
      return {
        ok: false,
        category: "quote_unavailable",
        reason: "product_not_eligible",
        message:
          "Sản phẩm này không thuộc chương trình hoàn tiền Shopee hiện tại.",
      };

    case "eligibility_unknown":
      return {
        ok: false,
        category: "quote_unavailable",
        reason: selection.reason ?? "eligibility_unknown",
        message:
          selection.message ??
          "Đã nhận diện sản phẩm nhưng chưa thể xác định mức hoàn tiền.",
      };

    case "eligible":
      break;
  }

  if (
    !Number.isFinite(args.product.price.amount) ||
    !Number.isInteger(args.product.price.amount) ||
    args.product.price.amount < 0 ||
    !Number.isSafeInteger(args.product.price.amount)
  ) {
    return {
      ok: false,
      category: "product_resolution",
      reason: "metadata_incomplete",
      message:
        "Không thể ước tính hoàn tiền với giá sản phẩm không hợp lệ.",
    };
  }

  const offer = selection.offer;

  // Phase 20H.3f -- the offer selector advertises the source of the
  // commission rate it used (`"catalog"` vs the dev/test `"fixture"`
  // fallback). We surface that on the quote as an audit-only field so
  // downstream reports can tell fixture-only quotes apart from real
  // catalog rows without changing the math.
  const commissionSource: ShopeeCashbackQuote["commissionSource"] =
    offer.commissionRateSource === "fixture" ? "fixture" : "shopee_affiliate";

  const commissionRateBps = ((): number | null => {
    if (offer.commissionRateBps === null) {
      return null;
    }
    const rate = offer.commissionRateBps;
    if (
      typeof rate !== "number" ||
      !Number.isFinite(rate) ||
      !Number.isInteger(rate) ||
      rate < 0 ||
      rate > 10_000
    ) {
      return null;
    }
    return rate;
  })();

  if (commissionRateBps === null) {
    return {
      ok: false,
      category: "quote_unavailable",
      reason: "commission_rate_unavailable",
      message: "Chưa xác định được mức hoa hồng cho sản phẩm này.",
    };
  }

  const cashbackValidation = validateCashbackShareBps(
    offer.cashbackShareBps,
  );
  if (cashbackValidation !== null) {
    return cashbackValidation;
  }

  const orderAmount: Money = {
    amount: args.product.price.amount,
    currency: "VND",
  };

  const commissionNumerator =
    BigInt(orderAmount.amount) * BigInt(commissionRateBps);
  const commissionAmount = Number(commissionNumerator / BigInt(10000));

  if (
    !Number.isFinite(commissionAmount) ||
    !Number.isInteger(commissionAmount) ||
    commissionAmount < 0 ||
    !Number.isSafeInteger(commissionAmount)
  ) {
    return {
      ok: false,
      category: "product_resolution",
      reason: "metadata_incomplete",
      message:
        "Không thể tính hoa hồng mạng lưới với giá trị tiền tệ không an toàn.",
    };
  }

  const allocation = args.calculateAllocation({
    networkCommission: commissionAmount,
    cashbackShareBps: offer.cashbackShareBps,
  });

  // Phase 20H.3d: when the product price, commission rate, and
  // cashback share multiply out to a floor of zero user cashback, the
  // preview must NOT show a "0 đ" figure. Such cases typically mean the
  // commission rate is effectively zero for this product. Surface this
  // as `commission_rate_unavailable` so the UI keeps the safe
  // unavailable copy and the CTA still allows the buyer to proceed
  // (Phase 20H.3a preserved fallback). The invariant
  //   userCashback + platformProfit === networkCommission
  // remains intact: a zero-cashback result already implies a zero-
  // commission result, so the policy never silently withholds funds.
  if (allocation.userCashback === 0) {
    return {
      ok: false,
      category: "quote_unavailable",
      reason: "commission_rate_unavailable",
      message:
        "Chưa xác định được mức hoa hồng cho sản phẩm này.",
    };
  }

  const toVnd = (amount: number): Money => ({
    amount,
    currency: "VND",
  });

  const quote: ShopeeCashbackQuote = {
    product: args.product,
    campaignId: offer.campaignId as CampaignId,
    offerId: offer.offerId as OfferId,
    estimatedOrderAmount: toVnd(orderAmount.amount),
    estimatedNetworkCommission: toVnd(commissionAmount),
    estimatedUserCashback: toVnd(allocation.userCashback),
    estimatedPlatformProfit: toVnd(allocation.platformProfit),
    estimatedCommissionRateBps: commissionRateBps,
    cashbackShareBps: offer.cashbackShareBps,
    commissionSource,
    isEstimate: true,
    calculatedAt: args.now().toISOString(),
  };

  return { ok: true, quote };
}

function validateCashbackShareBps(
  bps: number,
): Extract<BuildQuoteResult, { ok: false }> | null {
  if (
    typeof bps !== "number" ||
    !Number.isFinite(bps) ||
    !Number.isInteger(bps) ||
    bps < 0 ||
    bps > 10_000
  ) {
    return {
      ok: false,
      category: "quote_unavailable",
      reason: "cashback_policy_unavailable",
      message:
        "Chưa có chính sách hoàn tiền đang áp dụng cho sản phẩm này.",
    };
  }
  return null;
}

/**
 * Phase 20H.3f (API-first precedence) -- consult the Unikorn
 * commission provider as the PRIMARY source for the network
 * commission.
 *
 * Returns the normalized quote on success. Returns `null` for ANY
 * failure so the caller can fall through to the offer-selector +
 * catalog/fixture path. The exhaustive failure list (silent here)
 * includes:
 *
 *   - the provider is absent on the dependency bundle;
 *   - the resolved identity has no `itemId` or `canonicalUrl` to
 *     send to the API;
 *   - the provider throws (network failure, timeout, non-2xx,
 *     invalid JSON, content-type rejection, body too large, redirect);
 *   - the normalized response is missing `productInfo.commission`,
 *     has status != "success", or has an invalid commission
 *     (zero, negative, fractional, non-safe-integer).
 *
 * No raw API error reaches the buyer UI: every failure is reduced
 * to `null` here and the caller falls back to the offer-selector
 * outcome.
 */
async function tryUnikornCommission(
  identity: ShopeeProductIdentity,
  provider: ShopeeUnikornCommissionProvider | undefined,
): Promise<
  import("@/lib/shopee/product-metadata/unikorn-commission-client").ShopeeUnikornCommissionQuote | null
> {
  if (!provider) {
    return null;
  }

  const itemId =
    typeof identity.itemId === "string" && identity.itemId.trim().length > 0
      ? identity.itemId.trim()
      : undefined;
  const canonicalUrl =
    typeof identity.canonicalUrl === "string" &&
    identity.canonicalUrl.trim().length > 0
      ? identity.canonicalUrl.trim()
      : undefined;

  if (!itemId && !canonicalUrl) {
    return null;
  }

  try {
    const quote = await provider({ itemId, canonicalUrl });
    // Spec rule: zero commission is treated as "unavailable" so the
    // UI keeps the safe copy rather than fabricating a 0đ figure.
    if (!quote || quote.commissionVnd <= 0) {
      return null;
    }
    // Defensive guard -- the pure client normalizes the response
    // but the service treats the network commission as a Money-shaped
    // integer, so reject anything that is not a non-negative safe
    // integer. The exception is swallowed so the selector path
    // remains the silent fallback.
    if (
      !Number.isFinite(quote.commissionVnd) ||
      !Number.isInteger(quote.commissionVnd) ||
      !Number.isSafeInteger(quote.commissionVnd)
    ) {
      return null;
    }
    return quote;
  } catch {
    // Phase 20H.3f contract: any provider failure is silent here.
    // The offer-selector outcome is the authoritative fallback; the
    // buyer only sees the safe unavailable copy surfaced by that
    // branch.
    return null;
  }
}

/**
 * Phase 20H.3f (API-first precedence) -- build a quote from a Unikorn
 * commission value. This branch is the AUTHORITATIVE quote when the
 * provider returns a valid commission, regardless of whether the
 * offer selector would have returned eligible.
 *
 * Unlike the catalog path, this branch:
 *
 *   - uses `networkCommissionVnd = quote.commissionVnd` directly
 *     (NOT price × commissionRateBps);
 *   - records `commissionSource: "unikorn_api"` so audit logs know
 *     the commission figure came from the third-party API;
 *   - uses the canonical preview-only default `cashbackShareBps =
 *     6000` (60%) because no cashback policy is associated with the
 *     API-sourced commission. The constant is exported as the
 *     preview-only default, so this remains a deliberate, named
 *     choice;
 *   - requires `cashbackShareBps` to be in `[0, 10000]`. When the
 *     default falls outside that range we treat it as a policy
 *     failure so the quote becomes unavailable rather than silently
 *     fabricating;
 *   - requires the resolved product metadata to have a usable price
 *     so the quote shape (`estimatedOrderAmount`) stays consistent
 *     with the catalog path.
 */
function buildUnikornCommissionQuote(
  quote: import("@/lib/shopee/product-metadata/unikorn-commission-client").ShopeeUnikornCommissionQuote,
  product: import("@/lib/shopee/product-metadata/types").ShopeeProductMetadata,
  now: () => Date,
  calculateAllocation: typeof calculateCashbackAllocation,
): BuildQuoteResult {
  const networkCommission = quote.commissionVnd;

  // Sanity-validate the provider value even though the normalization
  // layer should already enforce this. Defensive because the
  // service treats the network commission as a Money-shaped integer.
  if (
    !Number.isFinite(networkCommission) ||
    !Number.isInteger(networkCommission) ||
    !Number.isSafeInteger(networkCommission) ||
    networkCommission < 0
  ) {
    return {
      ok: false,
      category: "quote_unavailable",
      reason: "commission_rate_unavailable",
      message:
        "Chưa xác định được mức hoa hồng cho sản phẩm này.",
    };
  }

  // The 60/40 split always uses the canonical preview default on
  // the Unikorn path because no cashback policy is associated with
  // the API-sourced commission. The constant is exported as the
  // preview-only default, so this remains a deliberate, named choice.
  const cashbackShareBps: number = 6_000;

  const policyFailure = validateCashbackShareBps(cashbackShareBps);
  if (policyFailure !== null) {
    return policyFailure;
  }

  const allocation = calculateAllocation({
    networkCommission,
    cashbackShareBps,
  });

  // Spec rule: when the policy's floor produces zero buyer cashback
  // (i.e. commission too small to share at 60%), the UI keeps the
  // safe unavailable copy rather than rendering 0 đ.
  if (allocation.userCashback === 0) {
    return {
      ok: false,
      category: "quote_unavailable",
      reason: "commission_rate_unavailable",
      message:
        "Chưa xác định được mức hoa hồng cho sản phẩm này.",
    };
  }

  const toVnd = (amount: number): Money => ({
    amount,
    currency: "VND",
  });

  const cashbackQuote: ShopeeCashbackQuote = {
    product,
    // Phase 20H.3f -- Unikorn-backed quotes don't have a catalog
    // campaign/offer identity, so we surface neutral placeholder IDs
    // that are NEVER rendered to the buyer UI. These values exist
    // only because the type contract requires them and the existing
    // downstream code paths expect a CampaignId/OfferId pair.
    campaignId: "campaign:unikorn" as CampaignId,
    offerId: "offer:unikorn" as OfferId,
    estimatedOrderAmount: toVnd(product.price.amount),
    estimatedNetworkCommission: toVnd(networkCommission),
    estimatedUserCashback: toVnd(allocation.userCashback),
    estimatedPlatformProfit: toVnd(allocation.platformProfit),
    estimatedCommissionRateBps: null,
    cashbackShareBps,
    commissionSource: "unikorn_api",
    isEstimate: true,
    calculatedAt: now().toISOString(),
  };

  return { ok: true, quote: cashbackQuote };
}

function metadataFailureMessage(
  reason: Extract<
    ProductResolutionFailure["reason"],
    | "metadata_unavailable"
    | "metadata_incomplete"
    | "provider_timeout"
    | "provider_response_invalid"
    | "product_not_found"
    | "product_unavailable"
  >,
): string {
  switch (reason) {
    case "metadata_incomplete":
      return "Trang sản phẩm Shopee chưa đủ thông tin để ước tính hoàn tiền.";
    case "provider_timeout":
      return "Shopee phản hồi quá lâu. Vui lòng thử lại sau.";
    case "provider_response_invalid":
      return "Phản hồi từ Shopee không hợp lệ. Vui lòng thử lại sau.";
    case "product_not_found":
      return "Không tìm thấy sản phẩm tương ứng với liên kết này.";
    case "product_unavailable":
      return "Sản phẩm Shopee này hiện không còn được bán.";
    case "metadata_unavailable":
      return "Không thể truy cập trang sản phẩm Shopee lúc này. Vui lòng thử lại.";
  }
}

function pickOfferSelector(
  deps: ResolveShopeeDependencies,
): ShopeeOfferSelector {
  if (deps.offerSelector) {
    return deps.offerSelector;
  }
  if (deps.shopeeCatalogRepository) {
    // Lazily build a selector from the canonical repository so callers that
    // only want to wire the repository still get a working selector without
    // having to import the factory themselves. The optional Phase 20H.3d
    // identity-aware fixture lookup is forwarded verbatim.
    return createShopeeOfferSelector(
      deps.shopeeCatalogRepository,
      deps.lookupFixtureCommissionRateBps
        ? {
            lookupFixtureCommissionRateBps: deps.lookupFixtureCommissionRateBps,
          }
        : {},
    );
  }
  throw new Error(
    "resolveShopeeCashbackQuote: no ShopeeOfferSelector or ShopeeCatalogRepository configured",
  );
}

function mapUrlErrorToReason(
  error: unknown,
):
  | "invalid_url"
  | "unsupported_host"
  | "not_product_url"
  | "redirect_failed"
  | "too_many_redirects" {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: string }).code;
    switch (code) {
      case "invalid_input":
        return "invalid_url";
      case "unsupported_host":
        return "unsupported_host";
      case "not_product_path":
      case "missing_identifier":
      case "invalid_identifier":
      case "oversized_url":
      case "unsupported_scheme":
      case "credentials_not_allowed":
      case "unexpected_port":
      case "unsupported_short_link":
        return "not_product_url";
      case "redirect_failed":
        return "redirect_failed";
      case "too_many_redirects":
        return "too_many_redirects";
    }
  }
  return "invalid_url";
}

function mapMetadataErrorToReason(
  error: unknown,
):
  | "metadata_unavailable"
  | "metadata_incomplete"
  | "provider_timeout"
  | "provider_response_invalid"
  | "product_not_found"
  | "product_unavailable" {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: string }).code;
    switch (code) {
      case "metadata_incomplete":
        return "metadata_incomplete";
      case "provider_timeout":
        return "provider_timeout";
      case "provider_response_invalid":
      case "non_2xx_response":
      case "unexpected_content_type":
      case "body_too_large":
      case "too_many_redirects":
      case "redirect_failed":
      case "redirect_to_hostile_target":
        return "metadata_unavailable";
      case "product_not_found":
        return "product_not_found";
      case "product_unavailable":
        return "product_unavailable";
    }
  }
  return "metadata_unavailable";
}
