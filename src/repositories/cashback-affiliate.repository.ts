import "server-only";

import {
  and,
  eq,
} from "drizzle-orm";

import { db } from "@/db/client";
import { trackingLinks } from "@/db/schema";
import {
  verifyShopeeAffiliateUrl,
} from "@/lib/cashback/shopee-affiliate-url";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CashbackAffiliateTrackingLinkNotFoundError
  extends Error {
  constructor() {
    super(
      "Cashback tracking link was not found",
    );

    this.name =
      "CashbackAffiliateTrackingLinkNotFoundError";
  }
}

export class CashbackAffiliatePlatformError
  extends Error {
  constructor() {
    super(
      "Affiliate URL provisioning is only supported for Shopee",
    );

    this.name =
      "CashbackAffiliatePlatformError";
  }
}

export interface ProvisionedShopeeAffiliateUrl {
  trackingLinkId: string;
  affiliateUrl: string;
  resolvedUrl: string;
  networkSubId: string;
  accountId: string;
}

export async function provisionShopeeAffiliateUrlAsync(
  publisherId: string,
  trackingLinkId: string,
  affiliateUrl: string,
): Promise<ProvisionedShopeeAffiliateUrl> {
  const normalizedPublisherId =
    publisherId.trim();

  const normalizedTrackingLinkId =
    trackingLinkId.trim();

  if (
    !uuidPattern.test(
      normalizedPublisherId,
    ) ||
    !uuidPattern.test(
      normalizedTrackingLinkId,
    )
  ) {
    throw new CashbackAffiliateTrackingLinkNotFoundError();
  }

  const [trackingLink] = await db
    .select({
      id: trackingLinks.id,
      platform: trackingLinks.platform,
      networkSubId:
        trackingLinks.networkSubId,
    })
    .from(trackingLinks)
    .where(
      and(
        eq(
          trackingLinks.id,
          normalizedTrackingLinkId,
        ),
        eq(
          trackingLinks.publisherId,
          normalizedPublisherId,
        ),
      ),
    )
    .limit(1);

  if (!trackingLink) {
    throw new CashbackAffiliateTrackingLinkNotFoundError();
  }

  if (trackingLink.platform !== "shopee") {
    throw new CashbackAffiliatePlatformError();
  }

  const verified =
    await verifyShopeeAffiliateUrl(
      affiliateUrl,
      trackingLink.networkSubId,
    );

  const [updatedTrackingLink] = await db
    .update(trackingLinks)
    .set({
      affiliateUrl:
        verified.affiliateUrl,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(
          trackingLinks.id,
          trackingLink.id,
        ),
        eq(
          trackingLinks.publisherId,
          normalizedPublisherId,
        ),
        eq(
          trackingLinks.platform,
          "shopee",
        ),
        eq(
          trackingLinks.networkSubId,
          trackingLink.networkSubId,
        ),
      ),
    )
    .returning({
      id: trackingLinks.id,
      affiliateUrl:
        trackingLinks.affiliateUrl,
      networkSubId:
        trackingLinks.networkSubId,
    });

  if (
    !updatedTrackingLink ||
    !updatedTrackingLink.affiliateUrl
  ) {
    throw new CashbackAffiliateTrackingLinkNotFoundError();
  }


  return {
    trackingLinkId:
      updatedTrackingLink.id,
    affiliateUrl:
      updatedTrackingLink.affiliateUrl,
    resolvedUrl:
      verified.resolvedUrl,
    networkSubId:
      updatedTrackingLink.networkSubId,
    accountId:
      verified.accountId,
  };
}
