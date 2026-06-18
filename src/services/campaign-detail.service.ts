import {
  getCampaignDetailAsync,
  getCampaignStatisticsAsync,
} from "@/repositories/campaign-detail.repository";
import type { ApiResponse } from "@/types/api";
import type { CampaignDetail, CampaignStatistic } from "@/types/affiliate";

export function getCampaignDetailServiceAsync(
  campaignId: string,
): Promise<ApiResponse<CampaignDetail>> {
  return getCampaignDetailAsync(campaignId);
}

export function getCampaignStatisticsServiceAsync(
  campaignId: string,
): Promise<ApiResponse<CampaignStatistic[]>> {
  return getCampaignStatisticsAsync(campaignId);
}
