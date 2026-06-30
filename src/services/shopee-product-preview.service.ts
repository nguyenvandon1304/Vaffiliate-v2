import "server-only";

import {
  resolveShopeeProductUrl,
} from "@/lib/shopee/product-url";
import {
  BASIS_POINTS,
  calculateCashbackAllocation,
  SHOPEE_PREVIEW_DEFAULT_CASHBACK_SHARE_BPS,
} from "@/lib/cashback/cashback-policy";
import type {
  ShopeeProductPreview,
  ShopeeProductPreviewErrorCode,
} from "@/types/cashback";

const PRODUCT_DATA_ENDPOINT =
  "https://data.addlivetag.com/product-data/product-data.php";

const REQUEST_TIMEOUT_MS = 10_000;

type ProductPreviewServiceErrorCode = Extract<
  ShopeeProductPreviewErrorCode,
  | "request_timeout"
  | "service_unavailable"
  | "product_not_found"
  | "invalid_response"
  | "commission_unavailable"
>;

export class ShopeeProductPreviewServiceError extends Error {
  readonly code: ProductPreviewServiceErrorCode;

  constructor(
    code: ProductPreviewServiceErrorCode,
    message: string,
  ) {
    super(message);

    this.name = "ShopeeProductPreviewServiceError";
    this.code = code;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readRequiredString(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return null;
  }

  const normalized = String(value).trim();

  return normalized || null;
}

function readNullableString(
  value: unknown,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readRequiredString(value);
}

function readFiniteNumber(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    return null;
  }

  if (
    typeof value === "string" &&
    !value.trim()
  ) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return numberValue;
}

function readNonNegativeInteger(
  value: unknown,
): number | null {
  const numberValue = readFiniteNumber(value);

  if (
    numberValue === null ||
    numberValue < 0
  ) {
    return null;
  }

  return Math.floor(numberValue);
}

function readNullableNonNegativeInteger(
  value: unknown,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readNonNegativeInteger(value);
}

function readBoolean(
  value: unknown,
): boolean {
  return value === true;
}

function calculateCashbackRatePercent(
  cashbackVnd: number,
  priceVnd: number,
): number {
  if (priceVnd <= 0) {
    return 0;
  }

  return Math.round(
    (cashbackVnd / priceVnd) * Number(BASIS_POINTS),
  ) / 100;
}

function isTimeoutError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    (
      error.name === "AbortError" ||
      error.name === "TimeoutError"
    )
  );
}

async function requestProductData(
  canonicalUrl: string,
): Promise<unknown> {
  const requestUrl = new URL(
    PRODUCT_DATA_ENDPOINT,
  );

  requestUrl.searchParams.set(
    "url",
    canonicalUrl,
  );

  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(
        REQUEST_TIMEOUT_MS,
      ),
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Vaffiliate/1.0 Product Preview",
      },
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new ShopeeProductPreviewServiceError(
        "request_timeout",
        "Shopee product data request timed out",
      );
    }

    throw new ShopeeProductPreviewServiceError(
      "service_unavailable",
      "Shopee product data service is unavailable",
    );
  }

  if (!response.ok) {
    await response.body?.cancel();

    throw new ShopeeProductPreviewServiceError(
      "service_unavailable",
      "Shopee product data service returned an error",
    );
  }

  try {
    return await response.json();
  } catch {
    throw new ShopeeProductPreviewServiceError(
      "invalid_response",
      "Shopee product data response is invalid",
    );
  }
}

function parseProductPreview(
  payload: unknown,
  expectedShopId: string,
  expectedItemId: string,
  canonicalUrl: string,
): ShopeeProductPreview {
  if (!isRecord(payload)) {
    throw new ShopeeProductPreviewServiceError(
      "invalid_response",
      "Shopee product data response is invalid",
    );
  }

  if (payload.status !== "success") {
    throw new ShopeeProductPreviewServiceError(
      "service_unavailable",
      "Shopee product data service did not return a successful result",
    );
  }

  const productInfo = payload.productInfo;

  if (!isRecord(productInfo)) {
    throw new ShopeeProductPreviewServiceError(
      "invalid_response",
      "Shopee product information is missing",
    );
  }

  const dataSource =
    readRequiredString(productInfo.dataSource);

    if (
      dataSource !== "api" &&
      dataSource !== "db"
    ) {
      throw new ShopeeProductPreviewServiceError(
        "product_not_found",
        "Shopee product information could not be retrieved",
      );
    }

  const itemId =
    readRequiredString(productInfo.itemId);
  const productName =
    readRequiredString(productInfo.productName);
  const shopName =
    readNullableString(productInfo.shopName);
  const imageUrl =
    readNullableString(productInfo.imageUrl);

  const priceVnd =
    readNonNegativeInteger(productInfo.price);
  const sales =
    readNullableNonNegativeInteger(
      productInfo.sales,
    );
  const rating =
    readFiniteNumber(productInfo.rating);

  const estimatedCommissionVnd =
    readNonNegativeInteger(
      productInfo.commission,
    );
  const sellerCommissionVnd =
    readNonNegativeInteger(
      productInfo.sellerComFinal,
    );
  const shopeeCommissionVnd =
    readNonNegativeInteger(
      productInfo.shopeeComFinal,
    );

  if (
    !itemId ||
    itemId !== expectedItemId ||
    !productName ||
    priceVnd === null ||
    priceVnd <= 0 ||
    estimatedCommissionVnd === null ||
    sellerCommissionVnd === null ||
    shopeeCommissionVnd === null
  ) {
    throw new ShopeeProductPreviewServiceError(
      "invalid_response",
      "Shopee product data is incomplete",
    );
  }

  if (estimatedCommissionVnd <= 0) {
    throw new ShopeeProductPreviewServiceError(
      "commission_unavailable",
      "Shopee commission is unavailable for this product",
    );
  }

  const { userCashback: estimatedCashbackVnd } =
    calculateCashbackAllocation({
      networkCommission: estimatedCommissionVnd,
      cashbackShareBps:
        SHOPEE_PREVIEW_DEFAULT_CASHBACK_SHARE_BPS,
    });

  const rawCap =
    readNullableNonNegativeInteger(
      productInfo.capAfterRate,
    ) ??
    readNullableNonNegativeInteger(
      productInfo.cap,
    );

  const commissionCapVnd =
    rawCap !== null && rawCap > 0
      ? rawCap
      : null;

  return {
    platform: "shopee",

    shopId: expectedShopId,
    itemId,

    productUrl: canonicalUrl,
    productName,
    shopName,
    imageUrl,

    priceVnd,
    sales,
    rating,

    estimatedCommissionVnd,
    sellerCommissionVnd,
    shopeeCommissionVnd,

    cashbackShareBps:
      SHOPEE_PREVIEW_DEFAULT_CASHBACK_SHARE_BPS,
    estimatedCashbackVnd,
    estimatedCashbackRatePercent:
      calculateCashbackRatePercent(
        estimatedCashbackVnd,
        priceVnd,
      ),

    isXtra: readBoolean(
      productInfo.isXtra,
    ),
    isCapped: readBoolean(
      productInfo.isCapped,
    ),
    commissionCapVnd,

    partnerDataUpdatedAt:
      readNullableString(
        productInfo.lastUpdate,
      ),
    fetchedAt: new Date().toISOString(),
    dataSource,
  };
}

export async function getShopeeProductPreview(
  inputUrl: string,
): Promise<ShopeeProductPreview> {
  const identity =
    await resolveShopeeProductUrl(inputUrl);

  const payload = await requestProductData(
    identity.canonicalUrl,
  );

  return parseProductPreview(
    payload,
    identity.shopId,
    identity.itemId,
    identity.canonicalUrl,
  );
}