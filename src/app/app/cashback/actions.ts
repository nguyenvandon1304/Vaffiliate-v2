"use server";

import {
  ShopeeProductUrlError,
} from "@/lib/shopee/product-url";
import {
  createCashbackTrackingLinkAsync,
} from "@/repositories/cashback-tracking.repository";
import {
  getShopeeProductPreview,
  ShopeeProductPreviewServiceError,
} from "@/services/shopee-product-preview.service";
import type {
  CashbackPlatformCode,
  CreateCashbackTrackingLinkActionState,
  PreviewShopeeProductActionState,
  ShopeeProductPreviewErrorCode,
} from "@/types/cashback";

const supportedPlatforms =
  new Set<CashbackPlatformCode>([
    "shopee",
    "tiktok",
  ]);

const previewErrorMessages: Record<
  ShopeeProductPreviewErrorCode,
  string
> = {
  invalid_url:
    "Link sản phẩm Shopee không hợp lệ.",
  unsupported_host:
    "Vaffiliate hiện chỉ hỗ trợ link sản phẩm trên Shopee Việt Nam.",
  not_product_url:
    "Không nhận diện được sản phẩm từ link Shopee này.",
  redirect_failed:
    "Không thể mở link rút gọn Shopee lúc này. Vui lòng thử lại.",
  too_many_redirects:
    "Link Shopee chuyển hướng quá nhiều lần.",
  request_timeout:
    "Dịch vụ kiểm tra sản phẩm phản hồi quá lâu. Vui lòng thử lại.",
  service_unavailable:
    "Dịch vụ kiểm tra sản phẩm đang tạm thời không khả dụng.",
  product_not_found:
    "Không lấy được thông tin sản phẩm từ Shopee.",
  invalid_response:
    "Dữ liệu sản phẩm Shopee trả về không hợp lệ.",
  commission_unavailable:
    "Chưa xác định được mức hoàn tiền cho sản phẩm này.",
};

function createPreviewFailure(
  errorCode: ShopeeProductPreviewErrorCode,
): PreviewShopeeProductActionState {
  return {
    success: false,
    message: previewErrorMessages[errorCode],
    errorCode,
    preview: null,
  };
}

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

export async function previewShopeeProductAction(
  _previousState: PreviewShopeeProductActionState,
  formData: FormData,
): Promise<PreviewShopeeProductActionState> {
  const productUrl = readTrimmedString(
    formData,
    "productUrl",
  );

  if (!productUrl) {
    return createPreviewFailure(
      "invalid_url",
    );
  }

  try {
    const preview =
      await getShopeeProductPreview(
        productUrl,
      );

    return {
      success: true,
      message:
        "Đã lấy thông tin sản phẩm và mức hoàn tiền dự kiến.",
      errorCode: null,
      preview,
    };
  } catch (error) {
    if (
      error instanceof
        ShopeeProductUrlError ||
      error instanceof
        ShopeeProductPreviewServiceError
    ) {
      return createPreviewFailure(
        error.code,
      );
    }

    console.error(
      "Unable to preview Shopee product",
      error,
    );

    return createPreviewFailure(
      "service_unavailable",
    );
  }
}