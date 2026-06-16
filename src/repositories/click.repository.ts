import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse } from "@/types/api";
import type { ClickData, ClickItem } from "@/types/click";

export async function getClickDataAsync(): Promise<ApiResponse<ClickData>> {
  const clicks = await apiClient.get<ClickItem[]>(API_ENDPOINTS.CLICK.LIST);
  return {
    success: true,
    data: {
      clicks: clicks.data,
    },
  };
}
