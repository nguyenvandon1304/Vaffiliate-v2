import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse, ApiResult } from "@/types/api";
import type {
  Advertiser,
  AffiliateData,
  Campaign,
  Conversion,
  Offer,
  OfferDetailData,
  OfferJoinStatus,
  OfferRequirement,
  OfferTrackingRules,
  TrackingLink,
  TrackingLinkGeneratorData,
  TrackingLinkStatsMap,
} from "@/types/affiliate";
import type { OfferId } from "@/types/ids";
import type { PublisherProfile } from "@/types/publisher";

export async function getAffiliateDataAsync(): Promise<
  ApiResponse<AffiliateData>
> {
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
    apiClient.get<Advertiser[]>(
      API_ENDPOINTS.AFFILIATE.ADVERTISERS,
    ),
    apiClient.get<Campaign[]>(
      API_ENDPOINTS.AFFILIATE.CAMPAIGNS,
    ),
    apiClient.get<Offer[]>(
      API_ENDPOINTS.AFFILIATE.OFFERS,
    ),
    apiClient.get<TrackingLink[]>(
      API_ENDPOINTS.AFFILIATE.TRACKING_LINKS,
    ),
    apiClient.get<Conversion[]>(
      API_ENDPOINTS.AFFILIATE.CONVERSIONS,
    ),
    apiClient.get<OfferId[]>(
      API_ENDPOINTS.AFFILIATE.JOINED_OFFERS,
    ),
    apiClient.get<PublisherProfile>(
      API_ENDPOINTS.AFFILIATE.PUBLISHER_PROFILE,
    ),
    apiClient.get<TrackingLinkStatsMap>(
      API_ENDPOINTS.AFFILIATE.TRACKING_LINK_STATS,
    ),
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

export async function getTrackingLinkGeneratorContextAsync(
  offerId: OfferId,
): Promise<ApiResult<TrackingLinkGeneratorData>> {
  const [affiliate, defaultDestinations] = await Promise.all([
    getAffiliateDataAsync(),
    apiClient.get<Record<OfferId, string>>(
      API_ENDPOINTS.AFFILIATE.OFFER_DESTINATION_URLS,
    ),
  ]);

  const {
    offers,
    campaigns,
    advertisers,
    trackingLinks,
  } = affiliate.data;

  const offer = offers.find((item) => item.id === offerId);

  if (!offer) {
    return {
      success: false,
      error: "Offer not found",
    };
  }

  const campaign = campaigns.find(
    (item) => item.id === offer.campaignId,
  );

  if (!campaign) {
    return {
      success: false,
      error: "Campaign not found",
    };
  }

  const advertiser = advertisers.find(
    (item) => item.id === campaign.advertiserId,
  );

  if (!advertiser) {
    return {
      success: false,
      error: "Advertiser not found",
    };
  }

  const existingLink =
    trackingLinks.find((item) => item.offerId === offerId) ??
    null;

  return {
    success: true,
    data: {
      offer,
      campaign,
      advertiser,
      existingLink,
      defaultDestinationUrl:
        defaultDestinations.data[offerId] ??
        "https://vaffiliate.vn",
    },
  };
}

export async function getOfferDetailContextAsync(
  offerId: OfferId,
): Promise<ApiResult<OfferDetailData>> {
  const [
    affiliate,
    defaultDestinations,
    requirementsMap,
    trackingRulesMap,
  ] = await Promise.all([
    getAffiliateDataAsync(),
    apiClient.get<Record<OfferId, string>>(
      API_ENDPOINTS.AFFILIATE.OFFER_DESTINATION_URLS,
    ),
    apiClient.get<Record<OfferId, OfferRequirement[]>>(
      API_ENDPOINTS.AFFILIATE.OFFER_REQUIREMENTS,
    ),
    apiClient.get<Record<OfferId, OfferTrackingRules>>(
      API_ENDPOINTS.AFFILIATE.OFFER_TRACKING_RULES,
    ),
  ]);

  const {
    offers,
    campaigns,
    advertisers,
    joinedOfferIds,
  } = affiliate.data;

  const offer = offers.find((item) => item.id === offerId);

  if (!offer) {
    return {
      success: false,
      error: "Offer not found",
    };
  }

  const campaign = campaigns.find(
    (item) => item.id === offer.campaignId,
  );

  if (!campaign) {
    return {
      success: false,
      error: "Campaign not found",
    };
  }

  const advertiser = advertisers.find(
    (item) => item.id === campaign.advertiserId,
  );

  if (!advertiser) {
    return {
      success: false,
      error: "Advertiser not found",
    };
  }

  const joinStatus: OfferJoinStatus =
    joinedOfferIds.includes(offerId)
      ? campaign.status === "paused"
        ? "paused"
        : "joined"
      : "not_joined";

  return {
    success: true,
    data: {
      offer,
      campaign,
      advertiser,
      joinStatus,
      requirements: requirementsMap.data[offerId] ?? [],
      trackingRules: trackingRulesMap.data[offerId] ?? {
        cookieDurationDays: 0,
        allowedChannels: [],
        trafficRules: [],
      },
      defaultDestinationUrl:
        defaultDestinations.data[offerId] ??
        "https://vaffiliate.vn",
    },
  };
}
