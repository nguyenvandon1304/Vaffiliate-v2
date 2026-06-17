import { getDashboardDataAsync } from "@/repositories/dashboard.repository";
import type { ApiResponse } from "@/types/api";
import type { DashboardData } from "@/types/dashboard";

export function getDashboardDataServiceAsync(): Promise<ApiResponse<DashboardData>> {
  return getDashboardDataAsync();
}
