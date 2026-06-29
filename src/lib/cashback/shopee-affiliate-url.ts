import "server-only";

import { getShopeeAffiliateAccountId } from "@/lib/cashback/shopee-affiliate-config";
import { resolveShopeeRedirectUrl } from "@/lib/shopee/redirect-url";

const networkSubIdPattern =
  /^vaflnk[a-f0-9]{24}$/;

export type ShopeeAffiliateUrlErrorCode =
  | "invalid_network_sub_id"
  | "missing_account_attribution"
  | "account_mismatch"
  | "missing_sub_id"
  | "sub_id_mismatch";

export class ShopeeAffiliateUrlError extends Error {
  readonly code: ShopeeAffiliateUrlErrorCode;

  constructor(
    code: ShopeeAffiliateUrlErrorCode,
    message: string,
  ) {
    super(message);

    this.name = "ShopeeAffiliateUrlError";
    this.code = code;
  }
}

export interface VerifiedShopeeAffiliateUrl {
  affiliateUrl: string;
  resolvedUrl: string;
  accountId: string;
  networkSubId: string;
  utmSource: string | null;
  mmpPid: string | null;
  utmContent: string;
}

function readSubId1(
  utmContent: string,
): string {
  const separatorIndex =
    utmContent.indexOf("-");

  if (separatorIndex === -1) {
    return utmContent;
  }

  return utmContent.slice(
    0,
    separatorIndex,
  );
}

export async function verifyShopeeAffiliateUrl(
  affiliateUrl: string,
  expectedNetworkSubId: string,
): Promise<VerifiedShopeeAffiliateUrl> {
  const networkSubId =
    expectedNetworkSubId.trim();

  if (
    !networkSubIdPattern.test(
      networkSubId,
    )
  ) {
    throw new ShopeeAffiliateUrlError(
      "invalid_network_sub_id",
      "Shopee affiliate Sub_id1 is invalid",
    );
  }

  const accountId =
    getShopeeAffiliateAccountId();

  const resolvedUrl =
    await resolveShopeeRedirectUrl(
      affiliateUrl,
    );

  const utmSource =
    resolvedUrl.searchParams.get(
      "utm_source",
    );

  const mmpPid =
    resolvedUrl.searchParams.get(
      "mmp_pid",
    );

  if (!utmSource && !mmpPid) {
    throw new ShopeeAffiliateUrlError(
      "missing_account_attribution",
      "Shopee affiliate URL does not contain account attribution",
    );
  }

  if (
    (utmSource &&
      utmSource !== accountId) ||
    (mmpPid &&
      mmpPid !== accountId)
  ) {
    throw new ShopeeAffiliateUrlError(
      "account_mismatch",
      "Shopee affiliate URL belongs to a different affiliate account",
    );
  }

  const utmContent =
    resolvedUrl.searchParams.get(
      "utm_content",
    );

  if (!utmContent) {
    throw new ShopeeAffiliateUrlError(
      "missing_sub_id",
      "Shopee affiliate URL does not contain Sub_id1",
    );
  }

  if (
    readSubId1(utmContent) !==
    networkSubId
  ) {
    throw new ShopeeAffiliateUrlError(
      "sub_id_mismatch",
      "Shopee affiliate URL contains an unexpected Sub_id1",
    );
  }

  return {
    affiliateUrl: affiliateUrl.trim(),
    resolvedUrl:
      resolvedUrl.toString(),
    accountId,
    networkSubId,
    utmSource,
    mmpPid,
    utmContent,
  };
}
