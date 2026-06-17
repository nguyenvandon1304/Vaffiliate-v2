import { getDashboardDataServiceAsync } from "@/services/dashboard.service";
import type { DashboardData } from "@/types/dashboard";

export async function loadDashboardAsync(): Promise<DashboardData> {
  const response = await getDashboardDataServiceAsync();
  return response.data;
}
