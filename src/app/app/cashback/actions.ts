"use server";

import {
  ShopeeAffiliateUrlError,
} from "@/lib/cashback/shopee-affiliate-url";
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
import {
  resolveShopeeProductPreview,
} from "@/services/shopee-cashback-quote.service.server";
import type {
  CashbackPlatformCode,
  CreateCashbackTrackingLinkActionState,
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
): PreviewShopeeProductPreviewActionState {
  return {
    ok: false,
    message: failure.message,
    state: "resolution_failed",
    errorCode: failure.reason,
    product: null,
    quote: null,
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
