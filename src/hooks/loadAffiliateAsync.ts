import {
  getAffiliateDataServiceAsync,
  getOfferDetailContextServiceAsync,
  getTrackingLinkGeneratorContextServiceAsync,
} from "@/services/affiliate.service";
import type {
  AffiliateData,
  OfferDetailData,
  TrackingLinkGeneratorData,
} from "@/types/affiliate";
import type { OfferId } from "@/types/ids";

export async function loadAffiliateAsync(): Promise<AffiliateData> {
  const response = await getAffiliateDataServiceAsync();
  return response.data;
}

export async function loadTrackingLinkGeneratorContextAsync(
  offerId: OfferId,
): Promise<TrackingLinkGeneratorData> {
  const response =
    await getTrackingLinkGeneratorContextServiceAsync(offerId);

  if (!response.success) {
    throw new Error(response.error);
  }

  return response.data;
}

export async function loadOfferDetailContextAsync(
  offerId: OfferId,
): Promise<OfferDetailData> {
  const response =
    await getOfferDetailContextServiceAsync(offerId);

  if (!response.success) {
    throw new Error(response.error);
  }

  return response.data;
}
