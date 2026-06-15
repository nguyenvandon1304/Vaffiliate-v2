import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse } from "@/types/api";
import type {
  Advertiser,
  AffiliateData,
  Campaign,
  Conversion,
  Offer,
  TrackingLink,
} from "@/types/affiliate";

export async function getAffiliateDataAsync(): Promise<ApiResponse<AffiliateData>> {
  const [advertisers, campaigns, offers, trackingLinks, conversions] = await Promise.all([
    apiClient.get<Advertiser[]>(API_ENDPOINTS.AFFILIATE.ADVERTISERS),
    apiClient.get<Campaign[]>(API_ENDPOINTS.AFFILIATE.CAMPAIGNS),
    apiClient.get<Offer[]>(API_ENDPOINTS.AFFILIATE.OFFERS),
    apiClient.get<TrackingLink[]>(API_ENDPOINTS.AFFILIATE.TRACKING_LINKS),
    apiClient.get<Conversion[]>(API_ENDPOINTS.AFFILIATE.CONVERSIONS),
  ]);
  return {
    success: true,
    data: {
      advertisers: advertisers.data,
      campaigns: campaigns.data,
      offers: offers.data,
      trackingLinks: trackingLinks.data,
      conversions: conversions.data,
    },
  };
}
