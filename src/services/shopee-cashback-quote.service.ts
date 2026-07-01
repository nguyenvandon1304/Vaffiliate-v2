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
   * Cashback allocation function. Defaults to the canonical policy when omitted.
   */
  calculateAllocation?: typeof calculateCashbackAllocation;
  /**
   * Clock. Defaults to `() => new Date()` when omitted.
   */
  now?: () => Date;
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
    };
  }

  if (product.availability === "unavailable") {
    return {
      ok: false,
      reason: "product_unavailable",
      message: "Sản phẩm Shopee này hiện không còn được bán.",
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
  });
};

export const resolveShopeeProductPreviewWithDeps = async (
  input: ResolveShopeeInput,
  deps: ResolveShopeeDependencies,
): Promise<ShopeeProductPreviewResult> => {
  const resolved = await fetchIdentityAndProduct(input, deps);
  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      message: resolved.message,
      product: null,
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
    // having to import the factory themselves.
    return createShopeeOfferSelector(deps.shopeeCatalogRepository);
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
