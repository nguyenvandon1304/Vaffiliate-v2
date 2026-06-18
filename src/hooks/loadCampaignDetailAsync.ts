import {
  getCampaignDetailServiceAsync,
  getCampaignStatisticsServiceAsync,
} from "@/services/campaign-detail.service";
import type { CampaignDetail, CampaignStatistic } from "@/types/affiliate";

export async function loadCampaignDetailAsync(campaignId: string): Promise<{
  campaignDetail: CampaignDetail;
  statistics: CampaignStatistic[];
}> {
  const [detailResponse, statisticsResponse] = await Promise.all([
    getCampaignDetailServiceAsync(campaignId),
    getCampaignStatisticsServiceAsync(campaignId),
  ]);

  return {
    campaignDetail: detailResponse.data,
    statistics: statisticsResponse.data,
  };
}
