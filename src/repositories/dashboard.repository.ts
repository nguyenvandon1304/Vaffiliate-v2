import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import { dashboardSummary, homeFeatures, homeMetrics, heroPreview, quickActions } from "@/lib/mock";
import type { ApiResponse } from "@/types/api";
import type {
  DashboardData,
  DashboardSummary,
  HeroPreview,
  HomeFeature,
  HomeMetric,
  QuickAction,
} from "@/types/dashboard";
import type { RecentOrder } from "@/types/orders";
import { recentOrders } from "@/lib/mock";

export function getDashboardSummary() {
  void API_ENDPOINTS.DASHBOARD.SUMMARY;
  return dashboardSummary;
}

export function getHomeMetrics() {
  void API_ENDPOINTS.DASHBOARD.METRICS;
  return homeMetrics;
}

export function getHomeFeatures() {
  void API_ENDPOINTS.DASHBOARD.FEATURES;
  return homeFeatures;
}

export function getHeroPreview() {
  void API_ENDPOINTS.DASHBOARD.HERO;
  return heroPreview;
}

export function getQuickActions() {
  void API_ENDPOINTS.DASHBOARD.QUICK_ACTIONS;
  return quickActions;
}

export function getDashboardData(): DashboardData {
  const summary = getDashboardSummary();
  return {
    summary,
    metrics: getHomeMetrics(),
    features: getHomeFeatures(),
    hero: getHeroPreview(),
    quickActions: getQuickActions(),
    activePlatforms: summary.activePlatforms,
    upcomingPlatforms: summary.upcomingPlatforms,
    recentOrders,
  };
}

export async function getDashboardDataAsync(): Promise<ApiResponse<DashboardData>> {
  const [summary, metrics, features, hero, quickActions, orders] = await Promise.all([
    apiClient.get<DashboardSummary>(API_ENDPOINTS.DASHBOARD.SUMMARY),
    apiClient.get<HomeMetric[]>(API_ENDPOINTS.DASHBOARD.METRICS),
    apiClient.get<HomeFeature[]>(API_ENDPOINTS.DASHBOARD.FEATURES),
    apiClient.get<HeroPreview>(API_ENDPOINTS.DASHBOARD.HERO),
    apiClient.get<QuickAction[]>(API_ENDPOINTS.DASHBOARD.QUICK_ACTIONS),
    apiClient.get<RecentOrder[]>(API_ENDPOINTS.ORDERS.LIST),
  ]);
  return {
    success: true,
    data: {
      summary: summary.data,
      metrics: metrics.data,
      features: features.data,
      hero: hero.data,
      quickActions: quickActions.data,
      activePlatforms: summary.data.activePlatforms,
      upcomingPlatforms: summary.data.upcomingPlatforms,
      recentOrders: orders.data,
    },
  };
}
