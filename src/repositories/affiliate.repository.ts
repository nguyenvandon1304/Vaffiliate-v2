import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse } from "@/types/api";
import type {
  Advertiser,
  AffiliateData,
  Campaign,
  Conversion,
  Offer,
  OfferId,
  TrackingLink,
  TrackingLinkStatsMap,
} from "@/types/affiliate";
import type { PublisherProfile } from "@/types/publisher";

export async function getAffiliateDataAsync(): Promise<ApiResponse<AffiliateData>> {
  const [
    advertisers,
    campaigns,
    offers,
    trackingLinks,
    conversions,
    joinedOfferIds,
    publisherProfile,
    trackingLinkStats,
  ] = await Promise.all([
    apiClient.get<Advertiser[]>(API_ENDPOINTS.AFFILIATE.ADVERTISERS),
    apiClient.get<Campaign[]>(API_ENDPOINTS.AFFILIATE.CAMPAIGNS),
    apiClient.get<Offer[]>(API_ENDPOINTS.AFFILIATE.OFFERS),
    apiClient.get<TrackingLink[]>(API_ENDPOINTS.AFFILIATE.TRACKING_LINKS),
    apiClient.get<Conversion[]>(API_ENDPOINTS.AFFILIATE.CONVERSIONS),
    apiClient.get<OfferId[]>(API_ENDPOINTS.AFFILIATE.JOINED_OFFERS),
    apiClient.get<PublisherProfile>(API_ENDPOINTS.AFFILIATE.PUBLISHER_PROFILE),
    apiClient.get<TrackingLinkStatsMap>(API_ENDPOINTS.AFFILIATE.TRACKING_LINK_STATS),
  ]);
  return {
    success: true,
    data: {
      advertisers: advertisers.data,
      campaigns: campaigns.data,
      offers: offers.data,
      trackingLinks: trackingLinks.data,
      conversions: conversions.data,
      joinedOfferIds: joinedOfferIds.data,
      publisherProfile: publisherProfile.data,
      trackingLinkStats: trackingLinkStats.data,
    },
  };
}
