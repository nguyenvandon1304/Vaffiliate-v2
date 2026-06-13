import { dashboardService } from "@/services/dashboard.service";

export function useDashboard() {
  return dashboardService.getDashboardData();
}
