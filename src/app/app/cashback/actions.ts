"use server";

import { and, eq, isNull } from "drizzle-orm";

import {
  buildShopeeAffiliateRedirectUrl,
  getShopeeAffiliateAccountId,
} from "@/lib/cashback/shopee-affiliate-config";
import {
  ShopeeAffiliateUrlError,
  verifyShopeeAffiliateUrl,
} from "@/lib/cashback/shopee-affiliate-url";
import {
  decideExistingUrlOutcome,
  decideNullPersistenceOutcome,
  type VerifyFn,
} from "@/lib/cashback/shopee-persistence-decisions";
import {
  createShopeePreviewFallbackDecision,
  isShopeePreviewPurchaseAllowedFailure,
} from "@/lib/cashback/shopee-preview-fallback";
import { parseShopeeProductUrl } from "@/lib/shopee/product-url-parser";
import {
  ShopeeRedirectUrlError,
} from "@/lib/shopee/redirect-url";
import { createClient } from "@/lib/supabase/server";
import {
  CashbackAffiliatePlatformError,
  CashbackAffiliateTrackingLinkNotFoundError,
  provisionShopeeAffiliateUrlAsync,
} from "@/repositories/cashback-affiliate.repository";

import {
  createCashbackTrackingLinkAsync,
} from "@/repositories/cashback-tracking.repository";
import { db } from "@/db/client";
import { trackingLinks } from "@/db/schema";
import {
  resolveShopeeProductPreview,
} from "@/services/shopee-cashback-quote.service.server";
import { recordShopeePurchaseIntentAsync } from "@/services/shopee-purchase-intent.service";
import type {
  ShopeePurchaseIntentQuoteSnapshot,
} from "@/lib/cashback/shopee-purchase-persistence-helper";
import type {
  CashbackPlatformCode,
  CreateCashbackTrackingLinkActionState,
  InitiateShopeePurchaseActionState,
  PreviewShopeeProductPreviewActionState,
  ProvisionShopeeAffiliateUrlActionState,
  ShopeeProductPreviewErrorCode2,
} from "@/types/cashback";
import type {
  ShopeeProductPreviewFailure,
} from "@/services/shopee-cashback-quote.types";

const supportedPlatforms =
  new Set<CashbackPlatformCode>([
    "shopee",
    "tiktok",
  ]);

function readTrimmedString(
  formData: FormData,
  key: string,
): string {
  const value = formData.get(key);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function parsePlatform(
  value: string,
): CashbackPlatformCode | null {
  if (
    !supportedPlatforms.has(
      value as CashbackPlatformCode,
    )
  ) {
    return null;
  }

  return value as CashbackPlatformCode;
}

function isMatchingHostname(
  hostname: string,
  domain: string,
): boolean {
  return (
    hostname === domain ||
    hostname.endsWith(`.${domain}`)
  );
}

function validateDestinationUrl(
  platform: CashbackPlatformCode,
  value: string,
): string | null {
  if (!value) {
    return "Vui lòng dán link sản phẩm.";
  }

  if (
    value.length > 4096 ||
    /\s/.test(value)
  ) {
    return "Link sản phẩm không hợp lệ.";
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return "Link sản phẩm không hợp lệ.";
  }

  if (url.protocol !== "https:") {
    return "Link sản phẩm phải sử dụng HTTPS.";
  }

  const hostname = url.hostname.toLowerCase();

  const isShopeeHost =
    isMatchingHostname(
      hostname,
      "shopee.vn",
    ) ||
    isMatchingHostname(
      hostname,
      "shopee.com",
    ) ||
    isMatchingHostname(
      hostname,
      "shope.ee",
    );

  const isTikTokHost =
    isMatchingHostname(
      hostname,
      "tiktok.com",
    );

  if (
    platform === "shopee" &&
    !isShopeeHost
  ) {
    return "Vui lòng sử dụng link sản phẩm Shopee hợp lệ.";
  }

  if (
    platform === "tiktok" &&
    !isTikTokHost
  ) {
    return "Vui lòng sử dụng link sản phẩm TikTok Shop hợp lệ.";
  }

  return null;
}

export async function createCashbackTrackingLinkAction(
  _previousState: CreateCashbackTrackingLinkActionState,
  formData: FormData,
): Promise<CreateCashbackTrackingLinkActionState> {
  const platform = parsePlatform(
    readTrimmedString(
      formData,
      "platform",
    ),
  );

  const destinationUrl =
    readTrimmedString(
      formData,
      "destinationUrl",
    );

  if (!platform) {
    return {
      success: false,
      message:
        "Nền tảng hoàn tiền không hợp lệ.",
      trackingLink: null,
    };
  }

  const validationError =
    validateDestinationUrl(
      platform,
      destinationUrl,
    );

  if (validationError) {
    return {
      success: false,
      message: validationError,
      trackingLink: null,
    };
  }

  try {
    const trackingLink =
      await createCashbackTrackingLinkAsync(
        platform,
        destinationUrl,
      );

    return {
      success: true,
      message:
        "Link hoàn tiền đã được tạo.",
      trackingLink,
    };
  } catch (error) {
    console.error(
      "Unable to create cashback tracking link",
      error,
    );

    const isAuthenticationError =
      error instanceof Error &&
      error.message.includes(
        "Authentication is required",
      );

    return {
      success: false,
      message: isAuthenticationError
        ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : "Không thể tạo link hoàn tiền lúc này. Vui lòng thử lại.",
      trackingLink: null,
    };
  }
}

export async function previewShopeeCashbackQuoteAction(
  _previousState: PreviewShopeeProductPreviewActionState,
  formData: FormData,
): Promise<PreviewShopeeProductPreviewActionState> {
  const productUrl = readTrimmedString(
    formData,
    "productUrl",
  );

  if (!productUrl) {
    return createPreviewFailure({
      message:
        "Vui lòng dán một liên kết sản phẩm Shopee hợp lệ.",
      reason: "invalid_input",
    });
  }

  try {
    const result =
      await resolveShopeeProductPreview({ productUrl });

    if (!result.ok) {
      // Check if this is a safe metadata failure that still allows purchase
      if (
        isShopeePreviewPurchaseAllowedFailure(result.reason)
      ) {
        // Use server-resolved canonical URL if available, otherwise try to derive it
        const canonicalProductUrl =
          result.canonicalUrl ??
          (() => {
            try {
              const parsed = parseShopeeProductUrl(productUrl);
              return parsed.canonicalUrl;
            } catch {
              return null;
            }
          })();

        if (canonicalProductUrl) {
          const decision = createShopeePreviewFallbackDecision(
            result.reason,
            canonicalProductUrl,
          );

          if (decision.allowed) {
            return {
              ok: false,
              message: result.message,
              state: decision.state,
              errorCode: result.reason,
              product: null,
              quote: null,
              canonicalProductUrl: decision.canonicalProductUrl,
            };
          }
        }
      }

      return createPreviewFailure(result);
    }

    const { product, quote } = result;

    if (quote.status === "available") {
      const q = quote.value;
      return {
        ok: true,
        message:
          "Đã lấy thông tin sản phẩm và mức hoàn tiền dự kiến.",
        state: "quote_available",
        errorCode: null,
        product,
        quote: {
          status: "available",
          product,
          cashbackShareBps: q.cashbackShareBps,
          estimatedCashbackVnd:
            q.estimatedUserCashback.amount,
          calculatedAt: q.calculatedAt,
          isEstimate: true,
        },
        canonicalProductUrl: null,
      };
    }

    return {
      ok: true,
      message: quote.message,
      state: "quote_unavailable",
      errorCode: quote.reason,
      product,
      quote: {
        status: "unavailable",
        product,
        reason: quote.reason,
        message: quote.message,
      },
      canonicalProductUrl: null,
    };
  } catch (error) {
    console.error(
      "Unable to preview Shopee cashback quote",
      error,
    );
    return createPreviewFailure({
      message:
        "Không thể truy cập trang sản phẩm Shopee lúc này. Vui lòng thử lại.",
      reason: "metadata_unavailable",
    });
  }
}

function createPreviewFailure(
  failure:
    | ShopeeProductPreviewFailure
    | {
        message: string;
        reason: ShopeeProductPreviewErrorCode2;
      },
  canonicalProductUrl: string | null = null,
): PreviewShopeeProductPreviewActionState {
  return {
    ok: false,
    message: failure.message,
    state: "resolution_failed",
    errorCode: failure.reason,
    product: null,
    quote: null,
    canonicalProductUrl,
  };
}
function createProvisionFailure(
  message: string,
): ProvisionShopeeAffiliateUrlActionState {
  return {
    success: false,
    message,
    trackingLinkId: null,
    affiliateUrl: null,
  };
}

/**
 * Phase 20H.3b — map a server-resolved preview result onto the typed
 * quote-snapshot shape persisted on `shopee_purchase_intents.quote_snapshot`.
 *
 * Returns `null` when the preview did not produce a usable quote
 * (e.g. metadata unavailable, fallback handoff). A `null` snapshot
 * is a legitimate state and means "we have a tracking link and an
 * affiliate URL, but we could not compute a cashback quote at intent
 * time" — never a guarantee.
 *
 * Never throws. Returns a best-effort, JSONB-safe snapshot.
 */
async function buildShopeePurchaseIntentQuoteSnapshotFromPreview(
  productUrl: string,
): Promise<ShopeePurchaseIntentQuoteSnapshot | null> {
  try {
    const result = await resolveShopeeProductPreview({
      productUrl,
    });

    if (!result.ok) {
      // Fallback handoff: metadata unavailable, but purchase is still
      // allowed via the canonical URL. We persist a "unavailable"
      // snapshot so audit can see what the buyer saw.
      if (
        isShopeePreviewPurchaseAllowedFailure(result.reason)
      ) {
        return {
          status: "unavailable",
          cashbackShareBps: null,
          estimatedCashbackVnd: null,
          productPriceVnd: null,
          reason: result.reason,
          message: result.message,
          capturedAt: new Date().toISOString(),
        };
      }
      return null;
    }

    const { product, quote } = result;

    if (quote.status === "available") {
      return {
        status: "available",
        cashbackShareBps: quote.value.cashbackShareBps,
        estimatedCashbackVnd:
          quote.value.estimatedUserCashback.amount,
        productPriceVnd:
          typeof product.priceVnd === "number"
            ? product.priceVnd
            : null,
        reason: null,
        message: null,
        capturedAt: new Date().toISOString(),
      };
    }

    return {
      status: "unavailable",
      cashbackShareBps: null,
      estimatedCashbackVnd: null,
      productPriceVnd:
        typeof product.priceVnd === "number"
          ? product.priceVnd
          : null,
      reason: quote.reason,
      message: quote.message,
      capturedAt: new Date().toISOString(),
    };
  } catch {
    // The intent boundary must never fail because the preview resolver
    // failed. Persist with `quoteSnapshot = null` and let the action
    // continue. Phase 20H.3a UI already shows the buyer a clear
    // fallback copy when no quote is available.
    return null;
  }
}

function readProvisionErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof
      CashbackAffiliateTrackingLinkNotFoundError
  ) {
    return "Không tìm thấy link hoàn tiền thuộc tài khoản của bạn.";
  }

  if (
    error instanceof
      CashbackAffiliatePlatformError
  ) {
    return "Hiện chỉ hỗ trợ cấp phát link Affiliate cho Shopee.";
  }

  // Catches errors from getShopeeAffiliateAccountId() that propagate
  // through provisionShopeeAffiliateUrlAsync when the environment
  // variable is missing or invalid. Never exposes internal details.
  if (
    error instanceof Error &&
    (error.message.includes("SHOPEE_AFFILIATE_ACCOUNT_ID") ||
      error.message.includes("an_<digits>"))
  ) {
    return "Cấu hình liên kết Shopee hiện chưa sẵn sàng. Vui lòng thử lại sau.";
  }

  if (
    error instanceof
      ShopeeAffiliateUrlError
  ) {
    switch (error.code) {
      case "invalid_network_sub_id":
        return "Sub ID của link hoàn tiền không hợp lệ.";

      case "missing_account_attribution":
        return "Link Affiliate không chứa mã tài khoản Shopee Affiliate.";

      case "account_mismatch":
        return "Link Affiliate không thuộc tài khoản Shopee Affiliate của Vaffiliate.";

      case "missing_sub_id":
        return "Link Affiliate không chứa Sub_id1.";

      case "sub_id_mismatch":
        return "Sub_id1 trong link Affiliate không khớp với link hoàn tiền.";
    }
  }

  if (
    error instanceof
      ShopeeRedirectUrlError
  ) {
    switch (error.code) {
      case "invalid_url":
        return "Link Shopee Affiliate không hợp lệ.";

      case "unsupported_host":
        return "Link Affiliate không thuộc hệ thống Shopee.";

      case "redirect_failed":
        return "Không thể xác minh link Shopee Affiliate lúc này.";

      case "too_many_redirects":
        return "Link Shopee Affiliate chuyển hướng quá nhiều lần.";
    }
  }

  return "Không thể lưu link Shopee Affiliate lúc này. Vui lòng thử lại.";
}

export async function provisionShopeeAffiliateUrlAction(
  _previousState: ProvisionShopeeAffiliateUrlActionState,
  formData: FormData,
): Promise<ProvisionShopeeAffiliateUrlActionState> {
  const trackingLinkId =
    readTrimmedString(
      formData,
      "trackingLinkId",
    );

  const affiliateUrl =
    readTrimmedString(
      formData,
      "affiliateUrl",
    );

  if (!trackingLinkId) {
    return createProvisionFailure(
      "Thiếu mã link hoàn tiền.",
    );
  }

  if (!affiliateUrl) {
    return createProvisionFailure(
      "Vui lòng nhập link Shopee Affiliate.",
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return createProvisionFailure(
      "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    );
  }

  try {
    const provisioned =
      await provisionShopeeAffiliateUrlAsync(
        user.id,
        trackingLinkId,
        affiliateUrl,
      );

    return {
      success: true,
      message:
        "Đã xác minh và lưu link Shopee Affiliate.",
      trackingLinkId:
        provisioned.trackingLinkId,
      affiliateUrl:
        provisioned.affiliateUrl,
    };
  } catch (error) {
    console.error(
      "Unable to provision Shopee affiliate URL",
      error,
    );

    return createProvisionFailure(
      readProvisionErrorMessage(error),
    );
  }
}

export async function initiateShopeePurchaseAction(
  _previousState: InitiateShopeePurchaseActionState,
  formData: FormData,
): Promise<InitiateShopeePurchaseActionState> {
  // Phase 20H.3b -- durable buyer purchase-intent boundary. The action
  // refuses to return `/go/<shortCode>` to the client unless this
  // helper has already written a `shopee_purchase_intents` row. We
  // call it from every success branch (after affiliate URL build /
  // verify, before the success return). If persistence fails, we
  // return a typed `persistence_failed` state with friendly copy and
  // NO redirect path so the CTA cannot navigate the buyer away.
  const recordIntentOrAbort = async (args: {
    canonicalUrl: string;
    shopId: string;
    itemId: string;
    affiliateUrl: string;
    trackingLink: Awaited<
      ReturnType<typeof createCashbackTrackingLinkAsync>
    >;
  }): Promise<InitiateShopeePurchaseActionState | null> => {
    const quoteSnapshot =
      await buildShopeePurchaseIntentQuoteSnapshotFromPreview(
        args.canonicalUrl,
      );

    const persisted =
      await recordShopeePurchaseIntentAsync(
        {
          publisherId,
          trackingLinkId: args.trackingLink.id,
          networkSubId: args.trackingLink.networkSubId,
          shortCode: args.trackingLink.shortCode,
          originalProductUrl: productUrl,
          canonicalProductUrl: args.canonicalUrl,
          shopId: args.shopId,
          itemId: args.itemId,
          campaignId: args.trackingLink.campaignId,
          offerId: args.trackingLink.offerId,
          affiliateUrl: args.affiliateUrl,
          quoteSnapshot,
        },
        { status: "redirect_prepared" },
      );

    if (!persisted.ok) {
      console.error(
        "Unable to persist Shopee purchase intent",
        persisted.failureReason,
      );
      return {
        ok: false,
        message:
          "Chưa thể ghi nhận phiên mua hoàn tiền. Vui lòng thử lại để đảm bảo đơn được theo dõi.",
        shortCode: null,
        trackingPath: null,
        productUrl: null,
      };
    }

    return null;
  };

  const productUrl = readTrimmedString(
    formData,
    "productUrl",
  );

  if (!productUrl) {
    return {
      ok: false,
      message: "Vui lòng dán một liên kết sản phẩm Shopee hợp lệ.",
      shortCode: null,
      trackingPath: null,
      productUrl: null,
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      shortCode: null,
      trackingPath: null,
      productUrl: null,
    };
  }

  const publisherId = user.id;

  let canonicalUrl: string;
  let shopId: string;
  let itemId: string;

  try {
    const parsed = parseShopeeProductUrl(productUrl);
    canonicalUrl = parsed.canonicalUrl;
    shopId = parsed.shopId;
    itemId = parsed.itemId;
  } catch {
    return {
      ok: false,
      message: "Link sản phẩm Shopee không hợp lệ.",
      shortCode: null,
      trackingPath: null,
      productUrl: null,
    };
  }

  let trackingLink:
    | Awaited<ReturnType<typeof createCashbackTrackingLinkAsync>>
    | null = null;

  try {
    trackingLink = await createCashbackTrackingLinkAsync(
      "shopee",
      canonicalUrl,
    );
  } catch (error) {
    console.error(
      "Unable to create cashback tracking link",
      error,
    );

    const isAuthError =
      error instanceof Error &&
      error.message.includes("Authentication is required");

    return {
      ok: false,
      message: isAuthError
        ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : "Không thể tạo link hoàn tiền lúc này. Vui lòng thử lại.",
      shortCode: null,
      trackingPath: null,
      productUrl: null,
    };
  }

  let accountId: string;

  try {
    accountId = getShopeeAffiliateAccountId();
  } catch (error) {
    console.error(
      "Unable to read Shopee affiliate account configuration",
      error,
    );

    return {
      ok: false,
      message:
        "Cấu hình liên kết Shopee hiện chưa sẵn sàng. Vui lòng thử lại sau.",
      shortCode: null,
      trackingPath: null,
      productUrl: null,
    };
  }

  let expectedAffiliateUrl: string;

  try {
    expectedAffiliateUrl = buildShopeeAffiliateRedirectUrl({
      canonicalDestinationUrl: canonicalUrl,
      accountId,
      networkSubId: trackingLink.networkSubId,
    });
  } catch (error) {
    console.error(
      "Unable to build Shopee affiliate redirect URL",
      error,
    );

    return {
      ok: false,
      message:
        "Không thể tạo link hoàn tiền lúc này. Vui lòng thử lại.",
      shortCode: null,
      trackingPath: null,
      productUrl: null,
    };
  }

  if (trackingLink.affiliateUrl === null) {
    try {
      const [updated] = await db
        .update(trackingLinks)
        .set({
          affiliateUrl: expectedAffiliateUrl,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(trackingLinks.id, trackingLink.id),
            eq(trackingLinks.publisherId, publisherId),
            eq(trackingLinks.platform, "shopee"),
            eq(trackingLinks.networkSubId, trackingLink.networkSubId),
            isNull(trackingLinks.affiliateUrl),
          ),
        )
        .returning({ id: trackingLinks.id });

      let reloadResult: { found: boolean; affiliateUrl: string | null } = { found: false, affiliateUrl: null };
      if (!updated) {
        const [existing] = await db
          .select({ affiliateUrl: trackingLinks.affiliateUrl })
          .from(trackingLinks)
          .where(
            and(
              eq(trackingLinks.id, trackingLink.id),
              eq(trackingLinks.publisherId, publisherId),
              eq(trackingLinks.platform, "shopee"),
              eq(trackingLinks.networkSubId, trackingLink.networkSubId),
            ),
          )
          .limit(1);

        reloadResult = {
          found: existing !== undefined,
          affiliateUrl: existing?.affiliateUrl ?? null,
        };
      }

      const outcome = decideNullPersistenceOutcome(
        { updated: updated !== undefined },
        reloadResult,
        expectedAffiliateUrl,
        trackingLink.trackingPath,
        trackingLink.shortCode,
      );

      if (outcome.action === "failure") {
        return {
          ok: false,
          message: outcome.message,
          shortCode: null,
          trackingPath: null,
          productUrl: null,
        };
      }

      const abortState = await recordIntentOrAbort({
        canonicalUrl,
        shopId,
        itemId,
        affiliateUrl: expectedAffiliateUrl,
        trackingLink,
      });

      if (abortState !== null) {
        return abortState;
      }

      return {
        ok: true,
        message: "Đã tạo link hoàn tiền.",
        shortCode: trackingLink.shortCode,
        trackingPath: trackingLink.trackingPath,
        productUrl: canonicalUrl,
      };
    } catch (error) {
      console.error(
        "Unable to persist Shopee affiliate URL",
        error,
      );

      return {
        ok: false,
        message:
          "Không thể lưu link hoàn tiền lúc này. Vui lòng thử lại.",
        shortCode: null,
        trackingPath: null,
        productUrl: null,
      };
    }
  }

  const verifyFn: VerifyFn = async (
    affiliateUrl,
    networkSubId,
    accountId,
    canonicalUrl,
  ) => {
    try {
      const result = await verifyShopeeAffiliateUrl(
        affiliateUrl,
        networkSubId,
        accountId,
        canonicalUrl,
      );
      if (!result.valid) {
        return {
          valid: false,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        };
      }
      return { valid: true };
    } catch {
      return { valid: false, errorMessage: "Unable to verify affiliate URL" };
    }
  };

  const outcome = await decideExistingUrlOutcome(
    trackingLink.affiliateUrl,
    expectedAffiliateUrl,
    verifyFn,
    trackingLink.networkSubId,
    accountId,
    canonicalUrl,
    trackingLink.trackingPath,
    trackingLink.shortCode,
  );

  if (outcome.action === "failure") {
    return {
      ok: false,
      message: outcome.message,
      shortCode: null,
      trackingPath: null,
      productUrl: null,
    };
  }

  const abortState = await recordIntentOrAbort({
    canonicalUrl,
    shopId,
    itemId,
    affiliateUrl: trackingLink.affiliateUrl ?? expectedAffiliateUrl,
    trackingLink,
  });

  if (abortState !== null) {
    return abortState;
  }

  return {
    ok: true,
    message: "Đã tạo link hoàn tiền.",
    shortCode: trackingLink.shortCode,
    trackingPath: trackingLink.trackingPath,
    productUrl: canonicalUrl,
  };
}
