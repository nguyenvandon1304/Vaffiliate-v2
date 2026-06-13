import { getDashboardData, getDashboardSummary, getHomeFeatures, getHomeMetrics, getHeroPreview, getQuickActions } from "@/repositories/dashboard.repository";
import type { DashboardData } from "@/types/dashboard";

export const dashboardService = {
  getDashboardSummary,
  getHomeMetrics,
  getHomeFeatures,
  getHeroPreview,
  getQuickActions,
  getDashboardData,
};

export function getDashboardDataService(): DashboardData {
  return getDashboardData();
}
