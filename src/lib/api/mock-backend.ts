import { API_ENDPOINTS } from "@/lib/constants/api";
import {
  advertisers,
  campaigns,
  cashbackHistory,
  cashbackPlatforms,
  campaignDetails,
  clicks,
  conversions,
  dashboardSummary,
  financeSummary,
  financeTransactions,
  heroPreview,
  homeFeatures,
  homeMetrics,
  joinedOfferIds,
  moreMenuItems,
  notifications,
  offers,
  orderFilters,
  popularOffers,
  publisherProfile,
  quickActions,
  recentOrders,
  trackingLinkStats,
  trackingLinks,
} from "@/lib/mock";
import { offerDestinationUrls, offerRequirements, offerTrackingRules } from "@/lib/mock/affiliate";
import { getMockProfile, updateMockPayoutAccount, updateMockProfile } from "@/lib/mock/profile-store";
import type { CampaignDetail } from "@/types/affiliate";

type MockHandler = () => unknown;

const exactHandlers: Record<string, MockHandler> = {
  [API_ENDPOINTS.DASHBOARD.SUMMARY]: () => dashboardSummary,
  [API_ENDPOINTS.DASHBOARD.METRICS]: () => homeMetrics,
  [API_ENDPOINTS.DASHBOARD.FEATURES]: () => homeFeatures,
  [API_ENDPOINTS.DASHBOARD.HERO]: () => heroPreview,
  [API_ENDPOINTS.DASHBOARD.QUICK_ACTIONS]: () => quickActions,
  [API_ENDPOINTS.DASHBOARD.POPULAR_OFFERS]: () => popularOffers,
  [API_ENDPOINTS.CASHBACK.PLATFORMS]: () => cashbackPlatforms,
  [API_ENDPOINTS.CASHBACK.HISTORY]: () => cashbackHistory,
  [API_ENDPOINTS.ORDERS.LIST]: () => recentOrders,
  [API_ENDPOINTS.ORDERS.FILTERS]: () => orderFilters,
  [API_ENDPOINTS.FINANCE.SUMMARY]: () => financeSummary,
  [API_ENDPOINTS.FINANCE.TRANSACTIONS]: () => financeTransactions,
  [API_ENDPOINTS.USER.MORE_MENU]: () => moreMenuItems,
  [API_ENDPOINTS.AFFILIATE.ADVERTISERS]: () => advertisers,
  [API_ENDPOINTS.AFFILIATE.CAMPAIGNS]: () => campaigns,
  [API_ENDPOINTS.AFFILIATE.OFFERS]: () => offers,
  [API_ENDPOINTS.AFFILIATE.TRACKING_LINKS]: () => trackingLinks,
  [API_ENDPOINTS.AFFILIATE.CONVERSIONS]: () => conversions,
  [API_ENDPOINTS.AFFILIATE.JOINED_OFFERS]: () => joinedOfferIds,
  [API_ENDPOINTS.AFFILIATE.PUBLISHER_PROFILE]: () => publisherProfile,
  [API_ENDPOINTS.AFFILIATE.TRACKING_LINK_STATS]: () => trackingLinkStats,
  [API_ENDPOINTS.AFFILIATE.OFFER_DESTINATION_URLS]: () => offerDestinationUrls,
  [API_ENDPOINTS.AFFILIATE.OFFER_REQUIREMENTS]: () => offerRequirements,
  [API_ENDPOINTS.AFFILIATE.OFFER_TRACKING_RULES]: () => offerTrackingRules,
  [API_ENDPOINTS.NOTIFICATION.LIST]: () => notifications,
  [API_ENDPOINTS.CLICK.LIST]: () => clicks,
  [API_ENDPOINTS.PROFILE.DETAIL]: () => getMockProfile(),
  [API_ENDPOINTS.PROFILE.PAYOUT_ACCOUNT]: () => getMockProfile().payoutAccount,
  [API_ENDPOINTS.PROFILE.UPDATE]: () => updateMockProfile({} as never),
  [API_ENDPOINTS.PROFILE.PAYOUT_UPDATE]: () => updateMockPayoutAccount({} as never),
};

type RoutePattern = {
  prefix: string;
  paramName: string;
  build: (campaignId: string) => MockHandler;
};

const parameterizedRoutes: RoutePattern[] = [
  {
    prefix: API_ENDPOINTS.AFFILIATE.CAMPAIGN_DETAIL,
    paramName: "campaignId",
    build: (campaignId) => () => {
      const detail = (campaignDetails as Record<string, CampaignDetail>)[campaignId];
      if (!detail) {
        throw new Error(`No campaign detail for id: ${campaignId}`);
      }
      return detail;
    },
  },
  {
    prefix: API_ENDPOINTS.AFFILIATE.CAMPAIGN_STATISTICS,
    paramName: "campaignId",
    build: (campaignId) => () => {
      const detail = (campaignDetails as Record<string, CampaignDetail>)[campaignId];
      if (!detail) {
        throw new Error(`No campaign statistics for id: ${campaignId}`);
      }
      return detail.statistics;
    },
  },
];

function resolveParameterizedRoute(endpoint: string): MockHandler | undefined {
  for (const route of parameterizedRoutes) {
    if (!endpoint.startsWith(`${route.prefix}/`)) continue;
    const value = endpoint.slice(route.prefix.length + 1);
    if (!value) continue;
    return route.build(value);
  }
  return undefined;
}

export function resolveMockEndpoint(endpoint: string): unknown {
  const exact = exactHandlers[endpoint];
  if (exact) return exact();

  const parameterized = resolveParameterizedRoute(endpoint);
  if (parameterized) return parameterized();

  throw new Error(`No mock backend handler for endpoint: ${endpoint}`);
}
