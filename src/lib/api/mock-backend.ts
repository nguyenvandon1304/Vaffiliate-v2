import { API_ENDPOINTS } from "@/lib/constants/api";
import {
  advertisers,
  campaigns,
  cashbackHistory,
  cashbackPlatforms,
  clicks,
  conversions,
  dashboardSummary,
  financeSummary,
  financeTransactions,
  heroPreview,
  homeFeatures,
  homeMetrics,
  moreMenuItems,
  notifications,
  offers,
  orderFilters,
  quickActions,
  recentOrders,
  trackingLinks,
} from "@/lib/mock";
import { getMockProfile, updateMockPayoutAccount, updateMockProfile } from "@/lib/mock/profile-store";

const backend: Record<string, () => unknown> = {
  [API_ENDPOINTS.DASHBOARD.SUMMARY]: () => dashboardSummary,
  [API_ENDPOINTS.DASHBOARD.METRICS]: () => homeMetrics,
  [API_ENDPOINTS.DASHBOARD.FEATURES]: () => homeFeatures,
  [API_ENDPOINTS.DASHBOARD.HERO]: () => heroPreview,
  [API_ENDPOINTS.DASHBOARD.QUICK_ACTIONS]: () => quickActions,
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
  [API_ENDPOINTS.NOTIFICATION.LIST]: () => notifications,
  [API_ENDPOINTS.CLICK.LIST]: () => clicks,
  [API_ENDPOINTS.PROFILE.DETAIL]: () => getMockProfile(),
  [API_ENDPOINTS.PROFILE.PAYOUT_ACCOUNT]: () => getMockProfile().payoutAccount,
  [API_ENDPOINTS.PROFILE.UPDATE]: (body?: unknown) => updateMockProfile(body as never),
  [API_ENDPOINTS.PROFILE.PAYOUT_UPDATE]: (body?: unknown) => updateMockPayoutAccount(body as never),
};

export function resolveMockEndpoint(endpoint: string): unknown {
  const handler = backend[endpoint];
  if (!handler) {
    throw new Error(`No mock backend handler for endpoint: ${endpoint}`);
  }
  return handler();
}
