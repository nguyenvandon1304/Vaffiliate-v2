import { API_ENDPOINTS } from "@/lib/constants/api";
import { dashboardSummary, homeFeatures, homeMetrics, heroPreview, quickActions } from "@/lib/mock";
import type { DashboardData } from "@/types/dashboard";
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
