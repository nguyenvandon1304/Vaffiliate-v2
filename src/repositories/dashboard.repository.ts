import { API_ENDPOINTS } from "@/lib/constants/api";
import { dashboardSummary, homeFeatures, homeMetrics, heroPreview, quickActions } from "@/lib/mock";

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
