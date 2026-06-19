import {
  getAffiliateDataAsync,
  getOfferDetailContextAsync,
  getTrackingLinkGeneratorContextAsync,
} from "@/repositories/affiliate.repository";
import type { ApiResponse, ApiResult } from "@/types/api";
import type {
  AffiliateData,
  OfferDetailData,
  TrackingLinkGeneratorData,
} from "@/types/affiliate";
import type { OfferId } from "@/types/ids";

export const affiliateService = {
  getAffiliateDataAsync,
};

export function getAffiliateDataServiceAsync(): Promise<
  ApiResponse<AffiliateData>
> {
  return getAffiliateDataAsync();
}

export function getTrackingLinkGeneratorContextServiceAsync(
  offerId: OfferId,
): Promise<ApiResult<TrackingLinkGeneratorData>> {
  return getTrackingLinkGeneratorContextAsync(offerId);
}

export function getOfferDetailContextServiceAsync(
  offerId: OfferId,
): Promise<ApiResult<OfferDetailData>> {
  return getOfferDetailContextAsync(offerId);
}
