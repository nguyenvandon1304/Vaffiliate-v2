/**
 * Phase 20H.7a -- classify-on-purchase ordering helper.
 *
 * Hard invariant: an eligible Shopee cashback purchase flow MUST
 * resolve a generic Shopee offer AND classify the tracking link
 * BEFORE persisting a purchase intent with status =
 * redirect_prepared. Missing catalog or classification failure
 * aborts with a safe Vietnamese copy.
 */

import {
  resolveGenericShopeeCashbackOfferAsync,
  type GenericShopeeCashbackOfferResolution,
} from "@/services/shopee-generic-cashback.service";

import {
  classifyShopeeTrackingLinkAsync,
} from "@/repositories/affiliate-catalog.repository";

export const CLASSIFY_ON_PURCHASE_FAILURE_COPY =
  "Hiện chưa thể tạo link hoàn tiền cho sản phẩm này. Vui lòng thử lại sau.";

export type ClassifyOnPurchaseSuccess = {
  readonly ok: true;
  readonly campaignId: string;
  readonly offerId: string;
};

export type ClassifyOnPurchaseFailure = {
  readonly ok: false;
  readonly message: string;
  readonly reason:
    | "generic_offer_unavailable"
    | "generic_offer_resolver_threw"
    | "classify_threw";
};

export type ClassifyOnPurchaseOutcome =
  | ClassifyOnPurchaseSuccess
  | ClassifyOnPurchaseFailure;

export interface ClassifyOnPurchaseDependencies {
  readonly resolveGenericOffer?: () => Promise<
    GenericShopeeCashbackOfferResolution
  >;
  readonly classifyLink?: (input: {
    readonly publisherId: string;
    readonly trackingLinkId: string;
    readonly offerId: string;
  }) => Promise<{ ok: true } | { ok: false; error: Error }>;
}

export async function classifyOnPurchaseAsync(args: {
  readonly publisherId: string;
  readonly trackingLinkId: string;
  readonly dependencies?: ClassifyOnPurchaseDependencies;
}): Promise<ClassifyOnPurchaseOutcome> {
  const resolveGenericOffer =
    args.dependencies?.resolveGenericOffer ??
    (() => resolveGenericShopeeCashbackOfferAsync({
      publisherId: args.publisherId,
    }));

  let resolution: GenericShopeeCashbackOfferResolution;
  try {
    resolution = await resolveGenericOffer();
  } catch {
    return {
      ok: false,
      message: CLASSIFY_ON_PURCHASE_FAILURE_COPY,
      reason: "generic_offer_resolver_threw",
    };
  }

  if (resolution.kind !== "available") {
    return {
      ok: false,
      message: CLASSIFY_ON_PURCHASE_FAILURE_COPY,
      reason: "generic_offer_unavailable",
    };
  }

  const classifyLink =
    args.dependencies?.classifyLink ??
    (() => classifyShopeeTrackingLinkAsync({
      publisherId: args.publisherId,
      trackingLinkId: args.trackingLinkId,
      offerId: resolution.offerId,
    }).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error : new Error(String(error)),
      }),
    ));

  const classifyOutcome = await classifyLink({
    publisherId: args.publisherId,
    trackingLinkId: args.trackingLinkId,
    offerId: resolution.offerId,
  });

  if (!classifyOutcome.ok) {
    return {
      ok: false,
      message: CLASSIFY_ON_PURCHASE_FAILURE_COPY,
      reason: "classify_threw",
    };
  }

  return {
    ok: true,
    campaignId: resolution.campaignId,
    offerId: resolution.offerId,
  };
}
