import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/constants/api";
import type { ApiResponse } from "@/types/api";
import type { CampaignDetail, CampaignStatistic } from "@/types/affiliate";

export async function getCampaignDetailAsync(
  campaignId: string,
): Promise<ApiResponse<CampaignDetail>> {
  return apiClient.get<CampaignDetail>(
    `${API_ENDPOINTS.AFFILIATE.CAMPAIGN_DETAIL}/${encodeURIComponent(campaignId)}`,
  );
}

export async function getCampaignStatisticsAsync(
  campaignId: string,
): Promise<ApiResponse<CampaignStatistic[]>> {
  return apiClient.get<CampaignStatistic[]>(
    `${API_ENDPOINTS.AFFILIATE.CAMPAIGN_STATISTICS}/${encodeURIComponent(campaignId)}`,
  );
}
