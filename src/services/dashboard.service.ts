import { getDashboardData, getDashboardDataAsync, getDashboardSummary, getHomeFeatures, getHomeMetrics, getHeroPreview, getQuickActions } from "@/repositories/dashboard.repository";
import type { ApiResponse } from "@/types/api";
import type { DashboardData } from "@/types/dashboard";

export const dashboardService = {
  getDashboardSummary,
  getHomeMetrics,
  getHomeFeatures,
  getHeroPreview,
  getQuickActions,
  getDashboardData,
  getDashboardDataAsync,
};

export function getDashboardDataService(): DashboardData {
  return getDashboardData();
}

export function getDashboardDataServiceAsync(): Promise<ApiResponse<DashboardData>> {
  return getDashboardDataAsync();
}
