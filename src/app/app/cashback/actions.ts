"use server";

import {
  createCashbackTrackingLinkAsync,
} from "@/repositories/cashback-tracking.repository";
import type {
  CashbackPlatformCode,
  CreateCashbackTrackingLinkActionState,
} from "@/types/cashback";

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

  if (value.length > 4096 || /\s/.test(value)) {
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
    isMatchingHostname(hostname, "shopee.vn") ||
    isMatchingHostname(hostname, "shopee.com") ||
    isMatchingHostname(hostname, "shope.ee");

  const isTikTokHost =
    isMatchingHostname(hostname, "tiktok.com");

  if (platform === "shopee" && !isShopeeHost) {
    return "Vui lòng sử dụng link sản phẩm Shopee hợp lệ.";
  }

  if (platform === "tiktok" && !isTikTokHost) {
    return "Vui lòng sử dụng link sản phẩm TikTok Shop hợp lệ.";
  }

  return null;
}

export async function createCashbackTrackingLinkAction(
  _previousState: CreateCashbackTrackingLinkActionState,
  formData: FormData,
): Promise<CreateCashbackTrackingLinkActionState> {
  const platform = parsePlatform(
    readTrimmedString(formData, "platform"),
  );

  const destinationUrl = readTrimmedString(
    formData,
    "destinationUrl",
  );

  if (!platform) {
    return {
      success: false,
      message: "Nền tảng hoàn tiền không hợp lệ.",
      trackingLink: null,
    };
  }

  const validationError = validateDestinationUrl(
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
      message: "Link hoàn tiền đã được tạo.",
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